// Bedside vitals monitor: a dark slab with a CanvasTexture screen.
//
// Reads the latest frame imperatively from the monitor store inside
// useFrame so the React tree stays quiet while the WS feed updates at
// 50 Hz. Throttles canvas repaint to 10 Hz — texture upload is the
// expensive part, not the JS draw.

import { useFrame } from '@react-three/fiber';
import { memo, useMemo, useRef } from 'react';
import { CanvasTexture, type Mesh } from 'three';
import { useMonitorStore } from '../ui/monitor/store/monitorStore';
import type { VitalsFrame } from '../lib/stream';

interface Props {
  position: [number, number, number];
}

const CANVAS_W = 512;
const CANVAS_H = 320;
const HISTORY = 240;
const REPAINT_INTERVAL_S = 1 / 10; // 10 Hz texture upload

const Monitor3D = memo(function Monitor3D({ position }: Props) {
  const screenRef = useRef<Mesh>(null);

  // Off-screen canvas + texture + ring buffer, allocated once.
  const { ctx, texture, history } = useMemo(() => {
    const c = document.createElement('canvas');
    c.width = CANVAS_W;
    c.height = CANVAS_H;
    const x = c.getContext('2d');
    if (!x) throw new Error('2d context unavailable');
    const t = new CanvasTexture(c);
    t.minFilter = t.magFilter = 1006; // THREE.LinearFilter — avoid mipmap shimmer
    return {
      ctx: x,
      texture: t,
      history: new Float32Array(HISTORY).fill(0.97),
    };
  }, []);

  // Float32Array ring head — write-in-place, no Array.shift() churn.
  const headRef = useRef(0);
  // Last paint time (rAF clock seconds).
  const lastPaintRef = useRef(0);

  useFrame((state) => {
    const now = state.clock.elapsedTime;
    if (now - lastPaintRef.current < REPAINT_INTERVAL_S) return;
    lastPaintRef.current = now;

    const frame = useMonitorStore.getState().latest;
    if (!frame) {
      paintNoSignal(ctx);
      texture.needsUpdate = true;
      return;
    }
    history[headRef.current] = frame.spo2_fraction;
    headRef.current = (headRef.current + 1) % HISTORY;
    paint(ctx, frame, history, headRef.current);
    texture.needsUpdate = true;
  });

  return (
    <group position={position} rotation={[0, Math.PI / 3, 0]}>
      {/* Stand */}
      <mesh position={[0, -0.55, 0]} castShadow>
        <cylinderGeometry args={[0.04, 0.04, 1.1, 12]} />
        <meshStandardMaterial color="#3a4658" metalness={0.6} roughness={0.3} />
      </mesh>

      {/* Bezel */}
      <mesh castShadow receiveShadow>
        <boxGeometry args={[1.05, 0.7, 0.06]} />
        <meshStandardMaterial color="#0e131c" metalness={0.5} roughness={0.4} />
      </mesh>

      {/* Screen */}
      <mesh ref={screenRef} position={[0, 0, 0.034]}>
        <planeGeometry args={[0.95, 0.6]} />
        <meshStandardMaterial
          map={texture}
          emissiveMap={texture}
          emissive="#ffffff"
          emissiveIntensity={0.85}
          roughness={0.3}
          metalness={0.1}
        />
      </mesh>
    </group>
  );
});

export { Monitor3D };

function paintNoSignal(ctx: CanvasRenderingContext2D) {
  ctx.fillStyle = '#0a0e14';
  ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
  ctx.fillStyle = '#98a4b3';
  ctx.font = 'bold 22px ui-monospace, monospace';
  ctx.textAlign = 'center';
  ctx.fillText('— no signal —', CANVAS_W / 2, CANVAS_H / 2);
}

function paint(
  ctx: CanvasRenderingContext2D,
  frame: VitalsFrame,
  history: Float32Array,
  head: number,
) {
  ctx.fillStyle = '#050a12';
  ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

  // Grid
  ctx.strokeStyle = 'rgba(40, 60, 80, 0.3)';
  ctx.lineWidth = 0.5;
  for (let i = 1; i < 10; i += 1) {
    const y = (CANVAS_H * i) / 10;
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(CANVAS_W, y); ctx.stroke();
  }
  for (let i = 1; i < 8; i += 1) {
    const x = (CANVAS_W * i) / 8;
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, CANVAS_H); ctx.stroke();
  }

  // ─── Top row: HR + SpO2 ───
  const spo2 = frame.spo2_fraction;
  const hrColor = '#34d3a3';
  const spo2Color = spo2 >= 0.94 ? '#41c7ff' : spo2 >= 0.88 ? '#f5b042' : '#ef4358';

  // HR
  ctx.fillStyle = hrColor;
  ctx.font = 'bold 42px ui-monospace, monospace';
  ctx.textAlign = 'left';
  ctx.fillText(`${Math.round(frame.heart_rate_bpm)}`, 16, 52);
  ctx.font = '11px ui-monospace, monospace';
  ctx.fillStyle = '#6a8094';
  ctx.fillText('HR bpm', 16, 68);

  // SpO2
  ctx.fillStyle = spo2Color;
  ctx.font = 'bold 42px ui-monospace, monospace';
  ctx.textAlign = 'right';
  ctx.fillText(`${(spo2 * 100).toFixed(0)}`, CANVAS_W - 16, 52);
  ctx.font = '11px ui-monospace, monospace';
  ctx.fillStyle = '#6a8094';
  ctx.fillText('SpO₂ %', CANVAS_W - 16, 68);

  // ─── Middle row: RR, ETCO2, BP ───
  const midY = 105;
  ctx.font = 'bold 22px ui-monospace, monospace';
  ctx.textAlign = 'left';
  ctx.fillStyle = '#ffd166';
  ctx.fillText(`${Math.round(frame.respiratory_rate_bpm)}`, 16, midY);
  ctx.font = '10px ui-monospace, monospace';
  ctx.fillStyle = '#6a8094';
  ctx.fillText('RR /min', 16, midY + 14);

  ctx.font = 'bold 22px ui-monospace, monospace';
  ctx.fillStyle = '#ffd166';
  ctx.textAlign = 'center';
  ctx.fillText(`${frame.etco2_mmhg.toFixed(0)}`, CANVAS_W / 2, midY);
  ctx.font = '10px ui-monospace, monospace';
  ctx.fillStyle = '#6a8094';
  ctx.fillText('ETCO₂ mmHg', CANVAS_W / 2, midY + 14);

  ctx.font = 'bold 22px ui-monospace, monospace';
  ctx.fillStyle = '#e7ecf2';
  ctx.textAlign = 'right';
  ctx.fillText(`${Math.round(frame.systolic_bp_mmhg)}/${Math.round(frame.diastolic_bp_mmhg)}`, CANVAS_W - 16, midY);
  ctx.font = '10px ui-monospace, monospace';
  ctx.fillStyle = '#6a8094';
  ctx.fillText('NIBP mmHg', CANVAS_W - 16, midY + 14);

  // ─── SpO2 pleth trace ───
  const traceTop = 140;
  const traceH = 80;
  const traceW = CANVAS_W - 32;
  ctx.strokeStyle = spo2Color;
  ctx.lineWidth = 2;
  ctx.beginPath();
  for (let i = 0; i < HISTORY; i += 1) {
    const idx = (head + i) % HISTORY;
    const v = Math.max(0.6, Math.min(1, history[idx] ?? 0.97));
    const norm = (v - 0.6) / 0.4;
    const x = 16 + (i / (HISTORY - 1)) * traceW;
    const y = traceTop + traceH - norm * traceH;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.stroke();

  // ─── ECG-like trace (simple sine wave for visual) ───
  const ecgTop = 230;
  const ecgH = 60;
  ctx.strokeStyle = hrColor;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  const hr = frame.heart_rate_bpm;
  for (let i = 0; i < HISTORY; i += 1) {
    const x = 16 + (i / (HISTORY - 1)) * traceW;
    const phase = ((head + i) % HISTORY) / (50 / (hr / 60));
    const frac = phase - Math.floor(phase);
    let v = 0;
    if (frac < 0.05) v = -0.1;
    else if (frac < 0.1) v = 0.9 * Math.sin((frac - 0.05) / 0.05 * Math.PI);
    else if (frac < 0.15) v = -0.2;
    else if (frac < 0.35) v = 0.15 * Math.sin((frac - 0.15) / 0.2 * Math.PI);
    const y = ecgTop + ecgH / 2 - v * ecgH * 0.4;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.stroke();

  // ─── Bottom: time ───
  ctx.fillStyle = '#4a5f73';
  ctx.font = '11px ui-monospace, monospace';
  ctx.textAlign = 'left';
  const m = Math.floor(frame.sim_time_s / 60);
  const s = Math.floor(frame.sim_time_s % 60);
  ctx.fillText(`T+ ${m}:${s < 10 ? '0' : ''}${s}`, 16, CANVAS_H - 8);
  ctx.textAlign = 'right';
  ctx.fillText(`${frame.temperature_c.toFixed(1)}°C`, CANVAS_W - 16, CANVAS_H - 8);
}
