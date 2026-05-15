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

# Run the headless sim server (placeholder)
sim:
    cargo run --package sim-server

# Validate all protocol YAML files (placeholder; real validator TBD)
validate-protocols:
    @echo "TODO: invoke protocols crate validator over data/protocols/*.yaml"

# Clean build artifacts
clean:
    cargo clean
