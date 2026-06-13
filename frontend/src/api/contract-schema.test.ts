// TS-side contract conformance: the mirror of backend/tests/test_contract.py.
//
// The JSON Schemas in shared/schemas/ are the single source of truth for the
// Python<->TypeScript wire contract. The Python test validates real backend
// objects against them; THIS test validates that objects shaped by the
// TypeScript types in contract.ts also conform — closing the gap where
// contract.ts was previously hand-maintained with no automated guard.
//
// How drift is caught: the fixtures below are typed (`Encounter`, `ScoreReport`),
// so renaming/removing a field in contract.ts breaks compilation here; and ajv
// validation against the schema catches a field whose name/type/nullability
// disagrees with the schema. Both directions are guarded.

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import Ajv, { type AnySchema } from "ajv";
import addFormats from "ajv-formats";
import { beforeAll, describe, expect, it } from "vitest";

import type {
  CohortAnalytics,
  Encounter,
  ScoreReport,
  TraineeAnalytics,
} from "./contract";

// Vitest runs with process.cwd() at the frontend/ dir, and shared/schemas is a
// sibling of frontend/. (Resolved from cwd rather than import.meta.url, since the
// jsdom test environment shadows the global URL and breaks fileURLToPath.)
const SCHEMA_DIR = resolve(process.cwd(), "../shared/schemas");

function loadSchema(file: string): AnySchema {
  return JSON.parse(readFileSync(resolve(SCHEMA_DIR, file), "utf-8")) as AnySchema;
}

let ajv: Ajv;

beforeAll(() => {
  ajv = new Ajv({ allErrors: true, strict: false });
  addFormats(ajv);
  // Register all three so the encounter schema's $refs (vitals from triage-case,
  // the nested score-report) resolve via their $id base URIs.
  ajv.addSchema(loadSchema("triage-case.schema.json"));
  ajv.addSchema(loadSchema("score-report.schema.json"));
  ajv.addSchema(loadSchema("encounter.schema.json"));
  // The analytics schemas are standalone (no cross-file $refs), so order is irrelevant.
  ajv.addSchema(loadSchema("analytics.schema.json"));
  ajv.addSchema(loadSchema("cohort-analytics.schema.json"));
});

/** Validate `instance` against the schema with the given $id; assert no errors. */
function validate(schemaId: string, instance: unknown): void {
  const validateFn = ajv.getSchema(schemaId);
  expect(validateFn, `schema ${schemaId} not registered`).toBeDefined();
  const ok = validateFn!(instance);
  if (!ok) {
    const msg = (validateFn!.errors ?? [])
      .map((e) => `  - ${e.instancePath || "<root>"}: ${e.message}`)
      .join("\n");
    throw new Error(`schema violations for ${schemaId}:\n${msg}`);
  }
}

const ENCOUNTER_ID = "https://ed-triage-trainer/schemas/encounter.schema.json";
const SCORE_REPORT_ID = "https://ed-triage-trainer/schemas/score-report.schema.json";
const ANALYTICS_ID = "https://ed-triage-trainer/schemas/analytics.schema.json";
const COHORT_ANALYTICS_ID =
  "https://ed-triage-trainer/schemas/cohort-analytics.schema.json";

// --- Representative + edge-case fixtures, typed against contract.ts ---

const FULL_SCORE_REPORT: ScoreReport = {
  encounterId: "enc-1",
  esi: {
    assigned: 4,
    expert: 2,
    correct: false,
    triageDirection: "UNDER_TRIAGE",
    levelsOff: 2,
  },
  dimensions: [
    { key: "ESI_ACCURACY", label: "ESI Accuracy", score: 0, weight: 0.4, detail: "Under-triage." },
    {
      key: "HISTORY_COMPLETENESS",
      label: "History Completeness",
      score: 0.5,
      weight: 0.2,
      detail: "Some red flags missed.",
    },
    {
      key: "VITALS_ACQUISITION",
      label: "Vitals Acquisition",
      score: 1,
      weight: 0.1,
      detail: "All measured.",
    },
    {
      key: "INTERVENTION_RECOGNITION",
      label: "Intervention Recognition",
      score: 0.67,
      weight: 0.15,
      detail: "One missed.",
    },
    {
      key: "OUTCOME_ALIGNMENT",
      label: "Outcome Alignment",
      score: 0,
      weight: 0.15,
      detail: "Inconsistent.",
    },
  ],
  overallPercent: 26.4,
  narrative: "Safety alert: this was an under-triage.",
  missedRedFlags: ["Migratory RLQ pain"],
};

// A fully-populated, walked-to-FEEDBACK encounter (carries a nested ScoreReport).
const FULL_ENCOUNTER: Encounter = {
  encounterId: "enc-1",
  caseId: "synthetic:chest-pain-001",
  stage: "FEEDBACK",
  chiefComplaint: "Chest pain",
  history: [
    { role: "trainee", text: "When did it start?" },
    { role: "patient", text: "About an hour ago." },
  ],
  measuredVitals: {
    heartRate: 104,
    systolicBP: 138,
    diastolicBP: 82,
    respiratoryRate: 20,
    spo2: 96,
    temperatureC: 37.3,
    painScore: 6,
    glucose: null,
    avpu: "A",
  },
  esiAssigned: 4,
  interventionsOrdered: ["IV_ACCESS", "ECG"],
  scoreReport: FULL_SCORE_REPORT,
  startedAt: "2026-06-09T00:00:00Z",
  completedAt: "2026-06-09T00:05:00Z",
  traineeId: "trainee-abc",
  cohortId: "cohort-x",
};

// A freshly-created encounter at CASE_LOAD: nulls where the model defaults to None.
const FRESH_ENCOUNTER: Encounter = {
  encounterId: "enc-2",
  caseId: "synthetic:laceration-008",
  stage: "CASE_LOAD",
  chiefComplaint: "Cut on hand",
  history: [],
  measuredVitals: {
    heartRate: null,
    systolicBP: null,
    diastolicBP: null,
    respiratoryRate: null,
    spo2: null,
    temperatureC: null,
    painScore: null,
    glucose: null,
    avpu: null,
  },
  esiAssigned: null,
  interventionsOrdered: [],
  scoreReport: null,
  startedAt: "2026-06-09T00:00:00Z",
  completedAt: null,
  traineeId: null,
  cohortId: null,
};

// A populated learning-curve report (one of each triage direction), and a zeroed
// report for an unknown trainee — the edge case the endpoint returns instead of 404.
const FULL_ANALYTICS: TraineeAnalytics = {
  traineeId: "trainee-abc",
  totalEncounters: 3,
  underTriageRate: 1 / 3,
  overTriageRate: 1 / 3,
  correctRate: 1 / 3,
  meanLevelsOffAbs: 2 / 3,
  history: [
    {
      encounterId: "enc-1",
      startedAt: "2026-06-09T00:00:00Z",
      triageDirection: "CORRECT",
      esiAssigned: 3,
      esiExpert: 3,
      overallPercent: 92.5,
    },
    {
      encounterId: "enc-2",
      startedAt: "2026-06-09T00:05:00Z",
      triageDirection: "UNDER_TRIAGE",
      esiAssigned: 4,
      esiExpert: 3,
      overallPercent: 41.0,
    },
    {
      encounterId: "enc-3",
      startedAt: null,
      triageDirection: "OVER_TRIAGE",
      esiAssigned: 2,
      esiExpert: 3,
      overallPercent: 68.0,
    },
  ],
};

const ZEROED_ANALYTICS: TraineeAnalytics = {
  traineeId: "nobody-here",
  totalEncounters: 0,
  underTriageRate: 0,
  overTriageRate: 0,
  correctRate: 0,
  meanLevelsOffAbs: 0,
  // No scored encounters -> the difficulty segmentation is null.
  byDifficulty: null,
  history: [],
};

// Same shape as FULL_ANALYTICS but carrying the optional byDifficulty segmentation:
// the trap bucket isolates under-triage on benign-looking-but-dangerous cases.
const ANALYTICS_WITH_DIFFICULTY: TraineeAnalytics = {
  ...FULL_ANALYTICS,
  byDifficulty: {
    trap: { totalEncounters: 1, underTriageRate: 1 },
    standard: { totalEncounters: 2, underTriageRate: 0 },
  },
};

// A populated cohort report: two trainees (one struggling, sorted first) plus the
// optional byDifficulty segmentation. And a zeroed report for an unknown cohort —
// the edge case the endpoint returns instead of 404.
const FULL_COHORT_ANALYTICS: CohortAnalytics = {
  cohortId: "cohort-x",
  totalTrainees: 2,
  totalEncounters: 3,
  underTriageRate: 1 / 3,
  overTriageRate: 1 / 3,
  correctRate: 1 / 3,
  meanLevelsOffAbs: 2 / 3,
  byDifficulty: {
    trap: { totalEncounters: 1, underTriageRate: 1 },
    standard: { totalEncounters: 2, underTriageRate: 0 },
  },
  // Sorted underTriageRate desc, tie-broken by traineeId asc (struggling first).
  trainees: [
    { traineeId: "trainee-a", totalEncounters: 1, underTriageRate: 1, correctRate: 0 },
    { traineeId: "trainee-b", totalEncounters: 2, underTriageRate: 0, correctRate: 0.5 },
  ],
};

const ZEROED_COHORT_ANALYTICS: CohortAnalytics = {
  cohortId: "nobody-here",
  totalTrainees: 0,
  totalEncounters: 0,
  underTriageRate: 0,
  overTriageRate: 0,
  correctRate: 0,
  meanLevelsOffAbs: 0,
  // No scored encounters -> the difficulty segmentation is null.
  byDifficulty: null,
  trainees: [],
};

describe("contract.ts conforms to shared JSON schemas", () => {
  it("a fully-populated Encounter (FEEDBACK, nested ScoreReport) conforms", () => {
    validate(ENCOUNTER_ID, FULL_ENCOUNTER);
  });

  it("a fresh Encounter (CASE_LOAD, nullable fields) conforms", () => {
    validate(ENCOUNTER_ID, FRESH_ENCOUNTER);
  });

  it("a ScoreReport conforms on its own schema", () => {
    validate(SCORE_REPORT_ID, FULL_SCORE_REPORT);
  });

  it("rejects an Encounter with an unknown field (additionalProperties:false)", () => {
    const bad = { ...FRESH_ENCOUNTER, bogusField: 1 };
    expect(() => validate(ENCOUNTER_ID, bad)).toThrow(/schema violations/);
  });

  it("rejects a ScoreReport missing a required field", () => {
    const { overallPercent: _omit, ...bad } = FULL_SCORE_REPORT;
    void _omit;
    expect(() => validate(SCORE_REPORT_ID, bad)).toThrow(/schema violations/);
  });

  it("a populated TraineeAnalytics (one of each triage direction) conforms", () => {
    validate(ANALYTICS_ID, FULL_ANALYTICS);
  });

  it("a zeroed TraineeAnalytics (unknown trainee, empty history) conforms", () => {
    validate(ANALYTICS_ID, ZEROED_ANALYTICS);
  });

  it("a TraineeAnalytics WITH byDifficulty (trap + standard buckets) conforms", () => {
    validate(ANALYTICS_ID, ANALYTICS_WITH_DIFFICULTY);
  });

  it("a TraineeAnalytics WITHOUT byDifficulty conforms (the field is optional)", () => {
    // FULL_ANALYTICS omits byDifficulty entirely; ZEROED_ANALYTICS sets it null.
    validate(ANALYTICS_ID, FULL_ANALYTICS);
    expect("byDifficulty" in FULL_ANALYTICS).toBe(false);
  });

  it("rejects byDifficulty missing a required bucket", () => {
    const bad = {
      ...FULL_ANALYTICS,
      byDifficulty: { trap: { totalEncounters: 1, underTriageRate: 1 } },
    };
    expect(() => validate(ANALYTICS_ID, bad)).toThrow(/schema violations/);
  });

  it("rejects byDifficulty with an out-of-range bucket rate", () => {
    const bad = {
      ...FULL_ANALYTICS,
      byDifficulty: {
        trap: { totalEncounters: 1, underTriageRate: 1.5 },
        standard: { totalEncounters: 0, underTriageRate: 0 },
      },
    };
    expect(() => validate(ANALYTICS_ID, bad)).toThrow(/schema violations/);
  });

  it("rejects TraineeAnalytics with an out-of-range rate", () => {
    const bad = { ...ZEROED_ANALYTICS, underTriageRate: 1.5 };
    expect(() => validate(ANALYTICS_ID, bad)).toThrow(/schema violations/);
  });

  it("a populated CohortAnalytics (trainees + byDifficulty) conforms", () => {
    validate(COHORT_ANALYTICS_ID, FULL_COHORT_ANALYTICS);
  });

  it("a zeroed CohortAnalytics (unknown cohort, empty trainees) conforms", () => {
    validate(COHORT_ANALYTICS_ID, ZEROED_COHORT_ANALYTICS);
  });

  it("rejects a CohortAnalytics trainee row missing a required field", () => {
    const bad = {
      ...FULL_COHORT_ANALYTICS,
      trainees: [{ traineeId: "trainee-a", totalEncounters: 1, underTriageRate: 1 }],
    };
    expect(() => validate(COHORT_ANALYTICS_ID, bad)).toThrow(/schema violations/);
  });

  it("rejects a CohortAnalytics with an out-of-range rate", () => {
    const bad = { ...ZEROED_COHORT_ANALYTICS, underTriageRate: 1.5 };
    expect(() => validate(COHORT_ANALYTICS_ID, bad)).toThrow(/schema violations/);
  });
});
