// Presentational vitals grid for the VITALS stage. Lets the trainee pick which
// vitals to measure, and shows the values the server has already revealed.
// Pure / props-driven — the stage owns the store and passes selection + values +
// callbacks. No store access here.

import type { Vitals } from "../api/contract";

// The measurable vital-sign field keys, mirroring the Vitals shape in contract.ts.
// (Presentational labels/units only — the contract remains the source of truth.)
export type VitalKey = keyof Vitals;

interface VitalFieldMeta {
  key: VitalKey;
  label: string;
  unit: string;
}

export const VITAL_FIELDS: readonly VitalFieldMeta[] = [
  { key: "heartRate", label: "Heart rate", unit: "bpm" },
  { key: "systolicBP", label: "Systolic BP", unit: "mmHg" },
  { key: "diastolicBP", label: "Diastolic BP", unit: "mmHg" },
  { key: "respiratoryRate", label: "Respiratory rate", unit: "breaths/min" },
  { key: "spo2", label: "SpO₂", unit: "%" },
  { key: "temperatureC", label: "Temperature", unit: "°C" },
  { key: "painScore", label: "Pain score", unit: "/10" },
  { key: "glucose", label: "Glucose", unit: "mg/dL" },
  { key: "avpu", label: "AVPU", unit: "" },
];

export interface VitalsGridProps {
  /** Field keys the trainee has selected to measure (not yet submitted). */
  selected: ReadonlySet<VitalKey>;
  /** Values revealed by the server for already-measured vitals. */
  measured: Vitals;
  onToggle: (key: VitalKey) => void;
  disabled?: boolean;
}

function formatValue(value: Vitals[VitalKey]): string {
  if (value === null || value === undefined) {
    return "—";
  }
  return String(value);
}

export function VitalsGrid({
  selected,
  measured,
  onToggle,
  disabled = false,
}: VitalsGridProps): JSX.Element {
  return (
    <ul className="vitals-grid" aria-label="Vitals">
      {VITAL_FIELDS.map((field) => {
        const value = measured[field.key];
        const isMeasured = value !== null && value !== undefined;
        const isSelected = selected.has(field.key);
        const inputId = `vital-${field.key}`;
        return (
          <li
            key={field.key}
            className={`vitals-grid__item${
              isMeasured ? " vitals-grid__item--measured" : ""
            }`}
            data-key={field.key}
          >
            <label className="vitals-grid__label" htmlFor={inputId}>
              <input
                id={inputId}
                type="checkbox"
                className="vitals-grid__checkbox"
                checked={isSelected || isMeasured}
                // Already-measured vitals stay shown and locked.
                disabled={disabled || isMeasured}
                onChange={() => onToggle(field.key)}
              />
              <span className="vitals-grid__name">{field.label}</span>
            </label>
            <span className="vitals-grid__value">
              {isMeasured ? (
                <>
                  <strong>{formatValue(value)}</strong>
                  {field.unit && (
                    <span className="vitals-grid__unit"> {field.unit}</span>
                  )}
                </>
              ) : (
                <span className="vitals-grid__pending">
                  {isSelected ? "selected" : "not measured"}
                </span>
              )}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
