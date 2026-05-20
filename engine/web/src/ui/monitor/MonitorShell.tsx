// Top-level monitor: 3 waveform strips on the left, numeric tiles on the
// right, trend window picker at the foot. Replaces VitalsPanel as the
// MonitorSlot's renderer.
//
// IMPORTANT: this component does NOT subscribe to `latest`. Each
// NumericTile subscribes via a band selector and reads the value
// imperatively at 1 Hz, so the shell never re-renders on the 50 Hz feed.

import { useMonitorStore, TREND_WINDOWS_S, type TrendWindowS } from './store/monitorStore';
import { VitalsAnnouncer } from './VitalsAnnouncer';
import { WaveformStrip } from './WaveformStrip';
import { NumericTile } from './tiles/NumericTile';
import { TrendStrip } from './TrendStrip';
import { sampleEcg } from './waveforms/ecg';
import { samplePleth } from './waveforms/pleth';
import { sampleCapno } from './waveforms/capno';
import {
  formatFixed,
  formatInt,
  formatPercent,
  hrBand,
  spo2Band,
  type VitalBand,
} from '../../lib/format';
import type { VitalsFrame } from '../../lib/stream';

const COLORS = {
  ecg: '#34d3a3',
  pleth: '#41c7ff',
  capno: '#ffd166',
};

export function MonitorShell() {
  const trendWindowS = useMonitorStore((s) => s.trendWindowS);
  const setTrendWindow = useMonitorStore((s) => s.setTrendWindow);

  return (
    <section className="monitor-shell" aria-label="Patient monitor">
      <VitalsAnnouncer />
      <div className="monitor-shell__waves">
        <WaveformStrip
          label="ECG II"
          sample={ecgSample}
          range={[-0.5, 1.1]}
          color={COLORS.ecg}
          sweepMmPerSec={25}
          height={120}
        />
        <WaveformStrip
          label="Pleth"
          sample={plethSample}
          range={[0, 1]}
          color={COLORS.pleth}
          sweepMmPerSec={25}
          height={90}
        />
        <WaveformStrip
          label="CO₂"
          sample={capnoSample}
          range={[0, 60]}
          color={COLORS.capno}
          sweepMmPerSec={12.5}
          height={90}
        />
      </div>
      <div className="monitor-shell__tiles">
        <NumericTile
          label="HR"
          unit="bpm"
          format={(f) => formatInt(f.heart_rate_bpm)}
          band={(f) => hrBand(f.heart_rate_bpm)}
          trend={<TrendStrip vital="heart_rate_bpm" color={COLORS.ecg} />}
        />
        <NumericTile
          label="SpO₂"
          unit="%"
          format={(f) => formatPercent(f.spo2_fraction)}
          band={(f) => spo2Band(f.spo2_fraction)}
          trend={<TrendStrip vital="spo2_fraction" color={COLORS.pleth} />}
        />
        <NumericTile
          label="RR"
          unit="/min"
          format={(f) => formatInt(f.respiratory_rate_bpm)}
          band={(f) => rrBand(f.respiratory_rate_bpm)}
          trend={
            <TrendStrip vital="respiratory_rate_bpm" color={COLORS.capno} />
          }
        />
        <NumericTile
          label="ETCO₂"
          unit="mmHg"
          format={(f) => formatFixed(f.etco2_mmhg, 0)}
          band={(f) => etco2Band(f.etco2_mmhg)}
          trend={<TrendStrip vital="etco2_mmhg" color={COLORS.capno} />}
        />
        <NumericTile
          label="BP"
          unit="mmHg"
          format={(f) =>
            `${formatInt(f.systolic_bp_mmhg)}/${formatInt(f.diastolic_bp_mmhg)}`
          }
          band={() => 'normal'}
        />
        <NumericTile
          label="Temp"
          unit="°C"
          format={(f) => formatFixed(f.temperature_c, 1)}
          band={() => 'normal'}
        />
      </div>
      <div className="monitor-shell__footer">
        <fieldset className="trend-window">
          <legend>Trend window</legend>
          {TREND_WINDOWS_S.map((s) => (
            <button
              key={s}
              type="button"
              className={`trend-window__btn ${s === trendWindowS ? 'is-active' : ''}`}
              aria-pressed={s === trendWindowS}
              onClick={() => setTrendWindow(s as TrendWindowS)}
            >
              {labelForWindow(s)}
            </button>
          ))}
        </fieldset>
      </div>
    </section>
  );
}

function ecgSample(t: number, frame: VitalsFrame): number {
  return sampleEcg(t, frame.heart_rate_bpm);
}
function plethSample(t: number, frame: VitalsFrame): number {
  return samplePleth(t, frame.heart_rate_bpm, frame.spo2_fraction);
}
function capnoSample(t: number, frame: VitalsFrame): number {
  return sampleCapno(t, frame.respiratory_rate_bpm, frame.etco2_mmhg);
}

function rrBand(rr: number): VitalBand {
  if (rr >= 12 && rr <= 20) return 'normal';
  if (rr >= 8 && rr <= 24) return 'warn';
  return 'abnormal';
}
function etco2Band(v: number): VitalBand {
  if (v >= 35 && v <= 45) return 'normal';
  if (v >= 30 && v <= 50) return 'warn';
  return 'abnormal';
}

function labelForWindow(s: number): string {
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.round(s / 60)}m`;
  return `${Math.round(s / 3600)}h`;
}
