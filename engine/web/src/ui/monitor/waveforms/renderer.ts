// Shared canvas painter for waveform strips.
//
// Real bedside monitors paint with a sweep cursor that erases the strip
// just ahead of itself, leaving the prior cycle's trace until the cursor
// catches up. We mirror that pattern: we keep an offscreen canvas full of
// already-painted samples and each frame we draw a small wedge that
// (a) erases a few pixels just ahead of the cursor and (b) draws the
// new sample at the cursor.
//
// Compared to repainting the full strip every frame this saves ~95% of
// the per-frame draw cost on a 50 Hz feed.

export interface WaveformStyle {
  /** Stroke color of the trace. */
  color: string;
  /** Background color of the strip (also the wipe color). */
  background: string;
  /** Faint mm-grid color. */
  grid: string;
  /** Sweep speed in mm/s (analog convention). 25 mm/s is standard for ECG. */
  sweepMmPerSec: number;
  /** Pixels per millimeter at the strip's display size. Caller derives this
   *  from the canvas width and the duration shown on screen. */
  pxPerMm: number;
}

export interface WaveformStripState {
  /** Last x position the cursor painted at, in pixels. */
  cursorPx: number;
  /** Last y position painted, in pixels (for line continuation). */
  prevYPx: number;
  /** Last sim-time the renderer sampled at, in seconds. */
  prevTSec: number;
  /** Whether the previous y is valid (false on first paint or after wrap). */
  hasPrev: boolean;
}

export function createStripState(): WaveformStripState {
  return { cursorPx: 0, prevYPx: 0, prevTSec: 0, hasPrev: false };
}

/** Paint the static mm grid into `ctx`. Call once on mount or on resize. */
export function paintGrid(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  style: WaveformStyle,
): void {
  ctx.fillStyle = style.background;
  ctx.fillRect(0, 0, width, height);

  ctx.strokeStyle = style.grid;
  ctx.lineWidth = 1;
  ctx.beginPath();
  // Major grid every 5 mm; minor lines skipped to keep the strip uncluttered.
  const gridStepPx = style.pxPerMm * 5;
  for (let x = 0; x <= width; x += gridStepPx) {
    ctx.moveTo(Math.round(x) + 0.5, 0);
    ctx.lineTo(Math.round(x) + 0.5, height);
  }
  for (let y = 0; y <= height; y += gridStepPx) {
    ctx.moveTo(0, Math.round(y) + 0.5);
    ctx.lineTo(width, Math.round(y) + 0.5);
  }
  ctx.stroke();
}

/** Map a normalized waveform sample in `[lo, hi]` to a y-pixel inside the
 *  strip. y grows downward; we flip so high values draw upward. */
export function normalizeY(
  value: number,
  lo: number,
  hi: number,
  height: number,
  topPad = 4,
  bottomPad = 4,
): number {
  if (hi <= lo) return height / 2;
  const usable = height - topPad - bottomPad;
  const clamped = Math.min(hi, Math.max(lo, value));
  const t = (clamped - lo) / (hi - lo);
  return topPad + (1 - t) * usable;
}

/** Advance the sweep one frame. `nextY` is the y-pixel of the latest
 *  sample; the renderer blends from the previous y to this one and erases
 *  a narrow strip ahead of the cursor. */
export function paintSweepStep(
  ctx: CanvasRenderingContext2D,
  state: WaveformStripState,
  width: number,
  height: number,
  tSec: number,
  nextY: number,
  style: WaveformStyle,
): void {
  const dt = state.hasPrev ? Math.max(0, tSec - state.prevTSec) : 0;
  const dxFloat = dt * style.sweepMmPerSec * style.pxPerMm;
  const dx = Math.max(1, Math.round(dxFloat));
  const x0 = state.cursorPx;
  let x1 = x0 + dx;
  // Wipe-ahead band: a few pixels in front of where we'll draw, repainted
  // with the background + grid so the previous cycle's trace is erased
  // just before the cursor reaches it.
  const wipeWidth = Math.max(2, Math.round(style.pxPerMm * 2));

  // Wrap.
  if (x1 >= width) {
    // Wipe right edge then continue from x=0.
    wipeBand(ctx, x0, width, height, style);
    state.cursorPx = 0;
    state.hasPrev = false;
    state.prevTSec = tSec;
    state.prevYPx = nextY;
    return;
  }

  // Erase ahead of the cursor.
  wipeBand(ctx, x1, Math.min(width, x1 + wipeWidth), height, style);

  // Draw the new line segment.
  ctx.strokeStyle = style.color;
  ctx.lineWidth = 1.6;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.beginPath();
  if (state.hasPrev) {
    ctx.moveTo(x0, state.prevYPx);
  } else {
    ctx.moveTo(x1, nextY);
  }
  ctx.lineTo(x1, nextY);
  ctx.stroke();

  state.cursorPx = x1;
  state.prevYPx = nextY;
  state.prevTSec = tSec;
  state.hasPrev = true;
}

function wipeBand(
  ctx: CanvasRenderingContext2D,
  xLo: number,
  xHi: number,
  height: number,
  style: WaveformStyle,
): void {
  const w = Math.max(0, xHi - xLo);
  if (w === 0) return;
  ctx.fillStyle = style.background;
  ctx.fillRect(xLo, 0, w, height);
  // Keep the grid visible inside the wiped band.
  ctx.strokeStyle = style.grid;
  ctx.lineWidth = 1;
  ctx.beginPath();
  const gridStepPx = style.pxPerMm * 5;
  for (let y = 0; y <= height; y += gridStepPx) {
    ctx.moveTo(xLo, Math.round(y) + 0.5);
    ctx.lineTo(xHi, Math.round(y) + 0.5);
  }
  // Vertical lines anywhere on the major grid that intersect the band.
  const firstX = Math.ceil(xLo / gridStepPx) * gridStepPx;
  for (let x = firstX; x <= xHi; x += gridStepPx) {
    ctx.moveTo(Math.round(x) + 0.5, 0);
    ctx.lineTo(Math.round(x) + 0.5, height);
  }
  ctx.stroke();
}
