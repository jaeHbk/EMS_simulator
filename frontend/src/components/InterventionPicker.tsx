// Presentational multi-select for critical interventions (INTERVENTIONS stage).
// Pure / props-driven — the stage owns the store and passes the selection + a
// toggle callback. No store access. Options come from the CriticalIntervention
// union in contract.ts.

import type { CriticalIntervention } from "../api/contract";

interface InterventionMeta {
  key: CriticalIntervention;
  label: string;
}

// Human-readable labels for each contract enum value.
export const INTERVENTION_OPTIONS: readonly InterventionMeta[] = [
  { key: "IV_ACCESS", label: "IV access" },
  { key: "OXYGEN", label: "Oxygen" },
  { key: "ECG", label: "ECG / 12-lead" },
  { key: "CARDIAC_MONITOR", label: "Cardiac monitor" },
  { key: "FLUID_BOLUS", label: "Fluid bolus" },
  { key: "GLUCOSE_CHECK", label: "Glucose check" },
  { key: "NEURO_CHECK", label: "Neuro check" },
  { key: "IMMOBILIZATION", label: "Immobilization" },
  { key: "ANALGESIA", label: "Analgesia" },
  { key: "ANTIBIOTICS", label: "Antibiotics" },
  { key: "AIRWAY_MANAGEMENT", label: "Airway management" },
  { key: "NONE", label: "None needed" },
];

export interface InterventionPickerProps {
  selected: ReadonlySet<string>;
  onToggle: (key: CriticalIntervention) => void;
  disabled?: boolean;
}

export function InterventionPicker({
  selected,
  onToggle,
  disabled = false,
}: InterventionPickerProps): JSX.Element {
  return (
    <ul className="intervention-picker" aria-label="Critical interventions">
      {INTERVENTION_OPTIONS.map((opt) => {
        const checked = selected.has(opt.key);
        const inputId = `intervention-${opt.key}`;
        return (
          <li key={opt.key} className="intervention-picker__item">
            <label className="intervention-picker__label" htmlFor={inputId}>
              <input
                id={inputId}
                type="checkbox"
                className="intervention-picker__checkbox"
                checked={checked}
                disabled={disabled}
                onChange={() => onToggle(opt.key)}
              />
              <span className="intervention-picker__name">{opt.label}</span>
            </label>
          </li>
        );
      })}
    </ul>
  );
}
