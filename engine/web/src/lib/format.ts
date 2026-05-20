// Number formatting helpers — kept tiny so the UI layer stays declarative.

export function formatInt(value: number): string {
  return Math.round(value).toString();
}

export function formatPercent(fraction: number, digits = 0): string {
  return (fraction * 100).toFixed(digits);
}

export function formatFixed(value: number, digits = 1): string {
  return value.toFixed(digits);
}

/** Discrete clinical band. `abnormal` is "outside normal range" — NOT an
 *  active alarm. Active alarms are owned by the alarm subsystem. */
export type VitalBand = 'normal' | 'warn' | 'abnormal';

/** Maps SpO2 (0..1) to a discrete clinical band for color/animation. */
export function spo2Band(spo2Fraction: number): VitalBand {
  if (spo2Fraction >= 0.94) return 'normal';
  if (spo2Fraction >= 0.88) return 'warn';
  return 'abnormal';
}

/** Maps HR to a discrete clinical band. */
export function hrBand(bpm: number): VitalBand {
  if (bpm >= 60 && bpm <= 100) return 'normal';
  if (bpm >= 50 && bpm < 120) return 'warn';
  return 'abnormal';
}
