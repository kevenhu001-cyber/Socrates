// frontend/src/types/legacy-global.d.ts
// Global type augmentation for the legacy bridge.
//
// window.__socratesLegacy is the single typed entry for all legacy action
// dispatch from React code. window.t is the i18n translation function used
// by both legacy JS and React components.
//
// DO NOT add new global fields here. If you need to expose new legacy
// functionality to React, extend the LegacyActions interface in
// src/react/legacy/types.ts and publish it via window.__socratesLegacy in
// windowExports.js.
//
import type { LegacyActions } from '../react/legacy/types';

type StateStoreAction =
  | { type: 'state/set'; key: string; value: unknown }
  | { type: 'state/batch'; patch: Record<string, unknown> }
  | { type: 'state/patch-namespace'; namespace: string; patch?: Record<string, unknown> }
  | { type: 'state/reset' }
  | { type: 'session/append-message'; payload: unknown }
  | { type: 'session/replace-messages'; payload: unknown[] }
  | {
      type: 'session/update-message';
      index: number;
      clientId?: string;
      patch?: Record<string, unknown>;
    }
  | { type: 'session/remove-message-at'; index: number; clientId?: string }
  | { type: 'session/truncate-messages-after'; index: number };

declare global {
  interface Window {
    /** Single typed entry for all legacy action dispatch from React. */
    __socratesLegacy?: LegacyActions;

    /** I18n translation function. Both legacy JS and React use this. */
    t: (key: string, ...args: unknown[]) => string;

    /** Repaint every `data-i18n-*` node in the active locale. */
    applyI18n?: () => void;

    // ── Legacy state (read-only from React) ──────────────────────────

    /** Global reactive state object (Proxy). */
    state?: Record<string, unknown>;

    /**
     * Facade over the per-namespace bridges. Read returns the current
     * frozen value for a flat key. Dispatch applies an action through
     * the matching bridge.
     */
    stateStore?: {
      read<K extends string>(key: K): unknown;
      dispatch(action: StateStoreAction): unknown;
      getSnapshot(): Readonly<Record<string, unknown>>;
      subscribe(listener: () => void): () => void;
    };
    resetState?: () => void;

    /** Array of active session summaries read by SessionList. */
    SERVER_SESSIONS?: unknown[];

    // ── Mount / render entry points (set by React, called by legacy JS) ──

    /**
     * Bumped by main.js when lazily-loaded KaTeX finally arrives. The
     * declarative turn renderer caches settled prose HTML per turn, so this
     * counter — not a new string — is what tells the cache to drop its
     * entries and re-typeset math that streamed as fallback text.
     */
    __socratesMathRenderRev?: number;

    // ── Legacy inline handler functions (windowExports.js) ──────────

    exploreAction?: () => void;
    toggleWebSearch?: () => void;
    toggleComposerTools?: (trigger: HTMLElement, mode: string) => void;
  }
}

export {};
