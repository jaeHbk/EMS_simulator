#![allow(
    clippy::unwrap_used,
    clippy::expect_used,
    clippy::panic,
    reason = "Integration test: panics on unexpected failure are the desired signal."
)]
//! End-to-end smoke test: bind the server on an ephemeral port, connect
//! a WebSocket client, assert we receive a `Hello` and at least one
//! `VitalsFrame` within a few seconds.

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

    // 2. At least 5 vitals frames.
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
            frames += 1;
        }
    }

    // 3. Clean close.
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
