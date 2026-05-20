// Fixed-capacity ring buffer over Float32Array. Used to hold per-vital
// trend history so the monitor can paint sparklines without re-allocating.
// Capacity is sized in samples (server tick rate ≈ 50 Hz × max window 5
// minutes × 6 vitals ≈ 360 KB total — trivial).

export interface RingBuffer {
  data: Float32Array;
  /** Index of the next write slot. */
  head: number;
  /** Number of valid samples currently held (≤ capacity). */
  length: number;
  /** Total samples ever pushed; useful as a monotonic timestamp surrogate. */
  total: number;
}

export function createRing(capacity: number): RingBuffer {
  return {
    data: new Float32Array(capacity),
    head: 0,
    length: 0,
    total: 0,
  };
}

/** Append `value`; oldest sample is dropped when full. */
export function pushRing(ring: RingBuffer, value: number): void {
  const cap = ring.data.length;
  ring.data[ring.head] = value;
  ring.head = (ring.head + 1) % cap;
  if (ring.length < cap) ring.length += 1;
  ring.total += 1;
}

/** Sample the most recent `count` values into `out` in chronological order
 *  (oldest first). If fewer samples are available, the remaining slots are
 *  left untouched — caller should treat `out.length` as authoritative. */
export function readRing(
  ring: RingBuffer,
  count: number,
  out: Float32Array,
): number {
  const cap = ring.data.length;
  const take = Math.min(count, ring.length, out.length);
  // The oldest of the last `take` samples sits `take` slots before head.
  let idx = (ring.head - take + cap) % cap;
  for (let i = 0; i < take; i += 1) {
    out[i] = ring.data[idx]!;
    idx = (idx + 1) % cap;
  }
  return take;
}

/** Decimate the most recent `count` samples down to `bins` evenly-spaced
 *  averages. Used by sparklines that paint ~120 pixels regardless of how
 *  much history the buffer holds. */
export function decimateRing(
  ring: RingBuffer,
  count: number,
  bins: number,
  out: Float32Array,
): number {
  const cap = ring.data.length;
  const take = Math.min(count, ring.length);
  const slots = Math.min(bins, out.length);
  if (take === 0 || slots === 0) return 0;
  const start = (ring.head - take + cap) % cap;
  for (let b = 0; b < slots; b += 1) {
    const lo = Math.floor((b * take) / slots);
    const hi = Math.max(lo + 1, Math.floor(((b + 1) * take) / slots));
    let sum = 0;
    for (let i = lo; i < hi; i += 1) {
      sum += ring.data[(start + i) % cap]!;
    }
    out[b] = sum / (hi - lo);
  }
  return slots;
}
