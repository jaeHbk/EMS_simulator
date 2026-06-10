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

import type { Encounter, ScoreReport } from "./contract";

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
});
