// Segmented control for time-warp. Optimistic local toggle; the RPC
// stub logs the intent today.

import { runControls, useRateMultiplier } from './useRunControls';

const RATES = [0.25, 0.5, 1, 2, 4, 8] as const;

export function TimeWarpControl() {
  const current = useRateMultiplier();
  return (
    <fieldset className="timewarp">
      <legend>Time warp</legend>
      {RATES.map((r) => (
        <button
          key={r}
          type="button"
          className={`timewarp__btn ${approxEq(r, current) ? 'is-active' : ''}`}
          aria-pressed={approxEq(r, current)}
          onClick={() => void runControls.rate(r)}
        >
          {r === 1 ? '1×' : `${r}×`}
        </button>
      ))}
    </fieldset>
  );
}

function approxEq(a: number, b: number): boolean {
  return Math.abs(a - b) < 1e-6;
}
