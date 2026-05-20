// One numeric tile (HR, SpO2, RR, ETCO2, BP, Temp).
//
// The tile subscribes the monitor store via TWO selectors:
//   1. A "fast" selector returning a discrete band — re-renders only when
//      the band changes (≤ a handful of times per scenario).
//   2. A "slow" selector returning the formatted value string updated on
//      a 1 Hz schedule via the rAF clock; sidesteps the React reconciler
//      entirely for the digit churn.
//
// A11y: the value DOM is NOT inside an aria-live region — that would spam
// screen readers at 6 Hz (6 tiles × 1 Hz). Instead the tile carries an
// `aria-label` that recomputes on band change, and MonitorShell mounts a
// single throttled aria-live="polite" region summarizing abnormal vitals.
//
// Net effect: at 50 Hz feed-rate the tile commits ~1 React render per
// second instead of 50, and screen readers get a sane summary every few
// seconds rather than a torrent.

import { useEffect, useRef, useState } from 'react';
import { useMonitorStore } from '../store/monitorStore';
import { subscribeFrameClock } from '../hooks/useFrameClock';
import type { VitalBand } from '../../../lib/format';
import type { VitalsFrame } from '../../../lib/stream';

interface Props {
  label: string;
  unit: string;
  /** How to format the latest frame as a display string. Pure. */
  format: (frame: VitalsFrame) => string;
  /** Discrete band selector; the tile commits a render only on change. */
  band: (frame: VitalsFrame) => VitalBand;
  /** Optional trend sparkline child. */
  trend?: React.ReactNode;
}

const VALUE_REFRESH_MS = 1000;

export function NumericTile({ label, unit, format, band, trend }: Props) {
  // Band subscription drives React re-renders.
  const currentBand: VitalBand = useMonitorStore((s) =>
    s.latest ? band(s.latest) : 'normal',
  );

  // Value DOM is mutated imperatively at 1 Hz to avoid 50 Hz reconciliation.
  const valueRef = useRef<HTMLSpanElement | null>(null);
  const lastPaintRef = useRef(0);
  const lastValueRef = useRef<string>('—');
  const [initial] = useState(() => {
    const f = useMonitorStore.getState().latest;
    return f ? format(f) : '—';
  });

  useEffect(() => {
    lastValueRef.current = initial;
  }, [initial]);

  useEffect(() => {
    const unsubscribe = subscribeFrameClock((tSec) => {
      const nowMs = tSec * 1000;
      if (nowMs - lastPaintRef.current < VALUE_REFRESH_MS) return;
      lastPaintRef.current = nowMs;
      const f = useMonitorStore.getState().latest;
      const next = f ? format(f) : '—';
      if (next === lastValueRef.current) return;
      lastValueRef.current = next;
      if (valueRef.current) {
        valueRef.current.textContent = next;
      }
    });
    return () => unsubscribe();
  }, [format]);

  // Accessible name combines label + unit + band so screen reader users
  // can probe a tile on demand without it announcing every digit change.
  const ariaLabel = `${label} ${currentBand === 'normal' ? '' : currentBand}`.trim();

  return (
    <div
      className={`tile tile--${currentBand}`}
      role="group"
      aria-label={ariaLabel}
      tabIndex={0}
    >
      <div className="tile__label">{label}</div>
      <div className="tile__value">
        <span ref={valueRef}>{initial}</span>
        <span className="tile__unit">{unit}</span>
      </div>
      {trend && <div className="tile__trend">{trend}</div>}
    </div>
  );
}
