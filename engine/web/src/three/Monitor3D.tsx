// Bedside vitals monitor: a dark slab with a CanvasTexture screen.
// The canvas is repainted each frame with HR/SpO2/ETCO2 readouts and a
// rolling SpO2 trace, mirroring the clinical look of a real EMS monitor.

import { useFrame } from '@react-three/fiber';
import { memo, useMemo, useRef } from 'react';
import { CanvasTexture, type Mesh } from 'three';
import type { VitalsFrame } from '../lib/stream';

interface Props {
  frame: VitalsFrame | null;
  position: [number, number, number];
}

const CANVAS_W = 512;
const CANVAS_H = 320;
const HISTORY = 240;

const Monitor3D = memo(function Monitor3D({ frame, position }: Props) {
  const screenRef = useRef<Mesh>(null);

  // Off-screen canvas + texture, allocated once.
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
      history: new Array<number>(HISTORY).fill(0.97),
    };
  }, []);

  useFrame(() => {
    if (!frame) {
      paintNoSignal(ctx);
      texture.needsUpdate = true;
      return;
    }
    history.shift();
    history.push(frame.spo2_fraction);
    paint(ctx, frame, history);
    texture.needsUpdate = true;
  });

  return (
    <group position={position} rotation={[0, -Math.PI / 6, 0]}>
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
  history: number[],
) {
  // Background.
  ctx.fillStyle = '#0a0e14';
  ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

  // Subtle grid.
  ctx.strokeStyle = 'rgba(53, 70, 90, 0.4)';
  ctx.lineWidth = 1;
  for (let i = 1; i < 8; i += 1) {
    const y = (CANVAS_H * i) / 8;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(CANVAS_W, y);
    ctx.stroke();
  }

  // Top line: scenario time + HR.
  ctx.fillStyle = '#3ddc97';
  ctx.font = 'bold 18px ui-monospace, monospace';
  ctx.textAlign = 'left';
  ctx.fillText(`HR  ${Math.round(frame.heart_rate_bpm)} bpm`, 18, 36);
  ctx.fillStyle = '#98a4b3';
  ctx.font = '14px ui-monospace, monospace';
  ctx.fillText(`t = ${frame.sim_time_s.toFixed(1)} s`, 18, 58);

  // SpO2 banner.
  const spo2 = frame.spo2_fraction;
  const spo2Color =
    spo2 >= 0.94 ? '#3ddc97' : spo2 >= 0.88 ? '#ffb547' : '#ff5c8a';
  ctx.fillStyle = spo2Color;
  ctx.font = 'bold 56px ui-monospace, monospace';
  ctx.textAlign = 'right';
  ctx.fillText(`${(spo2 * 100).toFixed(0)}%`, CANVAS_W - 18, 70);
  ctx.font = '14px ui-monospace, monospace';
  ctx.fillStyle = '#98a4b3';
  ctx.fillText('SpO₂', CANVAS_W - 18, 90);

  // Trace.
  const baseY = CANVAS_H - 20;
  const traceH = 160;
  const traceW = CANVAS_W - 40;
  ctx.strokeStyle = spo2Color;
  ctx.lineWidth = 2;
  ctx.beginPath();
  for (let i = 0; i < history.length; i += 1) {
    const v = Math.max(0, Math.min(1, history[i] ?? 0));
    const x = 20 + (i / (history.length - 1)) * traceW;
    const y = baseY - v * traceH;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.stroke();

  // Respiratory + ETCO2 readouts.
  ctx.fillStyle = '#e7ecf2';
  ctx.font = 'bold 16px ui-monospace, monospace';
  ctx.textAlign = 'left';
  ctx.fillText(`RR ${Math.round(frame.respiratory_rate_bpm)}`, 18, baseY - 110);
  ctx.fillText(`ETCO₂ ${frame.etco2_mmhg.toFixed(0)}`, 18, baseY - 90);
}
