// Action posting + optimistic-state tracking.
//
// Action lifecycle:
//   1. Caller invokes `postAction({ action_type, params })`.
//   2. We mint a ULID-like idempotency key, mark the action `pending`, and
//      POST to /api/actions.
//   3. Server returns 202 with `accepted_at_tick`. Caller can render the
//      attached state immediately (optimistic).
//   4. Within the retention window the server echoes the action_id in
//      `VitalsFrame.interventions`. The watcher hook reconciles: pending →
//      confirmed.
//   5. If no echo within TIMEOUT_MS, the action is rolled back.
//
// The server's trace engine no-ops the vitals impact, so the visual snap
// works but vitals stay scripted. Pulse FFI later turns the no-op into a
// real engine-side effect.

import { create } from 'zustand';
import type { ActionAccepted, ActionEnvelope } from './stream';

const ECHO_TIMEOUT_MS = 5_000;
/** Drop confirmed/rejected records older than this so the Map never
 *  grows unbounded across long scenarios. Pending records are never
 *  pruned — they age into rejected naturally. */
const RETENTION_MS = 60_000;

type ActionStatus = 'pending' | 'confirmed' | 'rejected';

export interface ActionRecord {
  action_id: string;
  action_type: string;
  params: unknown;
  status: ActionStatus;
  /** Epoch ms when the request was sent. */
  sentAtMs: number;
  /** Set on confirmation. */
  acceptedAtTick?: number;
  /** Failure reason on rejection. */
  reason?: string;
}

interface ActionsState {
  /** All actions seen this session, keyed by action_id. */
  records: Map<string, ActionRecord>;
  /** Bump on every store change so React selectors can read deterministically. */
  version: number;
  upsert: (record: ActionRecord) => void;
  setStatus: (action_id: string, status: ActionStatus, reason?: string) => void;
  /** Reconcile against a fresh interventions echo from the server. */
  reconcile: (interventions: string[]) => void;
}

export const useActionsStore = create<ActionsState>((set, get) => ({
  records: new Map(),
  version: 0,
  upsert: (record) =>
    set((s) => {
      const next = new Map(s.records);
      next.set(record.action_id, record);
      return { records: next, version: s.version + 1 };
    }),
  setStatus: (action_id, status, reason) =>
    set((s) => {
      const existing = s.records.get(action_id);
      if (!existing || existing.status === status) return {};
      const next = new Map(s.records);
      next.set(action_id, { ...existing, status, ...(reason ? { reason } : {}) });
      return { records: next, version: s.version + 1 };
    }),
  reconcile: (interventions) => {
    const now = Date.now();
    let changed = false;
    const { records } = get();
    const next = new Map(records);
    const echoSet = new Set(interventions);

    for (const [id, rec] of records) {
      if (rec.status === 'pending') {
        if (echoSet.has(id)) {
          next.set(id, { ...rec, status: 'confirmed' });
          changed = true;
        } else if (now - rec.sentAtMs > ECHO_TIMEOUT_MS) {
          next.set(id, {
            ...rec,
            status: 'rejected',
            reason: 'no server echo within timeout',
          });
          changed = true;
        }
      } else if (now - rec.sentAtMs > RETENTION_MS) {
        // Drop old confirmed/rejected so the Map doesn't grow forever.
        next.delete(id);
        changed = true;
      }
    }
    if (changed) set((s) => ({ records: next, version: s.version + 1 }));
  },
}));

/** Reduce a set of action records to the equipment IDs currently attached.
 *  For each equipment, the most-recent non-rejected apply/remove action
 *  wins; attached iff that latest action is an apply. Pure + testable. */
export function attachedFromRecords(
  records: Iterable<ActionRecord>,
): Set<string> {
  const latest = new Map<string, ActionRecord>();
  for (const rec of records) {
    if (
      rec.action_type !== 'apply_equipment' &&
      rec.action_type !== 'remove_equipment'
    ) {
      continue;
    }
    if (rec.status === 'rejected') continue;
    const eq = (rec.params as { equipment?: string } | null)?.equipment;
    if (!eq) continue;
    const prev = latest.get(eq);
    if (!prev || rec.sentAtMs > prev.sentAtMs) latest.set(eq, rec);
  }
  const attached = new Set<string>();
  for (const [eq, rec] of latest) {
    if (rec.action_type === 'apply_equipment') attached.add(eq);
  }
  return attached;
}

/** Crockford-style 26-char ULID-like identifier. Time prefix (10 chars
 *  base32 ms-since-epoch) + 16 random chars. Not cryptographically strong;
 *  enough for client-side idempotency. */
export function newActionId(): string {
  const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
  let timePart = '';
  let ms = Date.now();
  for (let i = 9; i >= 0; i -= 1) {
    timePart = ALPHABET[ms % 32]! + timePart;
    ms = Math.floor(ms / 32);
  }
  let rand = '';
  for (let i = 0; i < 16; i += 1) {
    rand += ALPHABET[Math.floor(Math.random() * 32)];
  }
  return timePart + rand;
}

/** POST an action to the sim server. Caller passes everything except the
 *  ID, which we mint here. Returns the minted action_id. */
export async function postAction(input: {
  action_type: string;
  params: unknown;
}): Promise<string> {
  const action_id = newActionId();
  const envelope: ActionEnvelope = {
    action_id,
    action_type: input.action_type,
    params: input.params,
    client_ts_ms: Date.now(),
  };

  useActionsStore.getState().upsert({
    action_id,
    action_type: input.action_type,
    params: input.params,
    status: 'pending',
    sentAtMs: Date.now(),
  });

  try {
    const resp = await fetch('/api/actions', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(envelope),
    });
    if (!resp.ok) {
      // Real-server rejection — keep the record so a band-aware UI can
      // tell the user. The optimistic attach is rolled back.
      useActionsStore
        .getState()
        .setStatus(action_id, 'rejected', `server ${resp.status}`);
      return action_id;
    }

    // Vite's dev server returns the SPA HTML fallback (200 OK,
    // text/html, ~1 KB) for any unproxied path. That means no backend
    // is attached. In that case we auto-confirm the action so the
    // optimistic attach sticks instead of timing out after 5s.
    const ct = (resp.headers.get('content-type') ?? '').toLowerCase();
    if (ct.startsWith('text/html')) {
      useActionsStore
        .getState()
        .setStatus(action_id, 'confirmed');
      return action_id;
    }

    const accepted = (await resp.json()) as ActionAccepted;
    // Keep status pending — we wait for the interventions echo to flip
    // it to confirmed. accepted_at_tick is informational.
    useActionsStore.getState().upsert({
      action_id,
      action_type: input.action_type,
      params: input.params,
      status: 'pending',
      sentAtMs: Date.now(),
      acceptedAtTick: accepted.accepted_at_tick,
    });
  } catch (e) {
    // Network failure means no backend is reachable. Auto-confirm so
    // demo-mode users can still attach equipment locally; mirrors the
    // demo-mode pattern in lib/stream.ts and useScenarios.ts.
    useActionsStore
      .getState()
      .setStatus(
        action_id,
        'confirmed',
      );
    void e; // reason intentionally not stored — local-confirm is the success path here.
  }
  return action_id;
}
