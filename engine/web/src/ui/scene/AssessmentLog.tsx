// Docked top-left findings panel. Reads the assessment store; shows nothing
// until the user assesses a region. Assessment findings only — equipment
// apply/detach stays in the left-rail Action Log.

import { useAssessmentStore } from '../../three/interaction/assessment/assessmentStore';

function fmtSimTime(s: number): string {
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec < 10 ? '0' : ''}${sec}`;
}

export function AssessmentLog() {
  const entries = useAssessmentStore((s) => s.entries);
  if (entries.length === 0) return null;
  return (
    <div className="assess-log" aria-label="Assessment findings">
      <h4 className="assess-log__h">Assessment</h4>
      <ul className="assess-log__list">
        {entries.map((e) => (
          <li key={e.seq} className="assess-log__row">
            <span className="assess-log__t">T+{fmtSimTime(e.atSimTimeS)}</span>
            <span className="assess-log__reg">{e.title}</span>
            <span className="assess-log__val">
              {e.finding}
              {e.source === 'static' && (
                <span className="assess-log__static"> · note</span>
              )}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
