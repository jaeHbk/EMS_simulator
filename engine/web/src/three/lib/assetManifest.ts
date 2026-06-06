// Asset presence manifest.
//
// Why this exists: Vite's dev server returns the SPA fallback HTML for any
// missing static path (200 OK + `text/html`), not a 404. drei's loaders
// (`useGLTF`, `Environment`, `useTexture`) fetch the URL and try to parse
// the bytes as GLB / HDR / image — they fail mid-suspense and throw a real
// Error that no Suspense boundary catches, unmounting the entire 3D tree
// and leaving a blank screen.
//
// Solution: HEAD-probe each asset path once at app startup, then
// short-circuit consumers when the asset is known absent. The probe runs
// async, and consumers re-render when the manifest updates so a dropped-in
// asset starts being used on the next pass without a manual refresh.
//
// Two checks identify a *missing* asset on Vite's dev server:
//   1. Content-Type starts with `text/html` (the SPA fallback).
//   2. Content-Length is small (<2 KB; the index.html is ~1 KB).
// Real GLBs and HDRs are >> 2 KB; even tiny ones don't return text/html.

import { useSyncExternalStore } from 'react';

type Listener = () => void;

const presence = new Map<string, boolean>();
const listeners = new Set<Listener>();

function emit() {
  for (const l of listeners) l();
}

async function probe(url: string): Promise<boolean> {
  try {
    const r = await fetch(url, { method: 'HEAD' });
    if (!r.ok) return false;
    const ct = (r.headers.get('content-type') ?? '').toLowerCase();
    if (ct.startsWith('text/html')) return false;
    const len = Number(r.headers.get('content-length') ?? '0');
    if (len > 0 && len < 2048) return false;
    return true;
  } catch {
    return false;
  }
}

/**
 * Probe a list of asset URLs. Idempotent and cached: each URL is probed
 * at most once per session. Updates the manifest as results arrive and
 * notifies subscribers (consumers re-render).
 */
export function probeAssets(urls: readonly string[]): void {
  for (const url of urls) {
    if (presence.has(url)) continue;
    // Insert `false` synchronously so consumers render the fallback
    // immediately instead of waiting for the network.
    presence.set(url, false);
    void probe(url).then((ok) => {
      if (ok) {
        presence.set(url, true);
        emit();
      }
    });
  }
  emit();
}

/** Synchronous read of the manifest. `undefined` = not yet probed. */
export function isAssetPresent(url: string): boolean | undefined {
  return presence.get(url);
}

function subscribe(l: Listener): () => void {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}

/** React hook over the manifest. Re-renders when the value flips. */
export function useAssetPresence(url: string): boolean {
  return useSyncExternalStore(
    subscribe,
    () => presence.get(url) ?? false,
    () => false,
  );
}
