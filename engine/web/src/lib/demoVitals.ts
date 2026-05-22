// Generates synthetic vitals frames when no server is connected. Simulates
// a realistic deteriorating-then-recovering patient scenario so the UI is
// fully interactive during frontend-only development or demos.

import type { VitalsFrame, RunState } from './stream';
import { useMonitorStore } from '../ui/monitor/store/monitorStore';

let intervalId: ReturnType<typeof setInterval> | null = null;
let tick = 0;
let startTime = 0;

const TICK_HZ = 50;
const TICK_INTERVAL_MS = 1000 / TICK_HZ;

export function startDemoMode(): void {
  if (intervalId !== null) return;
  tick = 0;
  startTime = performance.now();

  intervalId = setInterval(() => {
    tick += 1;
    const simTimeS = (performance.now() - startTime) / 1000;
    const frame = synthesizeFrame(tick, simTimeS);
    useMonitorStore.getState().pushFrame(frame);
  }, TICK_INTERVAL_MS);
}

export function stopDemoMode(): void {
  if (intervalId !== null) {
    clearInterval(intervalId);
    intervalId = null;
  }
}

export function isDemoRunning(): boolean {
  return intervalId !== null;
}

function synthesizeFrame(t: number, simTimeS: number): VitalsFrame {
  // 5-minute scenario loop: stable → deterioration → recovery
  const cycleS = simTimeS % 300;
  const phase = cycleS / 300; // 0..1

  // Heart rate: baseline 78, rises during distress
  const hrBase = 78;
  const hrDistress = phase < 0.4 ? 0 : phase < 0.7 ? (phase - 0.4) / 0.3 : 1 - (phase - 0.7) / 0.3;
  const hr = hrBase + hrDistress * 42 + Math.sin(t * 0.02) * 2;

  // SpO2: stable then drops, then recovers
  const spo2Base = 0.98;
  const spo2Drop = phase < 0.35 ? 0 : phase < 0.65 ? (phase - 0.35) / 0.3 : Math.max(0, 1 - (phase - 0.65) / 0.2);
  const spo2 = spo2Base - spo2Drop * 0.14 + Math.sin(t * 0.01) * 0.003;

  // Respiratory rate
  const rrBase = 16;
  const rrChange = phase < 0.4 ? 0 : phase < 0.6 ? (phase - 0.4) / 0.2 : 1 - (phase - 0.6) / 0.4;
  const rr = rrBase + rrChange * 14 - (phase > 0.55 && phase < 0.75 ? 12 : 0);

  // ETCO2
  const etco2Base = 38;
  const etco2 = etco2Base + rrChange * 15 + Math.sin(t * 0.015) * 1.5;

  // Blood pressure
  const sbp = 118 + hrDistress * 22 + Math.sin(t * 0.008) * 3;
  const dbp = 76 + hrDistress * 10 + Math.sin(t * 0.008) * 2;

  // Temperature
  const temp = 36.8 + hrDistress * 0.4;

  const runState: RunState = {
    mode: 'running',
    rate_multiplier: 1.0,
    elapsed_s: simTimeS,
  };

  return {
    tick: t,
    sim_time_s: simTimeS,
    heart_rate_bpm: clamp(hr, 30, 200),
    systolic_bp_mmhg: clamp(sbp, 60, 240),
    diastolic_bp_mmhg: clamp(dbp, 30, 140),
    respiratory_rate_bpm: clamp(rr, 4, 40),
    spo2_fraction: clamp(spo2, 0.6, 1.0),
    etco2_mmhg: clamp(etco2, 15, 80),
    temperature_c: clamp(temp, 34, 42),
    interventions: [],
    run_state: runState,
  };
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}
