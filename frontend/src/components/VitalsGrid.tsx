// Presentational vitals grid for the VITALS stage. Lets the trainee pick which
// vitals to measure, and shows the values the server has already revealed.
// Pure / props-driven — the stage owns the store and passes selection + values +
// callbacks. No store access here.

import { Activity, AlertTriangle, Check, Lock } from "lucide-react";

import type { Vitals } from "../api/contract";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

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

// Deterministic, presentation-only flag. Purely a visual cue — it never changes
// which fields exist, the contract, or any data sent to the server. Conservative
// adult reference ranges; anything outside is shown with a warning accent.
function isAbnormal(key: VitalKey, value: Vitals[VitalKey]): boolean {
  if (value === null || value === undefined) {
    return false;
  }
  switch (key) {
    case "heartRate":
      return typeof value === "number" && (value < 60 || value > 100);
    case "systolicBP":
      return typeof value === "number" && (value < 90 || value > 140);
    case "diastolicBP":
      return typeof value === "number" && (value < 60 || value > 90);
    case "respiratoryRate":
      return typeof value === "number" && (value < 12 || value > 20);
    case "spo2":
      return typeof value === "number" && value < 94;
    case "temperatureC":
      return typeof value === "number" && (value < 36 || value > 38);
    case "painScore":
      return typeof value === "number" && value >= 7;
    case "glucose":
      return typeof value === "number" && (value < 70 || value > 140);
    case "avpu":
      return value !== "A";
    default:
      return false;
  }
}

export function VitalsGrid({
  selected,
  measured,
  onToggle,
  disabled = false,
}: VitalsGridProps): JSX.Element {
  return (
    <ul
      className="grid list-none grid-cols-1 gap-3 p-0 sm:grid-cols-2 lg:grid-cols-3"
      aria-label="Vitals"
    >
      {VITAL_FIELDS.map((field) => {
        const value = measured[field.key];
        const isMeasured = value !== null && value !== undefined;
        const isSelected = selected.has(field.key);
        const abnormal = isMeasured && isAbnormal(field.key, value);
        const inputId = `vital-${field.key}`;
        return (
          <li
            key={field.key}
            className={cn(
              "flex flex-col justify-between gap-3 rounded-lg border bg-card p-4 shadow-sm transition-colors",
              isMeasured && !abnormal && "border-success/40 bg-success/5",
              isMeasured && abnormal && "border-warning/50 bg-warning/5",
              !isMeasured && isSelected && "border-primary/50 bg-primary/5",
              !isMeasured &&
                !isSelected &&
                !disabled &&
                "hover:border-primary/40 hover:bg-accent/40",
            )}
            data-key={field.key}
          >
            <div className="flex items-start justify-between gap-2">
              {isMeasured ? (
                <span className="flex items-center gap-2 text-sm font-medium text-foreground">
                  <Activity className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                  {field.label}
                </span>
              ) : (
                <Label
                  htmlFor={inputId}
                  className={cn(
                    "flex cursor-pointer items-center gap-2.5 text-sm font-medium",
                    disabled && "cursor-not-allowed opacity-70",
                  )}
                >
                  <Checkbox
                    id={inputId}
                    checked={isSelected}
                    // Already-measured vitals stay shown and locked.
                    disabled={disabled}
                    onCheckedChange={() => onToggle(field.key)}
                  />
                  <span>{field.label}</span>
                </Label>
              )}
              {isMeasured ? (
                abnormal ? (
                  <Badge variant="warning" className="gap-1">
                    <AlertTriangle className="h-3 w-3" aria-hidden="true" />
                    Abnormal
                  </Badge>
                ) : (
                  <Badge variant="success" className="gap-1">
                    <Check className="h-3 w-3" aria-hidden="true" />
                    Normal
                  </Badge>
                )
              ) : (
                <Lock
                  className="h-4 w-4 shrink-0 text-muted-foreground/60"
                  aria-hidden="true"
                />
              )}
            </div>

            <div>
              {isMeasured ? (
                <p className="flex items-baseline gap-1.5">
                  <span
                    className={cn(
                      "text-3xl font-semibold leading-none tracking-tight tabular-nums",
                      abnormal ? "text-warning" : "text-foreground",
                    )}
                  >
                    {formatValue(value)}
                  </span>
                  {field.unit && (
                    <span className="text-sm font-medium text-muted-foreground">
                      {field.unit}
                    </span>
                  )}
                </p>
              ) : (
                <p className="text-sm text-muted-foreground">
                  {isSelected ? (
                    <span className="font-medium text-primary">Selected to measure</span>
                  ) : (
                    <>
                      Not measured
                      {field.unit && (
                        <span className="text-muted-foreground/70"> · {field.unit}</span>
                      )}
                    </>
                  )}
                </p>
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
