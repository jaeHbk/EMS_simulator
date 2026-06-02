// In-scene floating label for the most recent finding. Auto-fades ~6 s
// after the finding's seq changes (setTimeout, not rAF).

import { Html } from '@react-three/drei';
import { useEffect, useState } from 'react';
import { HOTSPOTS } from './hotspots';
import { latestByRegion, useAssessmentStore } from './assessmentStore';

const VISIBLE_MS = 6000;

export function AssessmentCallout() {
  const entries = useAssessmentStore((s) => s.entries);
  const latest = latestByRegion(entries);
  const newest = entries[0];
  const [shownSeq, setShownSeq] = useState<number | null>(null);

  useEffect(() => {
    if (!newest) return;
    setShownSeq(newest.seq);
    const t = window.setTimeout(() => setShownSeq(null), VISIBLE_MS);
    return () => window.clearTimeout(t);
  }, [newest?.seq]);

  if (!newest || shownSeq !== newest.seq) return null;
  const hot = HOTSPOTS.find((h) => h.id === newest.regionId);
  if (!hot) return null;
  const entry = latest.get(newest.regionId);
  if (!entry) return null;

  return (
    <Html
      position={hot.anchor}
      center
      distanceFactor={5}
      zIndexRange={[0, 0]}
      wrapperClass="assess-callout-wrap"
    >
      <div className={`assess-callout ${entry.source === 'static' ? 'is-static' : ''}`}>
        <div className="assess-callout__ti">{entry.title}</div>
        <div className="assess-callout__fi">{entry.finding}</div>
        <div className="assess-callout__de">{entry.detail}</div>
      </div>
    </Html>
  );
}
