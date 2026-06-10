// PatientRail: the left rail of the clinical workspace. Presentational — reads
// the current encounter from the store via the shared selectors and renders the
// patient identity (chief complaint) plus a compact live-vitals readout. The
// contract carries NO demographics, so the chief complaint IS the patient
// identity here; we never invent age/sex.

import { Activity, HeartPulse, Stethoscope } from "lucide-react";

import type { Vitals } from "../api/contract";
import { useEncounter } from "../store/encounterStore";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";

interface VitalRowMeta {
  key: keyof Vitals;
  label: string;
  unit: string;
}

// Mirrors the measurable Vitals fields (presentational labels/units only).
const VITAL_ROWS: readonly VitalRowMeta[] = [
  { key: "heartRate", label: "HR", unit: "bpm" },
  { key: "systolicBP", label: "SBP", unit: "mmHg" },
  { key: "diastolicBP", label: "DBP", unit: "mmHg" },
  { key: "respiratoryRate", label: "RR", unit: "/min" },
  { key: "spo2", label: "SpO₂", unit: "%" },
  { key: "temperatureC", label: "Temp", unit: "°C" },
  { key: "painScore", label: "Pain", unit: "/10" },
  { key: "glucose", label: "Glucose", unit: "mg/dL" },
  { key: "avpu", label: "AVPU", unit: "" },
];

export function PatientRail(): JSX.Element {
  const encounter = useEncounter();

  if (!encounter) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
          <div className="flex h-11 w-11 items-center justify-center rounded-full bg-muted text-muted-foreground">
            <Stethoscope className="h-5 w-5" />
          </div>
          <p className="text-sm font-medium text-foreground">No patient loaded</p>
          <p className="text-xs text-muted-foreground">
            Start an encounter to see the patient&apos;s presentation and vitals.
          </p>
        </CardContent>
      </Card>
    );
  }

  const { chiefComplaint, measuredVitals } = encounter;
  const measuredCount = VITAL_ROWS.filter(
    (row) =>
      measuredVitals[row.key] !== null && measuredVitals[row.key] !== undefined,
  ).length;

  return (
    <Card className="overflow-hidden">
      <CardHeader className="gap-2 bg-muted/40 pb-4">
        <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
          <Stethoscope className="h-3.5 w-3.5" />
          Patient
        </div>
        <h2 className="font-semibold leading-snug tracking-tight text-foreground">
          {chiefComplaint}
        </h2>
        <p className="text-xs text-muted-foreground">Chief complaint</p>
      </CardHeader>

      <Separator />

      <CardContent className="space-y-3 pt-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm font-medium text-foreground">
            <Activity className="h-4 w-4 text-primary" />
            Live vitals
          </div>
          <Badge variant={measuredCount > 0 ? "secondary" : "outline"}>
            {measuredCount} / {VITAL_ROWS.length}
          </Badge>
        </div>

        <dl className="grid grid-cols-2 gap-2">
          {VITAL_ROWS.map((row) => {
            const value = measuredVitals[row.key];
            const isMeasured = value !== null && value !== undefined;
            return (
              <div
                key={row.key}
                data-key={row.key}
                className="flex flex-col rounded-lg border border-border bg-card px-3 py-2"
              >
                <dt className="text-[0.7rem] font-medium uppercase tracking-wide text-muted-foreground">
                  {row.label}
                </dt>
                <dd className="flex items-baseline gap-1">
                  {isMeasured ? (
                    <>
                      <span className="text-base font-semibold tabular-nums text-foreground">
                        {String(value)}
                      </span>
                      {row.unit && (
                        <span className="text-xs text-muted-foreground">
                          {row.unit}
                        </span>
                      )}
                    </>
                  ) : (
                    <span className="text-base font-semibold text-muted-foreground">
                      —
                    </span>
                  )}
                </dd>
              </div>
            );
          })}
        </dl>

        {measuredCount === 0 && (
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <HeartPulse className="h-3.5 w-3.5" />
            No vitals measured yet.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
