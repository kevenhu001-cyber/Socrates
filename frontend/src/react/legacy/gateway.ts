// frontend/src/react/legacy/gateway.ts
// Single typed entry point for React code to access legacy window.* functions.
//
// React code MUST NOT read window.* directly. This file is the only exception.
//
// Usage:
//   import { getLegacyActions, t } from '../legacy/gateway';
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

// ─── Legacy state snapshot access ────────────────────────────────────────────

/**
 * Read a snapshot of the legacy global state object (window.state).
 * Returns undefined if the state has not been initialized.
 */
export function getLegacyState<T = Record<string, unknown>>(): T | undefined {
  return (window as any).state as T | undefined;
}

/**
 * Read a specific value from the legacy global state with a fallback.
 */
export function getLegacyStateValue<K extends string, V = unknown>(
  key: K,
  fallback: V,
): V {
  const s = (window as any).state;
  if (s && key in s) return s[key] as V;
  return fallback;
}
