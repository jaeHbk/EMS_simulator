// TypeScript embodiment of shared/schemas/*.json. Keep in lockstep with the JSON
// schemas and the backend Pydantic models (app/models/). The contract test guards
// drift. Never add a cross-boundary field here without updating the schema first.

export type Stage =
  | "CASE_LOAD"
  | "HISTORY"
  | "VITALS"
  | "ESI_ASSIGNMENT"
  | "INTERVENTIONS"
  | "FEEDBACK";

// Canonical forward order, mirrors STAGE_ORDER in app/models/encounter.py.
export const STAGE_ORDER: readonly Stage[] = [
  "CASE_LOAD",
  "HISTORY",
  "VITALS",
  "ESI_ASSIGNMENT",
  "INTERVENTIONS",
  "FEEDBACK",
];

export type AVPU = "A" | "V" | "P" | "U";

export interface Vitals {
  heartRate: number | null;
  systolicBP: number | null;
  diastolicBP: number | null;
  respiratoryRate: number | null;
  spo2: number | null;
  temperatureC: number | null;
  painScore: number | null;
  glucose: number | null;
  avpu: AVPU | null;
}

export type CriticalIntervention =
  | "IV_ACCESS"
  | "OXYGEN"
  | "ECG"
  | "CARDIAC_MONITOR"
  | "FLUID_BOLUS"
  | "GLUCOSE_CHECK"
  | "NEURO_CHECK"
  | "IMMOBILIZATION"
  | "ANALGESIA"
  | "ANTIBIOTICS"
  | "AIRWAY_MANAGEMENT"
  | "NONE";

export type Role = "trainee" | "patient";

export interface HistoryTurn {
  role: Role;
  text: string;
}

export type TriageDirection = "CORRECT" | "OVER_TRIAGE" | "UNDER_TRIAGE";

export type DimensionKey =
  | "ESI_ACCURACY"
  | "HISTORY_COMPLETENESS"
  | "VITALS_ACQUISITION"
  | "INTERVENTION_RECOGNITION"
  | "OUTCOME_ALIGNMENT";

export interface EsiResult {
  assigned: number;
  expert: number;
  correct: boolean;
  triageDirection: TriageDirection;
  levelsOff: number;
}

export interface ScoreDimension {
  key: DimensionKey;
  label: string;
  score: number; // 0..1
  weight: number; // 0..1
  detail: string;
}

export interface ScoreReport {
  encounterId: string;
  esi: EsiResult;
  dimensions: ScoreDimension[];
  overallPercent: number;
  narrative: string;
  missedRedFlags: string[];
}

// The wire format: GET /api/encounters/{id}. Never carries expert labels before
// stage === "FEEDBACK".
export interface Encounter {
  encounterId: string;
  caseId: string;
  stage: Stage;
  chiefComplaint: string;
  history: HistoryTurn[];
  measuredVitals: Vitals;
  esiAssigned: number | null;
  interventionsOrdered: string[];
  scoreReport: ScoreReport | null;
  startedAt: string | null;
  completedAt: string | null;
}
