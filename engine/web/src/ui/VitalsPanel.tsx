import { formatFixed, formatInt, formatPercent, hrBand, spo2Band } from '../lib/format';
import type { VitalsFrame } from '../lib/stream';

interface Props {
  frame: VitalsFrame | null;
}

export function VitalsPanel({ frame }: Props) {
  return (
    <section aria-label="Patient vitals" className="panel">
      <h2>Vitals</h2>
      <div className="vitals-grid">
        <Vital
          label="HR"
          icon={<HeartIcon />}
          value={frame ? formatInt(frame.heart_rate_bpm) : '—'}
          unit="bpm"
          band={frame ? hrBand(frame.heart_rate_bpm) : 'normal'}
          ariaLabel={
            frame
              ? `Heart rate ${Math.round(frame.heart_rate_bpm)} beats per minute`
              : 'Heart rate unknown'
          }
        />
        <Vital
          label="SpO₂"
          icon={<DropletIcon />}
          value={frame ? formatPercent(frame.spo2_fraction) : '—'}
          unit="%"
          band={frame ? spo2Band(frame.spo2_fraction) : 'normal'}
          ariaLabel={
            frame
              ? `Oxygen saturation ${(frame.spo2_fraction * 100).toFixed(0)} percent`
              : 'Oxygen saturation unknown'
          }
        />
        <Vital
          label="RR"
          icon={<LungIcon />}
          value={frame ? formatInt(frame.respiratory_rate_bpm) : '—'}
          unit="/min"
          band="normal"
          ariaLabel={
            frame
              ? `Respiratory rate ${Math.round(frame.respiratory_rate_bpm)} per minute`
              : 'Respiratory rate unknown'
          }
        />
        <Vital
          label="ETCO₂"
          icon={<WaveIcon />}
          value={frame ? formatFixed(frame.etco2_mmhg, 0) : '—'}
          unit="mmHg"
          band="normal"
          ariaLabel={
            frame ? `End tidal carbon dioxide ${frame.etco2_mmhg.toFixed(0)} millimeters mercury` : 'ETCO2 unknown'
          }
        />
        <Vital
          label="BP"
          icon={<GaugeIcon />}
          value={frame ? `${formatInt(frame.systolic_bp_mmhg)}/${formatInt(frame.diastolic_bp_mmhg)}` : '—'}
          unit="mmHg"
          band="normal"
          ariaLabel={
            frame
              ? `Blood pressure ${Math.round(frame.systolic_bp_mmhg)} over ${Math.round(frame.diastolic_bp_mmhg)}`
              : 'Blood pressure unknown'
          }
        />
        <Vital
          label="Temp"
          icon={<ThermIcon />}
          value={frame ? formatFixed(frame.temperature_c, 1) : '—'}
          unit="°C"
          band="normal"
          ariaLabel={
            frame ? `Temperature ${frame.temperature_c.toFixed(1)} celsius` : 'Temperature unknown'
          }
        />
      </div>
      <p style={{ color: 'var(--fg-dim)', fontSize: '0.75rem', margin: 0 }}>
        Sim time: {frame ? `${frame.sim_time_s.toFixed(1)} s` : '—'} · Tick:{' '}
        {frame ? frame.tick : '—'}
      </p>
    </section>
  );
}

interface VitalProps {
  label: string;
  icon: React.ReactNode;
  value: string;
  unit: string;
  band: 'normal' | 'warn' | 'bad';
  ariaLabel: string;
}

function Vital({ label, icon, value, unit, band, ariaLabel }: VitalProps) {
  return (
    <div className={`vital ${band}`} role="group" aria-label={ariaLabel}>
      <span className="label">
        <span className="icon" aria-hidden="true">
          {icon}
        </span>
        {label}
      </span>
      <span className="value" aria-live="polite">
        {value}
        <span className="unit">{unit}</span>
      </span>
    </div>
  );
}

const stroke = { stroke: 'currentColor', strokeWidth: 2, fill: 'none', strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };

function HeartIcon() {
  return (
    <svg viewBox="0 0 24 24" {...stroke}>
      <path d="M12 21s-7-4.5-9.5-9A5.5 5.5 0 0 1 12 6a5.5 5.5 0 0 1 9.5 6c-2.5 4.5-9.5 9-9.5 9z" />
    </svg>
  );
}
function DropletIcon() {
  return (
    <svg viewBox="0 0 24 24" {...stroke}>
      <path d="M12 3s7 7 7 12a7 7 0 1 1-14 0c0-5 7-12 7-12z" />
    </svg>
  );
}
function LungIcon() {
  return (
    <svg viewBox="0 0 24 24" {...stroke}>
      <path d="M12 4v8" />
      <path d="M12 12c-1 4-4 6-7 6 0-4 1-8 3-10 1-1 3-1 4 0z" />
      <path d="M12 12c1 4 4 6 7 6 0-4-1-8-3-10-1-1-3-1-4 0z" />
    </svg>
  );
}
function WaveIcon() {
  return (
    <svg viewBox="0 0 24 24" {...stroke}>
      <path d="M2 12h3l2-6 4 12 3-9 2 5h6" />
    </svg>
  );
}
function GaugeIcon() {
  return (
    <svg viewBox="0 0 24 24" {...stroke}>
      <path d="M3 14a9 9 0 0 1 18 0" />
      <path d="M12 14l4-4" />
    </svg>
  );
}
function ThermIcon() {
  return (
    <svg viewBox="0 0 24 24" {...stroke}>
      <path d="M10 14V4a2 2 0 1 1 4 0v10" />
      <circle cx="12" cy="17" r="3" />
    </svg>
  );
}
