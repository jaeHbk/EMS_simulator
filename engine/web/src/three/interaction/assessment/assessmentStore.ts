// Append-only, capped log of assessment findings. The docked AssessmentLog
// reads `entries`; the in-scene callout reads `latestByRegion`. Holds
// assessment findings ONLY — equipment apply/detach stays in the left-rail
// Action Log (no duplication).

import { create } from 'zustand';
import type { Finding, RegionId } from './findings';

const MAX_ENTRIES = 25;

export interface AssessmentEntry extends Finding {
  regionId: RegionId;
  atSimTimeS: number;
  seq: number;
}

interface AssessmentState {
  entries: AssessmentEntry[];
  seq: number;
  record: (regionId: RegionId, finding: Finding, atSimTimeS: number) => void;
  clear: () => void;
}

export const useAssessmentStore = create<AssessmentState>((set) => ({
  entries: [],
  seq: 0,
  record: (regionId, finding, atSimTimeS) =>
    set((s) => {
      const nextSeq = s.seq + 1;
      const entry: AssessmentEntry = { ...finding, regionId, atSimTimeS, seq: nextSeq };
      return { entries: [entry, ...s.entries].slice(0, MAX_ENTRIES), seq: nextSeq };
    }),
  clear: () => set({ entries: [], seq: 0 }),
}));

/** Most-recent entry per region (entries are newest-first). */
export function latestByRegion(entries: readonly AssessmentEntry[]): Map<RegionId, AssessmentEntry> {
  const m = new Map<RegionId, AssessmentEntry>();
  for (const e of entries) if (!m.has(e.regionId)) m.set(e.regionId, e);
  return m;
}
