import { describe, expect, it } from 'vitest';
import { CABIN, ORBIT } from './orbitBounds';
import { CAMERA_PRESETS, PRESET_ORDER, presetToPosition } from './cameraPresets';

describe('camera presets', () => {
  it('defines exactly the four presets in display order', () => {
    expect(PRESET_ORDER).toEqual(['airway', 'monitor', 'fullBody', 'reset']);
    for (const id of PRESET_ORDER) expect(CAMERA_PRESETS[id]).toBeDefined();
  });

  it('every preset spherical is within the orbit bounds', () => {
    for (const id of PRESET_ORDER) {
      const p = CAMERA_PRESETS[id];
      expect(p.distance).toBeGreaterThanOrEqual(ORBIT.minDistance);
      expect(p.distance).toBeLessThanOrEqual(ORBIT.maxDistance);
      expect(p.polar).toBeGreaterThanOrEqual(ORBIT.minPolar);
      expect(p.polar).toBeLessThanOrEqual(ORBIT.maxPolar);
      expect(p.azimuth).toBeGreaterThanOrEqual(ORBIT.minAzimuth);
      expect(p.azimuth).toBeLessThanOrEqual(ORBIT.maxAzimuth);
    }
  });

  it('every preset look-at target is inside the cabin', () => {
    for (const id of PRESET_ORDER) {
      const [x, y, z] = CAMERA_PRESETS[id].target;
      expect(x).toBeGreaterThanOrEqual(CABIN.xMin); expect(x).toBeLessThanOrEqual(CABIN.xMax);
      expect(y).toBeGreaterThanOrEqual(CABIN.yMin); expect(y).toBeLessThanOrEqual(CABIN.yMax);
      expect(z).toBeGreaterThanOrEqual(CABIN.zMin); expect(z).toBeLessThanOrEqual(CABIN.zMax);
    }
  });

  it('every preset camera POSITION is inside the cabin (no wall clipping)', () => {
    for (const id of PRESET_ORDER) {
      const [x, y, z] = presetToPosition(CAMERA_PRESETS[id]);
      expect(x).toBeGreaterThanOrEqual(CABIN.xMin); expect(x).toBeLessThanOrEqual(CABIN.xMax);
      expect(y).toBeGreaterThanOrEqual(CABIN.yMin); expect(y).toBeLessThanOrEqual(CABIN.yMax);
      expect(z).toBeGreaterThanOrEqual(CABIN.zMin); expect(z).toBeLessThanOrEqual(CABIN.zMax);
    }
  });

  it('presetToPosition matches the three.js spherical convention', () => {
    const pos = presetToPosition({ id: 'reset', label: 't', target: [0,0,0], distance: 1, azimuth: 0, polar: Math.PI/2 });
    expect(pos[0]).toBeCloseTo(0, 5);
    expect(pos[1]).toBeCloseTo(0, 5);
    expect(pos[2]).toBeCloseTo(1, 5);
  });
});
