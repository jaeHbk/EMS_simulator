import { describe, expect, it } from 'vitest';
import { createRing, decimateRing, pushRing, readRing } from './ringBuffer';

describe('ring buffer', () => {
  it('grows up to capacity then wraps', () => {
    const r = createRing(4);
    pushRing(r, 1);
    pushRing(r, 2);
    pushRing(r, 3);
    expect(r.length).toBe(3);
    expect(r.total).toBe(3);
    pushRing(r, 4);
    pushRing(r, 5); // wraps; "1" is dropped
    expect(r.length).toBe(4);
    expect(r.total).toBe(5);
    const out = new Float32Array(4);
    expect(readRing(r, 4, out)).toBe(4);
    expect(Array.from(out)).toEqual([2, 3, 4, 5]);
  });

  it('readRing returns chronological order even after wrap', () => {
    const r = createRing(3);
    for (let i = 1; i <= 7; i += 1) pushRing(r, i);
    const out = new Float32Array(3);
    expect(readRing(r, 3, out)).toBe(3);
    expect(Array.from(out)).toEqual([5, 6, 7]);
  });

  it('decimateRing produces evenly-spaced averages', () => {
    const r = createRing(100);
    for (let i = 0; i < 100; i += 1) pushRing(r, i);
    const out = new Float32Array(10);
    expect(decimateRing(r, 100, 10, out)).toBe(10);
    // Each bin spans 10 samples → averages are 4.5, 14.5, 24.5, …, 94.5
    expect(out[0]).toBeCloseTo(4.5, 5);
    expect(out[9]).toBeCloseTo(94.5, 5);
  });

  it('decimateRing handles fewer-than-capacity history', () => {
    const r = createRing(100);
    for (let i = 0; i < 5; i += 1) pushRing(r, i);
    const out = new Float32Array(10);
    const slots = decimateRing(r, 100, 10, out);
    expect(slots).toBe(10);
    // Bin 0 should average just the value at index 0 → 0.
    expect(out[0]).toBe(0);
    // Bin 9 should average just the value at index 4 → 4.
    expect(out[9]).toBe(4);
  });

  it('decimateRing with empty buffer returns 0 slots', () => {
    const r = createRing(10);
    const out = new Float32Array(5);
    expect(decimateRing(r, 10, 5, out)).toBe(0);
  });
});
