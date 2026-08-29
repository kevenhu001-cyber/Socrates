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
// The __socratesXxxBridge properties are typed bridge stores used by
// individual React domains for state sharing — they are intentionally not
// aggregated here to keep each bridge's isolation explicit.

import type { LegacyActions } from '../react/legacy/types';

declare global {
  interface Window {
    /** Single typed entry for all legacy action dispatch from React. */
    __socratesLegacy?: LegacyActions;

    /** I18n translation function. Both legacy JS and React use this. */
    t: (key: string, ...args: unknown[]) => string;

    // ── Legacy state (read-only from React) ──────────────────────────

    /** Global reactive state object (Proxy). */
    state?: Record<string, unknown>;

    /** Cache of project list entries read by RecentsFilterChips. */
    __projectsCache?: unknown[];

    /** Array of active session summaries read by SessionList. */
    SERVER_SESSIONS?: unknown[];

    // ── Mount / render entry points (set by React, called by legacy JS) ──

    __socratesMountScheduled?: () => void;
    __socratesMountWorkspace?: (page: string) => void;

    /** Set by the read-only share view before it renders #msgList itself. */
    __socratesShareMsgListTakeover?: boolean;
    /** Unmounts the React message list so legacy code may own #msgList. */
    __socratesReleaseMsgListReact?: () => void;

    /**
     * Bumped by main.js when lazily-loaded KaTeX finally arrives. The
     * declarative turn renderer caches settled prose HTML per turn, so this
     * counter — not a new string — is what tells the cache to drop its
     * entries and re-typeset math that streamed as fallback text.
     */
    __socratesMathRenderRev?: number;

    /**
     * Renders one assistant turn with the declarative tool-run renderer, for
     * surfaces that build their own transcript (the read-only share view).
     * Returns false when the turn has no usable split points and nothing was
     * mounted, so the caller can keep its own markup. Released in batches by
     * __socratesReleaseAssistantTurns before the caller wipes the list.
     */
    __socratesMountAssistantTurn?: (
      container: Element,
      message: unknown,
      options?: { readOnly?: boolean },
    ) => boolean;
    __socratesReleaseAssistantTurns?: () => void;

    // ── Bridge stores (typed, per-domain) ────────────────────────────
    // Each __socratesXxxBridge is defined together with its store module and
    // should not grow beyond the store's scope. New stores must declare their
    // exact type here.

    __socratesReactChatBridge?: unknown;
    __socratesMessageListBridge?: unknown;
    __socratesSidebarNavBridge?: unknown;
    __socratesRecentsFilterBridge?: unknown;
    __socratesCmdK?: unknown;
    __socratesFindInSession?: unknown;
    __socratesSettingsBridge?: unknown;
    __socratesProfileBridge?: unknown;
    __socratesStorageBridge?: unknown;
    __socratesUsageBridge?: unknown;
    __socratesShareBridge?: unknown;
    __socratesCheatsheetBridge?: unknown;
    __socratesMorePopoverBridge?: unknown;
    __socratesComposerToolsBridge?: unknown;
    __socratesComposerInputBridge?: unknown;
    __socratesAttachmentsBridge?: unknown;
    __socratesPromptTemplatesBridge?: unknown;
    __socratesSidebarChromeBridge?: unknown;
    __socratesSessionListBridge?: unknown;
    __socratesWorkspaceBridge?: unknown;
    __socratesScheduledBridge?: unknown;
    __socratesNavRenderScheduled?: () => void;
  }
}

export {};
