// Wraps drei's useGLTF so that a missing / broken asset never breaks the
// scene. On any failure path, returns a Group containing one primitive
// cube that the caller can render as a placeholder.
//
// Why we don't just rely on Suspense: Vite's dev server returns the SPA
// fallback HTML (200 OK, `text/html`, ~1 KB) for any missing static path.
// drei's `useGLTF` fetches the URL and tries to parse the bytes as GLB —
// it throws a real Error mid-suspense that no Suspense boundary catches,
// unmounting the whole 3D subtree and leaving a blank screen.
//
// The fix is two-layered:
//   1. Asset presence is checked via a HEAD probe (`assetManifest`) before
//      we ever ask drei to load the URL. Until the probe says "present,"
//      the hook returns the fallback synchronously and `useGLTF` is never
//      invoked.
//   2. As a belt-and-suspenders, the `useGLTF` call itself is wrapped in
//      try/catch. A real GLB that the loader rejects falls back to the
//      primitive cube instead of crashing.
//
// Test discipline: the React-bound hook itself is exercised at build /
// dev time. The pure helper `buildFallback` is exported separately so
// unit tests can assert the contract without needing
// @testing-library/react or jsdom (CLAUDE.md hard constraint).

import { useMemo } from 'react';
import { useGLTF } from '@react-three/drei';
import { BoxGeometry, Group, Mesh, MeshStandardMaterial } from 'three';
import type { GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { useAssetPresence, isAssetPresent } from './assetManifest';

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
 * @deprecated Kept for back-compat with existing tests. Use the asset
 * manifest's HEAD probe instead.
 */
export function isLikelyMissingAsset(url: string): boolean {
  if (!url) return true;
  return /__definitely_missing__|__placeholder__/.test(url);
}

export function useGltfWithFallback(url: string): GltfHandle {
  // Always-called hooks first — keeps hook order stable across renders.
  const fallback = useMemo(() => buildFallback(), []);
  const isPresent = useAssetPresence(url);

  if (!isPresent || isLikelyMissingAsset(url)) {
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
  if (isAssetPresent(url) !== true) return;
  try {
    useGLTF.preload(url);
  } catch {
    // Pre-warming failure is non-fatal; the hook handles it on actual call.
  }
};
