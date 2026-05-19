# EMS Simulator — task runner
# Run `just --list` for available recipes.

set shell := ["bash", "-cu"]

# Default: list recipes
default:
    @just --list

# Build the entire Rust workspace
build:
    cargo build --workspace

# Build in release mode
build-release:
    cargo build --workspace --release

# Run all tests in the workspace
test:
    cargo test --workspace

# Format check + clippy (CI parity)
check:
    cargo fmt --all -- --check
    cargo clippy --workspace --all-targets -- -D warnings

# Apply formatting
fmt:
    cargo fmt --all

# Run clippy with auto-fix where safe
clippy-fix:
    cargo clippy --workspace --all-targets --fix --allow-dirty --allow-staged

# Run the headless sim server with the terminal UI demo.
sim:
    cargo run --package sim-server -- tui

# Run the headless sim server's HTTP/WebSocket API on http://127.0.0.1:8080.
serve:
    cargo run --package sim-server -- serve

# Build + serve the web client and the sim API on the same port (8080).
# This is the "one command, see the demo" entry point.
demo:
    cd engine/web && npm install --no-audit --no-fund && npm run build
    cargo run --release --package sim-server -- \
        serve --port 8080 --static-dir engine/web/dist

# Vite dev server (web client at http://127.0.0.1:5173 with proxy to :8080).
# Run `just serve` in another terminal first.
web-dev:
    cd engine/web && npm install --no-audit --no-fund && npm run dev

# Type-check + production build of the web client.
web-build:
    cd engine/web && npm install --no-audit --no-fund && npm run build

# Validate all protocol YAML files (placeholder; real validator TBD)
validate-protocols:
    @echo "TODO: invoke protocols crate validator over data/protocols/*.yaml"

# Clean build artifacts
clean:
    cargo clean
