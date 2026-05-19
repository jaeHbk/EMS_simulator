//! `sim-server` — headless simulation entry point.
//!
//! Subcommands:
//!
//! - `tui` — interactive terminal vitals monitor. Useful for quick sanity
//!   checks on a new trace; runs without any web client.
//! - `serve` — HTTP + WebSocket server. Streams [`crate::wire::VitalsFrame`]
//!   at the simulation tick rate (50 Hz). The web client (in `engine/web/`)
//!   connects to this.
//!
//! Both subcommands share the same simulation pipeline: a
//! [`physiology::TraceReplayEngine`] driven by a fixed-step Tokio task that
//! broadcasts every produced frame over a `tokio::sync::broadcast` channel.

#![forbid(unsafe_code)]
// `sim-server` is a binary crate. `pub` items inside its modules are
// "unreachable" by definition (no other crate links to it), so the
// `unreachable_pub` lint produces noise without value here.
#![allow(unreachable_pub)]

mod sim;
mod tui;
mod web;
mod wire;

use clap::{Parser, Subcommand};
use physiology::TraceReplayEngine;
use std::net::{IpAddr, Ipv4Addr, SocketAddr};
use std::path::PathBuf;
use std::process::ExitCode;
use tracing_subscriber::EnvFilter;

/// Shared CLI options.
#[derive(Parser, Debug)]
#[command(name = "sim-server", version, about = "EMS Simulator headless core", long_about = None)]
struct Cli {
    /// Pulse trace CSV to replay. Defaults to the committed apnea/NRB trace.
    #[arg(long, global = true, value_name = "FILE")]
    trace: Option<PathBuf>,

    /// Run the simulation as fast as possible (no real-time pacing).
    /// Useful for tests; the TUI/web demos use real-time.
    #[arg(long, global = true)]
    no_realtime: bool,

    /// Subcommand.
    #[command(subcommand)]
    command: Command,
}

#[derive(Subcommand, Debug)]
enum Command {
    /// Run the terminal vitals monitor.
    Tui,
    /// Run the HTTP + WebSocket server for the web client.
    Serve {
        /// TCP port to listen on.
        #[arg(long, default_value_t = 8080)]
        port: u16,
        /// Listen address.
        #[arg(long, default_value = "127.0.0.1")]
        host: IpAddr,
        /// Directory of static files to serve as the web client. If unset,
        /// only the API endpoints are served (useful when the Vite dev
        /// server hosts the frontend on a different port).
        #[arg(long, value_name = "DIR")]
        static_dir: Option<PathBuf>,
    },
}

fn default_trace_path() -> PathBuf {
    // From `crates/sim-server/`, the repo root is `../../`.
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("..")
        .join("..")
        .join("tests")
        .join("physiology-fixtures")
        .join("apnea-nrb.macos-arm64.csv")
}

fn main() -> ExitCode {
    init_tracing();

    let cli = Cli::parse();
    let trace_path = cli.trace.unwrap_or_else(default_trace_path);

    let engine = match TraceReplayEngine::from_csv_path(&trace_path) {
        Ok(e) => e,
        Err(e) => {
            tracing::error!(%e, path = %trace_path.display(), "failed to load trace");
            eprintln!("error: failed to load trace {}: {e}", trace_path.display());
            return ExitCode::FAILURE;
        }
    };
    tracing::info!(samples = engine.sample_count(), path = %trace_path.display(), "loaded trace");

    let runtime = match tokio::runtime::Builder::new_multi_thread()
        .enable_all()
        .build()
    {
        Ok(rt) => rt,
        Err(e) => {
            eprintln!("error: failed to start tokio runtime: {e}");
            return ExitCode::FAILURE;
        }
    };

    runtime.block_on(async move {
        let scenario = trace_path
            .file_stem()
            .and_then(std::ffi::OsStr::to_str)
            .unwrap_or("apnea-nrb")
            .to_owned();
        let handle = sim::spawn(Box::new(engine), scenario, !cli.no_realtime);

        match cli.command {
            Command::Tui => match tui::run(handle).await {
                Ok(()) => ExitCode::SUCCESS,
                Err(e) => {
                    eprintln!("tui error: {e}");
                    ExitCode::FAILURE
                }
            },
            Command::Serve {
                port,
                host,
                static_dir,
            } => {
                let addr = SocketAddr::new(host, port);
                let router = web::router(handle, static_dir);
                if let Err(e) = web::serve(addr, router).await {
                    eprintln!("serve error: {e}");
                    return ExitCode::FAILURE;
                }
                ExitCode::SUCCESS
            }
        }
    })
}

fn init_tracing() {
    let _ = tracing_subscriber::fmt()
        .with_env_filter(
            EnvFilter::try_from_default_env().unwrap_or_else(|_| EnvFilter::new("info")),
        )
        .with_target(false)
        .try_init();
}

#[allow(
    dead_code,
    reason = "Re-export so tests outside the bin can see SocketAddr default."
)]
fn _default_bind() -> SocketAddr {
    SocketAddr::new(IpAddr::V4(Ipv4Addr::LOCALHOST), 8080)
}
