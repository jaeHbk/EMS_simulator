// Pure-helper tests for the fallback path. We intentionally do NOT test
// the React hook itself here — exercising drei's useGLTF in unit tests
// would require @testing-library/react + jsdom, both new deps that
// CLAUDE.md forbids. The fallback path is the contract that matters
// (no missing asset must crash the scene); the hook's React glue is
// covered at build/dev time.

import { describe, expect, it } from 'vitest';
import { Group, Mesh, MeshStandardMaterial } from 'three';
import { buildFallback, isLikelyMissingAsset } from './useGltfWithFallback';

describe('buildFallback', () => {
  it('returns a Group whose first child is a Mesh', () => {
    const g = buildFallback();
    expect(g).toBeInstanceOf(Group);
    expect(g.type).toBe('Group');
    expect(g.children).toHaveLength(1);
    expect(g.children[0]).toBeInstanceOf(Mesh);
  });

  it('uses a MeshStandardMaterial so it inherits PBR lighting', () => {
    const m = buildFallback().children[0] as Mesh;
    expect(m.material).toBeInstanceOf(MeshStandardMaterial);
  });

  it('casts and receives shadows', () => {
    const m = buildFallback().children[0] as Mesh;
    expect(m.castShadow).toBe(true);
    expect(m.receiveShadow).toBe(true);
  });

  it('produces independent instances on each call (no shared geometry / material)', () => {
    const a = buildFallback();
    const b = buildFallback();
    expect(a).not.toBe(b);
    expect((a.children[0] as Mesh).material).not.toBe((b.children[0] as Mesh).material);
  });
});

describe('isLikelyMissingAsset', () => {
  it('flags empty url', () => {
    expect(isLikelyMissingAsset('')).toBe(true);
  });

  it('flags the documented placeholder markers', () => {
    expect(isLikelyMissingAsset('/assets/__definitely_missing__.glb')).toBe(true);
    expect(isLikelyMissingAsset('/assets/__placeholder__.glb')).toBe(true);
  });

  it('does not flag real-looking asset paths', () => {
    expect(isLikelyMissingAsset('/assets/equipment/defibrillator.glb')).toBe(false);
    expect(isLikelyMissingAsset('/assets/patient/patient-supine.glb')).toBe(false);
    expect(isLikelyMissingAsset('/assets/hdri/clinical-room-1k.hdr')).toBe(false);
  });
});
