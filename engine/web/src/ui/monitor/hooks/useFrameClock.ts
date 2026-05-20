// Single requestAnimationFrame loop. Waveform strips, the 3D monitor
// canvas, and any other paint-time consumer subscribe to this clock
// instead of each spinning their own rAF — which avoids 6 redundant
// loops and keeps phase aligned across strips.
//
// Subscribers receive a high-resolution timestamp in seconds and the
// elapsed delta since the previous frame. Returning false unsubscribes.

import { useEffect } from 'react';

export type ClockTick = (tSec: number, dtSec: number) => void;

const subscribers = new Set<ClockTick>();
let rafId: number | null = null;
let lastMs = 0;

function loop(nowMs: number): void {
  const tSec = nowMs / 1000;
  const dtSec = lastMs === 0 ? 0 : (nowMs - lastMs) / 1000;
  lastMs = nowMs;
  for (const cb of subscribers) {
    cb(tSec, dtSec);
  }
  rafId = subscribers.size > 0 ? requestAnimationFrame(loop) : null;
  if (rafId === null) lastMs = 0;
}

/** Imperative subscribe — useful from non-React contexts (e.g., the 3D
 *  Monitor texture writer). Returns an unsubscribe fn. */
export function subscribeFrameClock(cb: ClockTick): () => void {
  subscribers.add(cb);
  if (rafId === null) {
    rafId = requestAnimationFrame(loop);
  }
  return () => {
    subscribers.delete(cb);
  };
}

/** React hook flavor. The callback identity does not need to be stable —
 *  effect deps re-subscribe on change. */
export function useFrameClock(cb: ClockTick): void {
  useEffect(() => subscribeFrameClock(cb), [cb]);
}
