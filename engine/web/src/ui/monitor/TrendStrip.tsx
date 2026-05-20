// Sparkline trend strip. Reads from the monitor store's ring buffers
// directly (not props) and re-renders only when its visible window or
// vital changes. Decimates the ring to ~120 bins regardless of buffer
// length — keeps the canvas paint cheap.

import { memo, useEffect, useRef } from 'react';
import { useMonitorStore } from './store/monitorStore';
import { decimateRing } from './store/ringBuffer';
import { subscribeFrameClock } from './hooks/useFrameClock';

const BINS = 120;
const SAMPLE_RATE_HZ = 50;
const PAINT_INTERVAL_MS = 250; // decimation is cheap, but no need at 60 fps

interface Props {
  vital:
    | 'heart_rate_bpm'
    | 'spo2_fraction'
    | 'respiratory_rate_bpm'
    | 'etco2_mmhg';
  color: string;
  height?: number;
}

export const TrendStrip = memo(function TrendStrip({
  vital,
  color,
  height = 28,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const lastPaintRef = useRef(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const buf = new Float32Array(BINS);
    const repaint = (): void => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const cssW = canvas.clientWidth || 80;
      const cssH = canvas.clientHeight || height;
      const w = Math.round(cssW * dpr);
      const h = Math.round(cssH * dpr);
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
      }
      const trendWindowS = useMonitorStore.getState().trendWindowS;
      const ring = useMonitorStore.getState().rings[vital];
      const samples = decimateRing(ring, trendWindowS * SAMPLE_RATE_HZ, BINS, buf);
      ctx.clearRect(0, 0, w, h);
      if (samples < 2) return;
      let lo = Infinity;
      let hi = -Infinity;
      for (let i = 0; i < samples; i += 1) {
        const v = buf[i]!;
        if (v < lo) lo = v;
        if (v > hi) hi = v;
      }
      // Pad range so a flat line still shows.
      const span = Math.max(hi - lo, Math.abs(hi) * 0.05 || 1);
      const cx = w / samples;
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.5 * dpr;
      ctx.beginPath();
      for (let i = 0; i < samples; i += 1) {
        const v = buf[i]!;
        const t = (v - lo) / span;
        const x = i * cx;
        const y = h - 2 - t * (h - 4);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
    };

    const unsubscribe = subscribeFrameClock((tSec) => {
      const nowMs = tSec * 1000;
      if (nowMs - lastPaintRef.current < PAINT_INTERVAL_MS) return;
      lastPaintRef.current = nowMs;
      repaint();
    });
    repaint();
    return () => unsubscribe();
  }, [vital, color, height]);

  return (
    <canvas
      ref={canvasRef}
      className="trend-strip"
      style={{ height: `${height}px` }}
      aria-hidden="true"
    />
  );
});
