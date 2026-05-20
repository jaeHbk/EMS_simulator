#![allow(
    clippy::unwrap_used,
    clippy::expect_used,
    clippy::panic,
    clippy::too_many_lines,
    clippy::float_cmp,
    reason = "Integration test: panics on unexpected failure are the desired signal; literal-float comparison is intentional for fixed wire values."
)]
//! End-to-end smoke tests:
//! - WebSocket emits `Hello` then `VitalsFrame`s with `interventions` +
//!   `run_state` fields.
//! - `GET /api/scenarios` returns a non-empty list with the expected stub.
//! - `POST /api/actions` returns 202 and the `action_id` echoes back in a
//!   subsequent `VitalsFrame.interventions`.

use futures_util::{SinkExt, StreamExt};
use std::net::{IpAddr, Ipv4Addr, SocketAddr};
use std::path::PathBuf;
use std::time::Duration;

fn fixture_path() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("..")
        .join("..")
        .join("tests")
        .join("physiology-fixtures")
        .join("apnea-nrb.macos-arm64.csv")
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn ws_emits_hello_then_vitals_frames() {
    // We can't easily import the bin's `web` module directly without making
    // it a library, so we spawn the binary as a subprocess. That also
    // exercises the real CLI surface end-to-end.
    let exe = env!("CARGO_BIN_EXE_sim-server");
    let port = pick_free_port();

    let mut child = tokio::process::Command::new(exe)
        .args([
            "--trace",
            fixture_path().to_str().unwrap(),
            "serve",
            "--port",
            &port.to_string(),
            "--host",
            "127.0.0.1",
        ])
        .stdout(std::process::Stdio::null())
        .stderr(std::process::Stdio::null())
        .spawn()
        .expect("spawn sim-server");

    // Wait for /healthz to come up.
    let base = format!("http://127.0.0.1:{port}");
    let client = reqwest::Client::new();
    for _ in 0..50 {
        if client
            .get(format!("{base}/healthz"))
            .timeout(Duration::from_millis(100))
            .send()
            .await
            .is_ok()
        {
            break;
        }
        tokio::time::sleep(Duration::from_millis(100)).await;
    }

    let url = format!("ws://127.0.0.1:{port}/api/vitals/ws");
    let (mut socket, _resp) = tokio_tungstenite::connect_async(&url)
        .await
        .expect("connect ws");

    // 1. Hello.
    let msg = tokio::time::timeout(Duration::from_secs(2), socket.next())
        .await
        .expect("hello timeout")
        .expect("hello stream end")
        .expect("hello error");
    let text = msg.into_text().expect("hello text");
    let hello: serde_json::Value = serde_json::from_str(&text).expect("hello json");
    assert_eq!(hello["type"], "hello");
    assert_eq!(hello["tick_hz"], 50);
    assert!(hello["scenario"].is_string());

    // 2. At least 5 vitals frames; verify wire-format additions.
    let mut frames = 0u32;
    while frames < 5 {
        let msg = tokio::time::timeout(Duration::from_secs(2), socket.next())
            .await
            .expect("frame timeout")
            .expect("frame stream end")
            .expect("frame error");
        let text = msg.into_text().expect("frame text");
        let v: serde_json::Value = serde_json::from_str(&text).expect("frame json");
        if v.get("tick").is_some() {
            assert!(v["heart_rate_bpm"].as_f64().unwrap() > 0.0);
            assert!((0.0..=1.0).contains(&v["spo2_fraction"].as_f64().unwrap()));
            // New fields from the UX-refresh wire additions:
            assert!(v["interventions"].is_array(), "interventions must be array");
            let rs = &v["run_state"];
            assert!(rs.is_object(), "run_state must be object");
            assert_eq!(rs["mode"], "running");
            assert_eq!(rs["rate_multiplier"].as_f64().unwrap(), 1.0);
            frames += 1;
        }
    }

    // 3. GET /api/scenarios returns the stub list.
    let scenarios: serde_json::Value = client
        .get(format!("{base}/api/scenarios"))
        .timeout(Duration::from_secs(2))
        .send()
        .await
        .expect("scenarios send")
        .json()
        .await
        .expect("scenarios json");
    assert!(scenarios.is_array(), "scenarios must be a JSON array");
    let arr = scenarios.as_array().unwrap();
    assert!(!arr.is_empty(), "scenarios must be non-empty");
    let s0 = &arr[0];
    assert!(s0["id"].is_string());
    assert!(s0["name"].is_string());
    assert!(s0["chief_complaint"].is_string());
    assert!(s0["events"].is_array());

    // 4. POST /api/actions; the action_id must echo on a later frame.
    let action_id = "01TESTACTIONABCDEFGHIJKLMN".to_owned();
    let resp = client
        .post(format!("{base}/api/actions"))
        .json(&serde_json::json!({
            "action_id": action_id,
            "action_type": "apply_equipment",
            "params": { "equipment": "nrb", "attach_point": "face", "fio2": 0.85 },
            "client_ts_ms": 0
        }))
        .timeout(Duration::from_secs(2))
        .send()
        .await
        .expect("post action");
    assert_eq!(resp.status().as_u16(), 202);
    let accepted: serde_json::Value = resp.json().await.expect("accepted json");
    assert_eq!(accepted["action_id"], action_id);
    assert!(accepted["accepted_at_tick"].as_u64().is_some());

    // Drain frames for up to 2 s waiting for the echo.
    let mut saw_echo = false;
    let deadline = std::time::Instant::now() + Duration::from_secs(2);
    while std::time::Instant::now() < deadline && !saw_echo {
        let Ok(Some(Ok(msg))) =
            tokio::time::timeout(Duration::from_millis(500), socket.next()).await
        else {
            continue;
        };
        let Ok(text) = msg.into_text() else { continue };
        let Ok(v) = serde_json::from_str::<serde_json::Value>(&text) else {
            continue;
        };
        if let Some(arr) = v["interventions"].as_array()
            && arr
                .iter()
                .any(|x| x == &serde_json::Value::String(action_id.clone()))
        {
            saw_echo = true;
        }
    }
    assert!(saw_echo, "action_id never echoed in interventions");

    // 5. Clean close.
    let _ = socket
        .send(tokio_tungstenite::tungstenite::Message::Close(None))
        .await;
    let _ = child.kill().await;
    let _ = child.wait().await;
}

fn pick_free_port() -> u16 {
    // Bind to port 0 to let the OS choose; capture the port and immediately
    // close the listener so the server can grab it. There's a small race —
    // tolerable for this test.
    let l = std::net::TcpListener::bind(SocketAddr::new(IpAddr::V4(Ipv4Addr::LOCALHOST), 0))
        .expect("bind ephemeral");
    l.local_addr().expect("local_addr").port()
}
