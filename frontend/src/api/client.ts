// Typed API client for the ED Triage Trainer backend.
//
// One async function per backend route documented in docs/MODULE_INTERFACES.md.
// Every route returns the full `Encounter` (the single wire format), so each
// function resolves to `Promise<Encounter>`. Fetch, JSON parsing, and error
// handling are centralized in `request()` so the call sites stay thin.
//
// Base path is "/api"; Vite proxies it to FastAPI in dev (see vite.config.ts).
// Nothing here requires a network or API key to *exist* — these functions are
// only invoked when the user acts, and they degrade gracefully via ApiError.

import type {
  CohortAnalytics,
  Encounter,
  Stage,
  TraineeAnalytics,
} from "./contract";

/** Base path for all backend routes. Vite proxies "/api" to the FastAPI server. */
export const API_BASE = "/api";

/**
 * Error thrown when a request fails (non-2xx response or network failure).
 * Carries the HTTP status (0 for network/transport errors) and, when present,
 * the server-provided message so the UI can surface something useful.
 */
export class ApiError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

/**
 * Centralized fetch + JSON + error handling.
 *
 * - Always sends/accepts JSON.
 * - On a non-2xx response, attempts to extract a server error message
 *   (FastAPI's `{ detail }` convention, or a plain string body) and throws
 *   an `ApiError` carrying the status.
 * - On a transport-level failure (offline, DNS, etc.) throws an `ApiError`
 *   with status 0 so callers can distinguish it from an HTTP error.
 */
async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${API_BASE}${path}`, {
      headers: { "Content-Type": "application/json" },
      ...init,
    });
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : "Network request failed";
    throw new ApiError(message, 0);
  }

  if (!response.ok) {
    throw new ApiError(await extractErrorMessage(response), response.status);
  }

  return (await response.json()) as T;
}

/** Best-effort extraction of a human-readable error message from a failed response. */
async function extractErrorMessage(response: Response): Promise<string> {
  const fallback = `Request failed (${response.status} ${response.statusText})`;
  try {
    const text = await response.text();
    if (!text) return fallback;
    try {
      const body: unknown = JSON.parse(text);
      if (body && typeof body === "object" && "detail" in body) {
        const detail = (body as { detail: unknown }).detail;
        if (typeof detail === "string") return detail;
        return JSON.stringify(detail);
      }
      return typeof body === "string" ? body : text;
    } catch {
      return text;
    }
  } catch {
    return fallback;
  }
}

/** Helper for JSON POST bodies. */
function postJson(body: unknown): RequestInit {
  return { method: "POST", body: JSON.stringify(body) };
}

// --- One function per backend route (MODULE_INTERFACES.md) ---

/**
 * POST /api/encounters — picks a case and creates a fresh encounter (CASE_LOAD).
 * @param sources Optional list of source ids to draw the case from; when omitted
 *   the backend uses its configured default sources.
 * @param traineeId Optional opaque per-browser learner id; when provided it is
 *   sent so the encounter is attributed to the trainee's progress analytics.
 * @param cohortId Optional opaque cohort code; when provided it is sent so the
 *   encounter is grouped into the cohort's instructor aggregate. Appended as the
 *   3rd positional param so existing `createEncounter()` / `createEncounter(srcs)`
 *   call sites are unaffected, and only included in the body when truthy.
 */
export function createEncounter(
  sources?: string[],
  traineeId?: string,
  cohortId?: string,
): Promise<Encounter> {
  const body: { sources?: string[]; traineeId?: string; cohortId?: string } = {};
  if (sources) body.sources = sources;
  if (traineeId) body.traineeId = traineeId;
  if (cohortId) body.cohortId = cohortId;
  return request<Encounter>("/encounters", postJson(body));
}

/** GET /api/encounters/{id} — fetch the current encounter state. */
export function getEncounter(encounterId: string): Promise<Encounter> {
  return request<Encounter>(`/encounters/${encodeURIComponent(encounterId)}`);
}

/**
 * POST /api/encounters/{id}/advance — request a forward stage transition.
 * The server validates that `to` is a legal forward move; illegal moves 4xx.
 */
export function advance(encounterId: string, to: Stage): Promise<Encounter> {
  return request<Encounter>(
    `/encounters/${encodeURIComponent(encounterId)}/advance`,
    postJson({ to }),
  );
}

/**
 * POST /api/encounters/{id}/history — submit one trainee message; the backend
 * appends the trainee turn and the LLM patient reply, returning the updated state.
 */
export function postHistory(encounterId: string, text: string): Promise<Encounter> {
  return request<Encounter>(
    `/encounters/${encodeURIComponent(encounterId)}/history`,
    postJson({ text }),
  );
}

/** POST /api/encounters/{id}/vitals — measure the named vitals fields. */
export function postVitals(encounterId: string, fields: string[]): Promise<Encounter> {
  return request<Encounter>(
    `/encounters/${encodeURIComponent(encounterId)}/vitals`,
    postJson({ fields }),
  );
}

/** POST /api/encounters/{id}/esi — record the trainee's ESI decision (1–5). */
export function postEsi(encounterId: string, esi: number): Promise<Encounter> {
  return request<Encounter>(
    `/encounters/${encodeURIComponent(encounterId)}/esi`,
    postJson({ esi }),
  );
}

/** POST /api/encounters/{id}/interventions — record ordered critical interventions. */
export function postInterventions(
  encounterId: string,
  items: string[],
): Promise<Encounter> {
  return request<Encounter>(
    `/encounters/${encodeURIComponent(encounterId)}/interventions`,
    postJson({ items }),
  );
}

/**
 * POST /api/encounters/{id}/feedback — run deterministic scoring and compose the
 * narrative server-side, advancing to FEEDBACK. Takes no request body.
 */
export function postFeedback(encounterId: string): Promise<Encounter> {
  return request<Encounter>(
    `/encounters/${encodeURIComponent(encounterId)}/feedback`,
    { method: "POST" },
  );
}

/**
 * GET /api/analytics/{traineeId} — deterministic per-trainee learning-curve
 * metrics. An unknown trainee yields a zeroed report (not a 404). The traineeId
 * is an opaque analytics key, not an identity or credential.
 */
export function getAnalytics(traineeId: string): Promise<TraineeAnalytics> {
  return request<TraineeAnalytics>(
    `/analytics/${encodeURIComponent(traineeId)}`,
  );
}

/**
 * GET /api/cohort/{cohortId}/analytics — deterministic cohort-level triage
 * metrics for an instructor's aggregate view (cohort under-triage rate +
 * per-trainee breakdown). An unknown/empty cohort yields a zeroed report (not a
 * 404). The cohortId is an opaque grouping key, not an identity or credential.
 */
export function getCohortAnalytics(cohortId: string): Promise<CohortAnalytics> {
  return request<CohortAnalytics>(
    `/cohort/${encodeURIComponent(cohortId)}/analytics`,
  );
}

/** Convenience grouping so the store can be handed a single client object in tests. */
export const apiClient = {
  createEncounter,
  getEncounter,
  advance,
  postHistory,
  postVitals,
  postEsi,
  postInterventions,
  postFeedback,
  getAnalytics,
  getCohortAnalytics,
};

export type ApiClient = typeof apiClient;
