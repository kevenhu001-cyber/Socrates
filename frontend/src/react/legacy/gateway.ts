// frontend/src/react/legacy/gateway.ts
// Single typed entry point for React code to access legacy window.* functions.
//
// React code MUST NOT read window.* directly. This file is the only exception.
//
// Usage:
//   import { getLegacyActions, t } from '../legacy/gateway.ts';
//
//   const { messages } = getLegacyActions();
//   messages.editUserMessage(id);
//
//   const label = t('settings.title');

import type { LegacyActions } from './types';

/**
 * Lazy singleton — resolves window.__socratesLegacy once and caches the
 * reference. The bridge is populated during windowExports.js evaluation
 * (which happens before any React component mounts in the current
 * bootstrap order), so by the time React hydrates the bridge is ready.
 *
 * If the bridge is missing at call time, this throws early with a clear
 * message so the defect is caught during development (or surfaces as a
 * hard crash in CI) rather than silently doing nothing.
 */
let _bridge: LegacyActions | null = null;

function resolveBridge(): LegacyActions {
  if (_bridge) return _bridge;
  const b = (window as any).__socratesLegacy as LegacyActions | undefined;
  if (!b) {
    throw new Error(
      '[legacy-gateway] window.__socratesLegacy not initialized. ' +
      'Ensure windowExports.js is imported before React hydrates.',
    );
  }
  _bridge = b;
  return b;
}

/**
 * Returns the typed legacy actions bridge.
 * Throws if the bridge has not been initialized.
 */
export function getLegacyActions(): LegacyActions {
  return resolveBridge();
}

/**
 * Optional bridge access. Prefer getLegacyActions() where the app is known to
 * have booted; use this in handlers that must degrade to a no-op instead of
 * throwing when the bridge is absent (late boot, teardown, tests).
 */
export function getLegacyActionsOrNull(): LegacyActions | null {
  return ((window as any).__socratesLegacy as LegacyActions | undefined) ?? null;
}

/**
 * Invalidate the cached bridge reference.
 * Only needed in test environments where the bridge is swapped between runs.
 */
export function resetBridgeCache(): void {
  _bridge = null;
}

// ─── i18n utility ────────────────────────────────────────────────────────────

/**
 * Translate a key using the legacy i18n system (window.t).
 * Falls back to the key itself if the translation function is unavailable.
 */
export function t(key: string, ...args: unknown[]): string {
  const fn = (window as any).t;
  if (typeof fn === 'function') return fn(key, ...args);
  return key;
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

// ─── Typed accessors for lazily-published legacy globals ─────────────────────

/**
 * Connector icon markup helper. Published on window by the legacy layer
 * (windowExports.js) because connector-icons.ts is a ~40 KB SVG module the
 * app loads lazily; resolving it through here keeps the direct window read
 * in this file instead of scattering it across React components.
 */
export function getConnectorIconMarkupFn(): ((id: string) => string) | null {
  const fn = (window as any).getConnectorIconMarkup;
  return typeof fn === 'function' ? fn : null;
}

// ─── Typed reads of standalone legacy globals ───────────────────────────────
// A few mutable legacy values and caches still have window-backed owners.
// Name each supported read here so React callers avoid unbounded global lookup.

/**
 * Legacy web-search toggle. config/providers.js owns the flag and broadcasts
 * `socrates:websearchchange`; callers subscribe to that event for updates.
 */
export function isWebSearchOn(): boolean {
  return Boolean((window as any).webSearchOn);
}

/** Active extension mode selected in the legacy template system, if any. */
export function getActiveTemplateExtensionKey(): string | null {
  const template = (window as any)._activeTemplate as { extensionKey?: unknown } | null | undefined;
  return template && typeof template.extensionKey === 'string'
    ? template.extensionKey
    : null;
}

/** Legacy deep-research toggle used by the composer tools menu. */
export function isDeepResearchOn(): boolean {
  return Boolean((window as any).deepResearchOn);
}

/** Legacy extensive-thinking toggle used by the composer tools menu. */
export function isExtensiveThinkingOn(): boolean {
  return Boolean((window as any).extensiveThinkingOn);
}

/** Cached projects used by the recents filter chips. */
export function getCachedProjects(): ReadonlyArray<{ id: string; name: string }> {
  const projects = (window as any).__projectsCache;
  if (!Array.isArray(projects)) return [];
  return projects.filter((project: unknown): project is { id: string; name: string } => {
    if (!project || typeof project !== 'object') return false;
    const candidate = project as { id?: unknown; name?: unknown };
    return typeof candidate.id === 'string' && typeof candidate.name === 'string';
  });
}

/** Active UI language code tracked by the legacy i18n layer (defaults to zh). */
export function getCurrentLang(): 'zh' | 'en' {
  return (window as any)._currentLang === 'en' ? 'en' : 'zh';
}

type ApiFetchFn = (
  url: string,
  init?: Record<string, unknown>,
) => Promise<any>;

/**
 * Legacy authenticated fetch helper, published in windowExports.js. Returns
 * null before the app boots so call sites keep their optional-chaining shape.
 */
export function getApiFetch(): ApiFetchFn | null {
  const fn = (window as any).apiFetch;
  return typeof fn === 'function' ? (fn as ApiFetchFn) : null;
}

/** The signed-in user record published by the legacy auth layer, or null. */
export function getCurrentUser<T = Record<string, any>>(): T | null {
  return (((window as any).CURRENT_USER) ?? null) as T | null;
}
