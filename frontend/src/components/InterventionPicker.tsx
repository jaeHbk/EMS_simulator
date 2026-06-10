// Presentational multi-select for critical interventions (INTERVENTIONS stage).
// Pure / props-driven — the stage owns the store and passes the selection + a
// toggle callback. No store access. Options come from the CriticalIntervention
// union in contract.ts.

import {
  Activity,
  AlertCircle,
  Bandage,
  Brain,
  Droplet,
  Droplets,
  HeartPulse,
  Pill,
  ShieldOff,
  Syringe,
  TestTube,
  Wind,
  type LucideIcon,
} from "lucide-react";

import type { CriticalIntervention } from "../api/contract";
import { Toggle } from "@/components/ui/toggle";
import { cn } from "@/lib/utils";

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

// A lucide glyph per intervention, purely decorative (the visible label and the
// pressed state carry the meaning — never color/icon alone).
const INTERVENTION_ICONS: Record<CriticalIntervention, LucideIcon> = {
  IV_ACCESS: Syringe,
  OXYGEN: Wind,
  ECG: Activity,
  CARDIAC_MONITOR: HeartPulse,
  FLUID_BOLUS: Droplet,
  GLUCOSE_CHECK: TestTube,
  NEURO_CHECK: Brain,
  IMMOBILIZATION: Bandage,
  ANALGESIA: Pill,
  ANTIBIOTICS: Droplets,
  AIRWAY_MANAGEMENT: AlertCircle,
  NONE: ShieldOff,
};

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
    <ul
      className="intervention-picker grid grid-cols-2 gap-3 sm:grid-cols-3"
      aria-label="Critical interventions"
    >
      {INTERVENTION_OPTIONS.map((opt) => {
        const checked = selected.has(opt.key);
        const Icon = INTERVENTION_ICONS[opt.key];
        return (
          <li key={opt.key} className="intervention-picker__item">
            <Toggle
              variant="outline"
              size="lg"
              aria-label={opt.label}
              pressed={checked}
              disabled={disabled}
              onPressedChange={() => onToggle(opt.key)}
              className={cn(
                "h-auto w-full justify-start gap-3 rounded-xl px-4 py-3 text-left",
                "data-[state=on]:bg-primary/10 data-[state=on]:text-foreground",
              )}
            >
              <span
                className={cn(
                  "flex size-9 shrink-0 items-center justify-center rounded-lg border transition-colors",
                  checked
                    ? "border-primary/40 bg-primary/15 text-primary"
                    : "border-border bg-muted text-muted-foreground",
                )}
              >
                <Icon className="size-4" aria-hidden="true" />
              </span>
              <span className="intervention-picker__name min-w-0 flex-1 text-sm font-medium">
                {opt.label}
              </span>
              <span
                aria-hidden="true"
                className={cn(
                  "flex size-5 shrink-0 items-center justify-center rounded-full border text-[10px] font-bold transition-colors",
                  checked
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border bg-transparent text-transparent",
                )}
              >
                {checked ? "✓" : ""}
              </span>
            </Toggle>
          </li>
        );
      })}
    </ul>
  );
}
