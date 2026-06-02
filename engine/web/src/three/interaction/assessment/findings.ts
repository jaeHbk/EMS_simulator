// Pure mapping from a live VitalsFrame to a clinical assessment finding.
// "derived" findings are computed from the stream; "static" notes are
// fixed exam observations the scripted trace cannot drive (labeled as such
// so the UI stays honest).

import type { VitalsFrame } from '../../../lib/stream';

export type RegionId = 'chest' | 'airway' | 'radial' | 'skin' | 'pupils' | 'carotid';
export type FindingSource = 'derived' | 'static';

export interface Finding {
  title: string;
  finding: string;
  detail: string;
  source: FindingSource;
}

export function deriveFinding(region: RegionId, frame: VitalsFrame): Finding {
  switch (region) {
    case 'chest': {
      const rr = Math.round(frame.respiratory_rate_bpm);
      if (rr === 0) {
        return { title: 'Chest · auscultation', finding: 'No breath sounds', detail: 'Chest not rising — apneic.', source: 'derived' };
      }
      return { title: 'Chest · auscultation', finding: 'Breath sounds present', detail: `Equal bilaterally, RR ${rr}/min.`, source: 'derived' };
    }
    case 'airway': {
      const rr = Math.round(frame.respiratory_rate_bpm);
      if (rr === 0 || frame.etco2_mmhg < 5) {
        return { title: 'Airway', finding: 'No air movement', detail: 'No spontaneous ventilation — airway at risk.', source: 'derived' };
      }
      return { title: 'Airway', finding: 'Patent', detail: 'Spontaneous air movement present.', source: 'derived' };
    }
    case 'radial': {
      const hr = Math.round(frame.heart_rate_bpm);
      const weak = frame.spo2_fraction < 0.9 || frame.systolic_bp_mmhg < 90;
      return { title: 'Radial pulse', finding: `${hr} bpm`, detail: weak ? 'Weak, thready.' : 'Strong, regular.', source: 'derived' };
    }
    case 'skin': {
      if (frame.spo2_fraction < 0.9) {
        return { title: 'Skin', finding: 'Cyanotic, cool', detail: 'Peripheral cyanosis — low SpO₂.', source: 'derived' };
      }
      if (frame.systolic_bp_mmhg < 90) {
        return { title: 'Skin', finding: 'Pale, clammy', detail: 'Poor perfusion — low BP.', source: 'derived' };
      }
      return { title: 'Skin', finding: 'Warm, dry, pink', detail: 'Well perfused.', source: 'derived' };
    }
    case 'pupils':
      return { title: 'Pupils', finding: 'Equal & reactive', detail: 'PERRL — baseline exam note, not driven by live vitals.', source: 'static' };
    case 'carotid':
      return { title: 'Carotid pulse', finding: 'Palpable', detail: 'Central pulse present — baseline exam note.', source: 'static' };
  }
}
