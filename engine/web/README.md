# EMS Simulator — web client

3D web client for the EMS Simulator. Subscribes to a vitals stream from
`sim-server` over WebSocket and renders a stylized patient on a stretcher
plus a bedside vitals monitor.

## One-shot demo

From the repo root:

```sh
just demo
```

That builds the web bundle (`npm run build`) and starts `sim-server` on
`http://127.0.0.1:8080` serving the bundle alongside the
`/api/vitals/ws` stream. Open the URL — the scene should appear within a
few seconds with live vitals updating at 50 Hz.

## Development workflow

In two terminals:

```sh
# terminal 1 — Rust API + WebSocket on :8080
just serve

# terminal 2 — Vite dev server with HMR on :5173, proxied to :8080
just web-dev
```

Open <http://127.0.0.1:5173>. Vite proxies `/api` and `/healthz` to the
Rust server, so the same code path runs in dev as in prod.

## Stack

- React 18 + TypeScript 5 (strict).
- Vite 6 (lazy-loads the 3D scene chunk so first paint is < 100 KB JS).
- `@react-three/fiber` 8 + `@react-three/drei` 9 over Three.js 0.171.
- No CSS framework — vanilla CSS keeps the bundle small and the DOM
  inspector readable.

## Accessibility

- Live numeric vitals are exposed with `aria-live="polite"` so screen
  readers announce changes without interrupting.
- 3D scene has a descriptive `role="img"` + `aria-label` fallback.
- Color-coded values are *also* labeled with text and pictograms — no
  red/green-only signal.
- `prefers-reduced-motion` disables the critical-vitals pulse animation.

## Wire format

The client expects JSON frames matching `crates/sim-server/src/wire.rs`:

```json
{
  "tick": 1234,
  "sim_time_s": 24.68,
  "heart_rate_bpm": 130.0,
  "systolic_bp_mmhg": 120.0,
  "diastolic_bp_mmhg": 80.0,
  "respiratory_rate_bpm": 0.0,
  "spo2_fraction": 0.65,
  "etco2_mmhg": 12.0,
  "temperature_c": 37.0
}
```

Plus a one-shot `Hello`:

```json
{"type":"hello","tick_hz":50,"server_version":"sim-server 0.0.1","scenario":"apnea-nrb.macos-arm64"}
```

The hook in `src/lib/stream.ts` reconnects with capped exponential
backoff on close.
