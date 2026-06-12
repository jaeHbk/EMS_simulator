import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ApiClient } from "../api/client";
import type { Encounter, Stage, TraineeAnalytics } from "../api/contract";

// Mock the client module so the singleton store (which imports the real client)
// never touches `fetch`. Each fn is a vi.fn we can program per test.
vi.mock("../api/client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../api/client")>();
  return {
    ...actual,
    apiClient: {
      createEncounter: vi.fn(),
      getEncounter: vi.fn(),
      advance: vi.fn(),
      postHistory: vi.fn(),
      postVitals: vi.fn(),
      postEsi: vi.fn(),
      postInterventions: vi.fn(),
      postFeedback: vi.fn(),
      getAnalytics: vi.fn(),
    },
    createEncounter: vi.fn(),
    getEncounter: vi.fn(),
    advance: vi.fn(),
    postHistory: vi.fn(),
    postVitals: vi.fn(),
    postEsi: vi.fn(),
    postInterventions: vi.fn(),
    postFeedback: vi.fn(),
    getAnalytics: vi.fn(),
  };
});

// Import AFTER vi.mock so the store binds to the mocked client.
import { ApiError } from "../api/client";
import { createEncounterStore, useEncounterStore } from "./encounterStore";

function makeEncounter(overrides: Partial<Encounter> = {}): Encounter {
  return {
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
    ...overrides,
  };
}

/** A fully-stubbed client where every method resolves to ENC unless reprogrammed. */
function makeMockClient(): { [K in keyof ApiClient]: ReturnType<typeof vi.fn> } {
  return {
    createEncounter: vi.fn(),
    getEncounter: vi.fn(),
    advance: vi.fn(),
    postHistory: vi.fn(),
    postVitals: vi.fn(),
    postEsi: vi.fn(),
    postInterventions: vi.fn(),
    postFeedback: vi.fn(),
    getAnalytics: vi.fn(),
  };
}

function makeAnalytics(
  overrides: Partial<TraineeAnalytics> = {},
): TraineeAnalytics {
  return {
    traineeId: "trainee-test",
    totalEncounters: 2,
    underTriageRate: 0.5,
    overTriageRate: 0,
    correctRate: 0.5,
    meanLevelsOffAbs: 0.5,
    history: [],
    ...overrides,
  };
}

describe("encounterStore (injected mock client)", () => {
  it("createEncounter sets the returned encounter as the source of truth", async () => {
    const client = makeMockClient();
    const enc = makeEncounter();
    client.createEncounter.mockResolvedValue(enc);
    const store = createEncounterStore(client as unknown as ApiClient);

    await store.getState().createEncounter(["mimic_demo"]);

    // The store passes the sources plus the per-browser trainee id (so the
    // encounter is attributed to this learner's progress analytics).
    expect(client.createEncounter).toHaveBeenCalledWith(
      ["mimic_demo"],
      expect.stringMatching(/^trainee-/),
    );
    expect(store.getState().encounter).toEqual(enc);
    expect(store.getState().loading).toBe(false);
    expect(store.getState().error).toBeNull();
  });

  it("each action forwards to the matching client method and adopts its encounter", async () => {
    const client = makeMockClient();
    const created = makeEncounter();
    client.createEncounter.mockResolvedValue(created);
    const store = createEncounterStore(client as unknown as ApiClient);
    await store.getState().createEncounter();

    const cases: Array<{
      run: () => Promise<void>;
      method: keyof ApiClient;
      args: unknown[];
      stage: Stage;
    }> = [
      {
        run: () => store.getState().advance("VITALS"),
        method: "advance",
        args: ["enc-1", "VITALS"],
        stage: "VITALS",
      },
      {
        run: () => store.getState().sendHistory("hi"),
        method: "postHistory",
        args: ["enc-1", "hi"],
        stage: "HISTORY",
      },
      {
        run: () => store.getState().measureVitals(["heartRate"]),
        method: "postVitals",
        args: ["enc-1", ["heartRate"]],
        stage: "VITALS",
      },
      {
        run: () => store.getState().assignEsi(2),
        method: "postEsi",
        args: ["enc-1", 2],
        stage: "ESI_ASSIGNMENT",
      },
      {
        run: () => store.getState().orderInterventions(["IV_ACCESS"]),
        method: "postInterventions",
        args: ["enc-1", ["IV_ACCESS"]],
        stage: "INTERVENTIONS",
      },
      {
        run: () => store.getState().requestFeedback(),
        method: "postFeedback",
        args: ["enc-1"],
        stage: "FEEDBACK",
      },
      {
        run: () => store.getState().refresh(),
        method: "getEncounter",
        args: ["enc-1"],
        stage: "HISTORY",
      },
    ];

    for (const c of cases) {
      const returned = makeEncounter({ stage: c.stage });
      client[c.method].mockResolvedValue(returned);
      await c.run();
      expect(client[c.method]).toHaveBeenCalledWith(...c.args);
      expect(store.getState().encounter).toEqual(returned);
    }
  });

  it("captures errors into state without throwing and leaves prior encounter intact", async () => {
    const client = makeMockClient();
    const enc = makeEncounter();
    client.createEncounter.mockResolvedValue(enc);
    client.advance.mockRejectedValue(new ApiError("Illegal transition", 409));
    const store = createEncounterStore(client as unknown as ApiClient);
    await store.getState().createEncounter();

    await expect(store.getState().advance("FEEDBACK")).resolves.toBeUndefined();

    expect(store.getState().error).toBe("Illegal transition");
    expect(store.getState().loading).toBe(false);
    // Prior encounter is preserved on failure.
    expect(store.getState().encounter).toEqual(enc);
  });

  it("clears the prior error at the start of a new action", async () => {
    const client = makeMockClient();
    client.createEncounter.mockRejectedValueOnce(new ApiError("boom", 500));
    const store = createEncounterStore(client as unknown as ApiClient);
    await store.getState().createEncounter();
    expect(store.getState().error).toBe("boom");

    client.createEncounter.mockResolvedValueOnce(makeEncounter());
    await store.getState().createEncounter();
    expect(store.getState().error).toBeNull();
  });

  it("actions requiring an id fail gracefully when no encounter exists", async () => {
    const client = makeMockClient();
    const store = createEncounterStore(client as unknown as ApiClient);

    await store.getState().advance("VITALS");

    expect(client.advance).not.toHaveBeenCalled();
    expect(store.getState().error).toBe("No active encounter.");
  });

  it("fetchAnalytics sets analytics from the client (null until fetched)", async () => {
    const client = makeMockClient();
    const analytics = makeAnalytics();
    client.getAnalytics.mockResolvedValue(analytics);
    const store = createEncounterStore(client as unknown as ApiClient);

    expect(store.getState().analytics).toBeNull();

    await store.getState().fetchAnalytics();

    expect(client.getAnalytics).toHaveBeenCalledWith(
      expect.stringMatching(/^trainee-/),
    );
    expect(store.getState().analytics).toEqual(analytics);
  });

  it("failing getAnalytics leaves the store usable and never throws", async () => {
    const client = makeMockClient();
    const enc = makeEncounter();
    client.createEncounter.mockResolvedValue(enc);
    client.getAnalytics.mockRejectedValue(new ApiError("analytics down", 500));
    const store = createEncounterStore(client as unknown as ApiClient);
    await store.getState().createEncounter();

    // The analytics failure is swallowed: no throw, no error banner, encounter
    // and analytics untouched.
    await expect(store.getState().fetchAnalytics()).resolves.toBeUndefined();

    expect(store.getState().analytics).toBeNull();
    expect(store.getState().error).toBeNull();
    expect(store.getState().encounter).toEqual(enc);
  });

  it("fetchAnalytics keeps the prior analytics when a later fetch fails", async () => {
    const client = makeMockClient();
    const analytics = makeAnalytics({ totalEncounters: 3 });
    client.getAnalytics.mockResolvedValueOnce(analytics);
    const store = createEncounterStore(client as unknown as ApiClient);
    await store.getState().fetchAnalytics();
    expect(store.getState().analytics).toEqual(analytics);

    client.getAnalytics.mockRejectedValueOnce(new ApiError("boom", 500));
    await store.getState().fetchAnalytics();
    // Last successful value is preserved.
    expect(store.getState().analytics).toEqual(analytics);
  });

  it("clearError and reset restore state", async () => {
    const client = makeMockClient();
    client.createEncounter.mockResolvedValue(makeEncounter());
    const store = createEncounterStore(client as unknown as ApiClient);
    await store.getState().createEncounter();

    store.getState().reset();
    expect(store.getState().encounter).toBeNull();
    expect(store.getState().error).toBeNull();
    expect(store.getState().loading).toBe(false);
  });
});

describe("useEncounterStore singleton (module-mocked client)", () => {
  beforeEach(() => {
    useEncounterStore.getState().reset();
  });

  it("uses the mocked apiClient and adopts the returned encounter", async () => {
    const { apiClient } = await import("../api/client");
    const enc = makeEncounter({ encounterId: "singleton-1" });
    (apiClient.createEncounter as ReturnType<typeof vi.fn>).mockResolvedValue(enc);

    await useEncounterStore.getState().createEncounter();

    expect(useEncounterStore.getState().encounter).toEqual(enc);
  });
});
