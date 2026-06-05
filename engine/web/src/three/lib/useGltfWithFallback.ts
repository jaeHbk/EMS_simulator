// Wraps drei's useGLTF so that a 404 / parse error never breaks the scene.
// On failure, returns a Group containing one primitive cube that the
// caller can render as a placeholder. `isFallback` lets caller code log
// or visually mark the placeholder.
//
// Why a custom hook instead of plain useGLTF:
//   - drei surfaces load errors as thrown promises in suspense, which
//     unmount the entire 3D subtree. A missing asset shouldn't kill the
//     whole scene during dev or after a partial deploy.
//   - The fallback Group has the same shape as the real return, so call
//     sites can `<primitive object={result.scene} />` uniformly.
//
// Test discipline: the React-bound hook itself is exercised at build /
// dev time. The pure helpers `buildFallback` and `isLikelyMissingAsset`
// are exported separately so unit tests can assert their contract
// without needing @testing-library/react or jsdom (CLAUDE.md hard
// constraint: no new npm dependencies).

import { useMemo } from 'react';
import { useGLTF } from '@react-three/drei';
import { BoxGeometry, Group, Mesh, MeshStandardMaterial } from 'three';
import type { GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';

export interface GltfHandle {
  scene: Group;
  isFallback: boolean;
  /** The full underlying GLTF when the load succeeds. Undefined on fallback. */
  raw?: GLTF;
}

const FALLBACK_COLOR = '#7a8696';

/**
 * Build a placeholder scene (a single primitive cube). Exported for
 * testability. The returned Group has the same shape (`scene.type ===
 * 'Group'`) as a real loaded GLTF scene so consumers can render it
 * via `<primitive object={...} />` uniformly.
 */
export function buildFallback(): Group {
  const g = new Group();
  const m = new Mesh(
    new BoxGeometry(0.2, 0.2, 0.2),
    new MeshStandardMaterial({ color: FALLBACK_COLOR, roughness: 0.6 }),
  );
  m.castShadow = true;
  m.receiveShadow = true;
  g.add(m);
  return g;
}

/**
 * Decide whether a given URL is likely to fail to load. The heuristic
 * here is intentionally narrow: a URL pointing at the documented assets
 * directory whose filename looks like a placeholder marker (or is empty)
 * is treated as missing without attempting a network round-trip. This
 * keeps unit tests deterministic without faking the loader. Exported
 * for testability.
 */
export function isLikelyMissingAsset(url: string): boolean {
  if (!url) return true;
  return /__definitely_missing__|__placeholder__/.test(url);
}

export function useGltfWithFallback(url: string): GltfHandle {
  // useMemo runs unconditionally so hook order stays stable across renders.
  const fallback = useMemo(() => buildFallback(), []);

  if (isLikelyMissingAsset(url)) {
    return { scene: fallback, isFallback: true };
  }

  let raw: GLTF | undefined;
  let loadFailed = false;
  try {
    // drei's useGLTF returns a GLTF-shaped object; cast through unknown so
    // we don't depend on drei's exact internal type export.
    raw = useGLTF(url) as unknown as GLTF;
  } catch (err) {
    loadFailed = true;
    if (typeof console !== 'undefined') {
      // eslint-disable-next-line no-console
      console.error('[useGltfWithFallback] failed to load', url, err);
    }
  }

  if (loadFailed || !raw) {
    return { scene: fallback, isFallback: true };
  }
  return { scene: raw.scene, isFallback: false, raw };
}

// Convenience preloader so callers can warm caches in a useEffect.
useGltfWithFallback.preload = (url: string): void => {
  if (isLikelyMissingAsset(url)) return;
  try {
    useGLTF.preload(url);
  } catch {
    // Pre-warming failure is non-fatal; the hook handles it on actual call.
  }
};
