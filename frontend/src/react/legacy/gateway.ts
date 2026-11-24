// frontend/src/react/legacy/gateway.ts
// Single typed entry point for React code to access legacy window.* functions.
//
// React code MUST NOT read window.* directly. Inside src/react, this file is
// the only exception. The one shared tie that is not the action surface — the
// legacy i18n globals (window.t / window.applyI18n) — lives in
// src/ui/legacyI18n.ts, because the non-React shell needs it too.
//
// Usage:
//   import { getLegacyActions } from '../legacy/gateway.ts';
//   import { t } from '../../ui/legacyI18n.ts';
//
//   const { messages } = getLegacyActions();
//
//   const label = t('settings.title');

import type { LegacyActions } from './types';
import { apiFetch } from '../../util/api/index.ts';
import { isDeepResearchEnabled } from '../../config/deepResearchMode.ts';
import { webSearchOn, extensiveThinkingOn } from '../../config/providers.ts';
import { getCurrentUser as getAppCurrentUser } from '../../app/lifecycle/index.ts';
import { getActiveTemplate } from '../../chat/templateSystemPrompt.ts';

/** Standalone globals retained by the legacy shell. Keep their
 * compatibility shapes local to this boundary instead of bypassing types. */
interface StandaloneGlobals {
  getConnectorIconMarkup?: (id: string) => string;
}

function standaloneWindow(): Window & StandaloneGlobals {
  return window as Window & StandaloneGlobals;
}

/**
 * Lazy singleton — resolves window.__socratesLegacy once and caches the
 * reference. The bridge is populated during app/legacyBridge.ts evaluation
 * (which happens before any React component mounts in the current
 * bootstrap order), so by the time React hydrates the bridge is ready.
 *
 * If the bridge is missing at call time, this throws early with a clear
 * message so the defect is caught during development (or surfaces as a
 * hard crash in CI) rather than silently doing nothing.
 */
let _bridge: LegacyActions | null = null;

export function setLegacyActions(actions: LegacyActions): void {
  _bridge = actions;
  if (typeof window !== 'undefined') {
    (window as Window & { __socratesLegacy?: LegacyActions }).__socratesLegacy = actions;
  }
}

function resolveBridge(): LegacyActions {
  if (_bridge) return _bridge;
  const b =
    typeof window !== 'undefined'
      ? (window as Window & { __socratesLegacy?: LegacyActions }).__socratesLegacy
      : undefined;
  if (!b) {
    throw new Error(
      '[legacy-gateway] window.__socratesLegacy not initialized. ' +
        'Ensure app/legacyBridge.ts is imported before React hydrates.',
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
  if (_bridge) return _bridge;
  return (
    (typeof window !== 'undefined'
      ? (window as Window & { __socratesLegacy?: LegacyActions }).__socratesLegacy
      : undefined) ?? null
  );
}

/**
 * Invalidate the cached bridge reference.
 * Only needed in test environments where the bridge is swapped between runs.
 */
export function resetBridgeCache(): void {
  _bridge = null;
}

// ─── Typed accessors for lazily-published legacy globals ─────────────────────

/**
 * Connector icon markup helper. Published on window by the legacy layer
 * because connector-icons.ts is a ~40 KB SVG module the
 * app loads lazily; resolving it through here keeps the direct window read
 * in this file instead of scattering it across React components.
 */
export function getConnectorIconMarkupFn(): ((id: string) => string) | null {
  const fn = standaloneWindow().getConnectorIconMarkup;
  return typeof fn === 'function' ? fn : null;
}

// ─── Module-owned composer preferences ──────────────────────────────────────
// Keep existing callers while reading the canonical module state.

/**
 * Legacy web-search toggle. config/providers.js owns the flag and broadcasts
 * `socrates:websearchchange`; callers subscribe to that event for updates.
 */
export function isWebSearchOn(): boolean {
  return webSearchOn;
}

/** Active extension mode selected in the legacy template system, if any. */
export function getActiveTemplateExtensionKey(): string | null {
  const template = getActiveTemplate();
  return template && typeof template.extensionKey === 'string' ? template.extensionKey : null;
}

/** Legacy deep-research toggle used by the composer tools menu. */
export function isDeepResearchOn(): boolean {
  return isDeepResearchEnabled();
}

/** Legacy extensive-thinking toggle used by the composer tools menu. */
export function isExtensiveThinkingOn(): boolean {
  return extensiveThinkingOn;
}

/**
 * Return the canonical authenticated API client through the typed legacy
 * gateway. Keeping this helper avoids coupling React feature modules to the
 * transport implementation.
 */
export function getApiFetch(): typeof apiFetch | null {
  return typeof apiFetch === 'function' ? apiFetch : null;
}

/** The signed-in user record published by the legacy auth layer, or null. */
export function getCurrentUser<T = Record<string, unknown>>(): T | null {
  return (getAppCurrentUser() ?? null) as T | null;
}
