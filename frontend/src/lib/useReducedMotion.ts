import { useSyncExternalStore } from 'react';

const QUERY = '(prefers-reduced-motion: reduce)';

function getMediaQueryList(): MediaQueryList | null {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return null;
  }
  return window.matchMedia(QUERY);
}

function subscribe(onChange: () => void): () => void {
  const query = getMediaQueryList();
  if (!query) return () => {};

  query.addEventListener('change', onChange);
  return () => query.removeEventListener('change', onChange);
}

function getSnapshot(): boolean {
  return getMediaQueryList()?.matches ?? false;
}

/**
 * Track the system reduced-motion preference.
 *
 * CSS already neutralises keyframe travel through a `prefers-reduced-motion`
 * block, so this hook exists for the cases CSS cannot reach: skipping Motion
 * layout animations and skipping staggered deal delays. Environments without
 * `matchMedia` (jsdom by default) report `false`.
 */
export function useReducedMotion(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, () => false);
}
