// Renders all assessment hotspot markers on the patient plus the in-scene
// callout for the most recent finding.

import { HOTSPOTS } from './hotspots';
import { HotspotMarker } from './HotspotMarker';
import { AssessmentCallout } from './AssessmentCallout';

export function PatientHotspots() {
  return (
    <group>
      {HOTSPOTS.map((h) => (
        <HotspotMarker key={h.id} id={h.id} label={h.label} position={h.anchor} />
      ))}
      <AssessmentCallout />
    </group>
  );
}
