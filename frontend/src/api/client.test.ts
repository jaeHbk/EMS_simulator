import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  advance,
  ApiError,
  API_BASE,
  createEncounter,
  getEncounter,
  postEsi,
  postFeedback,
  postHistory,
  postInterventions,
  postVitals,
} from "./client";
import type { Encounter } from "./contract";

// A minimal but schema-shaped encounter the fake fetch returns.
const ENCOUNTER: Encounter = {
  encounterId: "enc-1",
  caseId: "case-1",
  stage: "HISTORY",
  chiefComplaint: "Chest pain",
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

/** Build a fetch mock that returns ENCOUNTER (or a supplied override). */
function okFetch(body: unknown = ENCOUNTER) {
  return vi.fn(
    async (_url: string, _init?: RequestInit) =>
      new Response(JSON.stringify(body), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
  );
}

function lastCall(mock: ReturnType<typeof okFetch>) {
  const call = mock.mock.calls.at(-1);
  if (!call) throw new Error("fetch was not called");
  const [url, init] = call;
  return { url, init };
}

describe("api client", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("createEncounter posts to /encounters with no sources when omitted", async () => {
    const fetchMock = okFetch();
    vi.stubGlobal("fetch", fetchMock);

    const result = await createEncounter();

    const { url, init } = lastCall(fetchMock);
    expect(url).toBe(`${API_BASE}/encounters`);
    expect(init?.method).toBe("POST");
    expect(JSON.parse(String(init?.body))).toEqual({});
    expect(result).toEqual(ENCOUNTER);
  });

  it("createEncounter includes sources when provided", async () => {
    const fetchMock = okFetch();
    vi.stubGlobal("fetch", fetchMock);

    await createEncounter(["mimic_demo", "synthetic"]);

    const { init } = lastCall(fetchMock);
    expect(JSON.parse(String(init?.body))).toEqual({
      sources: ["mimic_demo", "synthetic"],
    });
  });

  it("getEncounter GETs the encounter by id", async () => {
    const fetchMock = okFetch();
    vi.stubGlobal("fetch", fetchMock);

    const result = await getEncounter("enc-1");

    const { url, init } = lastCall(fetchMock);
    expect(url).toBe(`${API_BASE}/encounters/enc-1`);
    // No explicit method means GET.
    expect(init?.method).toBeUndefined();
    expect(result).toEqual(ENCOUNTER);
  });

  it("getEncounter url-encodes the id", async () => {
    const fetchMock = okFetch();
    vi.stubGlobal("fetch", fetchMock);

    await getEncounter("a/b c");

    expect(lastCall(fetchMock).url).toBe(`${API_BASE}/encounters/a%2Fb%20c`);
  });

  it("advance posts the target stage", async () => {
    const fetchMock = okFetch();
    vi.stubGlobal("fetch", fetchMock);

    await advance("enc-1", "VITALS");

    const { url, init } = lastCall(fetchMock);
    expect(url).toBe(`${API_BASE}/encounters/enc-1/advance`);
    expect(init?.method).toBe("POST");
    expect(JSON.parse(String(init?.body))).toEqual({ to: "VITALS" });
  });

  it("postHistory posts the trainee text", async () => {
    const fetchMock = okFetch();
    vi.stubGlobal("fetch", fetchMock);

    await postHistory("enc-1", "When did the pain start?");

    const { url, init } = lastCall(fetchMock);
    expect(url).toBe(`${API_BASE}/encounters/enc-1/history`);
    expect(init?.method).toBe("POST");
    expect(JSON.parse(String(init?.body))).toEqual({
      text: "When did the pain start?",
    });
  });

  it("postVitals posts the fields list", async () => {
    const fetchMock = okFetch();
    vi.stubGlobal("fetch", fetchMock);

    await postVitals("enc-1", ["heartRate", "spo2"]);

    const { url, init } = lastCall(fetchMock);
    expect(url).toBe(`${API_BASE}/encounters/enc-1/vitals`);
    expect(init?.method).toBe("POST");
    expect(JSON.parse(String(init?.body))).toEqual({
      fields: ["heartRate", "spo2"],
    });
  });

  it("postEsi posts the esi number", async () => {
    const fetchMock = okFetch();
    vi.stubGlobal("fetch", fetchMock);

    await postEsi("enc-1", 2);

    const { url, init } = lastCall(fetchMock);
    expect(url).toBe(`${API_BASE}/encounters/enc-1/esi`);
    expect(init?.method).toBe("POST");
    expect(JSON.parse(String(init?.body))).toEqual({ esi: 2 });
  });

  it("postInterventions posts the items list", async () => {
    const fetchMock = okFetch();
    vi.stubGlobal("fetch", fetchMock);

    await postInterventions("enc-1", ["IV_ACCESS", "OXYGEN"]);

    const { url, init } = lastCall(fetchMock);
    expect(url).toBe(`${API_BASE}/encounters/enc-1/interventions`);
    expect(init?.method).toBe("POST");
    expect(JSON.parse(String(init?.body))).toEqual({
      items: ["IV_ACCESS", "OXYGEN"],
    });
  });

  it("postFeedback posts with no body", async () => {
    const fetchMock = okFetch();
    vi.stubGlobal("fetch", fetchMock);

    await postFeedback("enc-1");

    const { url, init } = lastCall(fetchMock);
    expect(url).toBe(`${API_BASE}/encounters/enc-1/feedback`);
    expect(init?.method).toBe("POST");
    expect(init?.body).toBeUndefined();
  });

  it("throws ApiError with the server detail on non-2xx", async () => {
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({ detail: "Illegal transition" }), {
        status: 409,
        headers: { "Content-Type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(advance("enc-1", "FEEDBACK")).rejects.toMatchObject({
      name: "ApiError",
      status: 409,
      message: "Illegal transition",
    });
  });

  it("throws ApiError with status 0 on a transport failure", async () => {
    const fetchMock = vi.fn(async () => {
      throw new TypeError("Failed to fetch");
    });
    vi.stubGlobal("fetch", fetchMock);

    const error = await getEncounter("enc-1").catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).status).toBe(0);
  });
});
