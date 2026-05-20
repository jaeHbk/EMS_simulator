// Generic waveform strip. Subscribes to the global frame clock and paints
// a sweep cursor each rAF tick. The synth fn is a pure (t, ...vitals) →
// number; the strip clips and maps to pixels.

import { memo, useEffect, useRef } from 'react';
import type { VitalsFrame } from '../../lib/stream';
import { useMonitorStore } from './store/monitorStore';
import { subscribeFrameClock } from './hooks/useFrameClock';
import {
  createStripState,
  normalizeY,
  paintGrid,
  paintSweepStep,
  type WaveformStyle,
} from './waveforms/renderer';

export interface WaveformStripProps {
  /** Visible label drawn above the strip ("ECG II", "Pleth", …). */
  label: string;
  /** Pure synth fn: (t, latestFrame) → sample. */
  sample: (tSec: number, frame: VitalsFrame) => number;
  /** Min/max of the synth output, used to map sample → y pixel. */
  range: [number, number];
  /** Stroke color. */
  color: string;
  /** Sweep speed (mm/s). 25 = ECG, 12.5 = capno, 6.25 = resp. */
  sweepMmPerSec: number;
  /** Strip pixel height. */
  height: number;
}

const PX_PER_MM = 4; // assume ~96 dpi; tune for tighter/wider monitors

const STYLE_DEFAULTS = {
  background: '#0a1322',
  grid: 'rgba(70, 95, 130, 0.35)',
};

export const WaveformStrip = memo(function WaveformStrip({
  label,
  sample,
  range,
  color,
  sweepMmPerSec,
  height,
}: WaveformStripProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  // Renderer state — kept on a ref so re-renders don't reset the sweep.
  const stripStateRef = useRef(createStripState());
  // Latest measured DOM size; updated by ResizeObserver.
  const sizeRef = useRef<{ w: number; h: number }>({ w: 0, h: height });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const style: WaveformStyle = {
      color,
      background: STYLE_DEFAULTS.background,
      grid: STYLE_DEFAULTS.grid,
      sweepMmPerSec,
      pxPerMm: PX_PER_MM,
    };

    // Initial paint.
    const repaintGrid = (): void => {
      paintGrid(ctx, canvas.width, canvas.height, style);
      stripStateRef.current = createStripState();
    };

    const ro = new ResizeObserver(() => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = Math.max(1, Math.round(canvas.clientWidth * dpr));
      const h = Math.max(1, Math.round(canvas.clientHeight * dpr));
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
        ctx.setTransform(1, 0, 0, 1, 0, 0); // reset; we draw in device px
        sizeRef.current = { w, h };
        repaintGrid();
      }
    });
    ro.observe(canvas);
    repaintGrid();

    // Subscribe to the rAF clock and paint one step per frame. We sample
    // the synth at the animation timestamp directly; sweep speed governs
    // how much of the strip is drawn per rAF.
    const unsubscribe = subscribeFrameClock((tSec) => {
      const frame = useMonitorStore.getState().latest;
      if (!frame) return;
      const value = sample(tSec, frame);
      const y = normalizeY(value, range[0], range[1], canvas.height);
      paintSweepStep(
        ctx,
        stripStateRef.current,
        canvas.width,
        canvas.height,
        tSec,
        y,
        style,
      );
    });

    return () => {
      unsubscribe();
      ro.disconnect();
    };
  }, [color, sweepMmPerSec, sample, range]);

  // Waveforms are visual-only; the same data is conveyed by the
  // numeric tiles. Hiding from SR avoids announcing a redundant "image"
  // on every tile change.
  return (
    <figure
      className="waveform-strip"
      style={{ height: `${height}px` }}
      aria-hidden="true"
    >
      <figcaption className="waveform-strip__label">{label}</figcaption>
      <canvas ref={canvasRef} className="waveform-strip__canvas" />
    </figure>
  );
});
