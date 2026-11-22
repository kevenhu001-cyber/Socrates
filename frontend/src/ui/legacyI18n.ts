// frontend/src/ui/legacyI18n.ts
// The legacy i18n boundary shared by the React tree and the legacy shell.
//
// `window.t` and `window.applyI18n` are published by the legacy i18n layer,
// which evaluates before React mounts. Every read here is best-effort: when
// the globals are absent (tests, early boot, teardown) we fall back to the
// typed locale tables in src/i18n.
//
// Keeping this out of react/legacy/gateway.ts lets components that only need
// a translated string depend on the i18n bridge instead of the whole legacy
// action surface. `check-react-globals.mjs` still confines window.* reads for
// React code to the gateway; this module lives outside src/react by design.

import { getCurrentLanguage } from '../i18n/languageState.ts';
import { t as appT } from '../i18n/index.ts';

/**
 * Translate a key using the legacy i18n system (window.t).
 * Falls back to the key itself if the translation function is unavailable.
 */
export function t(key: string, ...args: unknown[]): string {
  if (typeof window !== 'undefined') {
    const fn = window.t;
    if (typeof fn === 'function') return fn(key, ...args);
  }
  return appT(key);
}

/**
 * Translate a key with a fallback for the React tree.
 * - Returns the translated string when the key resolves in the active
 *   language or the English fallback.
 * - Returns `fallback` when the key is missing (legacy `t()` returns the
 *   key string on miss, which is ugly in the UI).
 *
 * This consolidates the per-component `i18n(key, fallback)` helpers that
 * were duplicated across 8 React files and keeps the fallback visible
 * at the call site so the English copy stays co-located with the JSX.
 */
export function i18n(key: string, fallback: string): string {
  const v = t(key);
  return v !== key ? v : fallback;
}

/**
 * Repaint every `[data-i18n-*]` node in the active locale.
 *
 * The legacy i18n pass runs during module evaluation, which is before the
 * React auth gate mounts; surfaces that render `data-i18n-key` nodes after
 * that point have to replay it.
 */
export function applyLegacyI18n(): void {
  try {
    window.applyI18n?.();
  } catch {
    /* empty-catch: intentional — translation is best-effort */
  }
}

/** Active UI language code tracked by the legacy i18n layer (defaults to zh). */
export function getCurrentLang(): 'zh' | 'en' {
  return getCurrentLanguage();
}
