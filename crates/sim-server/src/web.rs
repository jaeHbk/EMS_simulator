//! Axum-based HTTP + WebSocket server for the web client.
//!
//! Routes:
//!
//! | Method | Path              | Purpose                                |
//! |--------|-------------------|----------------------------------------|
//! | GET    | `/healthz`        | Liveness check.                        |
//! | GET    | `/api/version`    | Server build info as JSON.             |
//! | GET    | `/api/vitals/ws`  | WebSocket — emits `Hello` then `VitalsFrame`s at 50 Hz. |
//! | GET    | `/*` (fallback)   | Static files from `engine/web/dist` (configurable). |
//!
//! CORS is permissive in development (the Vite dev server runs on a
//! different port). In a production build the static-file fallback serves
//! the same origin, so CORS becomes a no-op.

use crate::sim::SimHandle;
use crate::wire::{Hello, HelloKind, VitalsFrame};
use axum::extract::State;
use axum::extract::ws::{Message, WebSocket, WebSocketUpgrade};
use axum::response::IntoResponse;
use axum::routing::get;
use axum::{Json, Router};
use std::net::SocketAddr;
use std::path::PathBuf;
use std::sync::Arc;
use tokio::sync::broadcast::error::RecvError;
use tower_http::cors::CorsLayer;
use tower_http::services::ServeDir;
use tower_http::trace::TraceLayer;

/// Server-version string burned in at build time.
pub const SERVER_VERSION: &str = concat!(env!("CARGO_PKG_NAME"), " ", env!("CARGO_PKG_VERSION"));

/// Shared state passed to handlers.
#[derive(Clone)]
struct AppState {
    sim: SimHandle,
}

/// Build the axum router for the web client + API.
pub fn router(sim: SimHandle, static_dir: Option<PathBuf>) -> Router {
    let state = Arc::new(AppState { sim });

    let mut app = Router::new()
        .route("/healthz", get(healthz))
        .route("/api/version", get(version))
        .route("/api/vitals/ws", get(vitals_ws))
        .with_state(state)
        .layer(CorsLayer::permissive())
        .layer(TraceLayer::new_for_http());

    if let Some(dir) = static_dir
        && dir.is_dir()
    {
        // index.html falls through to a sensible default if absent.
        let serve = ServeDir::new(&dir).append_index_html_on_directories(true);
        app = app.fallback_service(serve);
    }
    app
}

/// Bind the server on `addr` and run until it terminates.
///
/// # Errors
///
/// Returns any I/O error from binding or accepting connections.
pub async fn serve(addr: SocketAddr, app: Router) -> std::io::Result<()> {
    let listener = tokio::net::TcpListener::bind(addr).await?;
    tracing::info!(%addr, "sim-server listening");
    axum::serve(listener, app).await
}

async fn healthz() -> &'static str {
    "ok"
}

#[derive(serde::Serialize)]
struct VersionResponse<'a> {
    version: &'a str,
    scenario: &'a str,
}

async fn version(State(state): State<Arc<AppState>>) -> Json<VersionResponse<'static>> {
    // Strings are 'static — the scenario is held as Arc<str> on the handle.
    let scenario = Box::leak(state.sim.scenario().to_owned().into_boxed_str());
    Json(VersionResponse {
        version: SERVER_VERSION,
        scenario,
    })
}

async fn vitals_ws(ws: WebSocketUpgrade, State(state): State<Arc<AppState>>) -> impl IntoResponse {
    ws.on_upgrade(move |socket| vitals_ws_loop(socket, state))
}

async fn vitals_ws_loop(mut socket: WebSocket, state: Arc<AppState>) {
    // 1. Send a Hello so clients know the rate and scenario.
    let hello = Hello {
        kind: HelloKind::Hello,
        tick_hz: core_time::TICKS_PER_SECOND,
        server_version: SERVER_VERSION.to_owned(),
        scenario: state.sim.scenario().to_owned(),
    };
    let Ok(hello_text) = serde_json::to_string(&hello) else {
        tracing::error!("failed to serialize Hello");
        return;
    };
    if socket.send(Message::Text(hello_text.into())).await.is_err() {
        return;
    }

    // 2. Send the latest known frame (if any) so reconnecting clients
    //    don't render a blank panel for up to 20 ms.
    if let Some(latest) = state.sim.latest()
        && let Ok(text) = serde_json::to_string(&latest)
        && socket.send(Message::Text(text.into())).await.is_err()
    {
        return;
    }

    // 3. Subscribe and forward.
    let mut rx = state.sim.subscribe();
    loop {
        tokio::select! {
            biased;
            // If the client sends Close, exit promptly.
            client_msg = socket.recv() => {
                match client_msg {
                    Some(Ok(Message::Close(_))) | None => return,
                    Some(Ok(_)) => {}
                    Some(Err(e)) => {
                        tracing::debug!(?e, "websocket recv error");
                        return;
                    }
                }
            }
            frame = rx.recv() => {
                match frame {
                    Ok(f) => {
                        if let Err(e) = send_frame(&mut socket, f).await {
                            tracing::debug!(?e, "websocket send error; closing");
                            return;
                        }
                    }
                    Err(RecvError::Lagged(skipped)) => {
                        tracing::warn!(%skipped, "websocket client lagged; resyncing");
                        // After a Lagged, the receiver continues; the client
                        // will get the next frame in the channel.
                    }
                    Err(RecvError::Closed) => return,
                }
            }
        }
    }
}

async fn send_frame(socket: &mut WebSocket, frame: VitalsFrame) -> Result<(), axum::Error> {
    let text = serde_json::to_string(&frame).map_err(axum::Error::new)?;
    socket.send(Message::Text(text.into())).await
}
