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
// app/legacyBridge.ts.
//
import type { LegacyActions } from '../react/legacy/types';

declare global {
  interface Window {
    /** Single typed entry for all legacy action dispatch from React. */
    __socratesLegacy?: LegacyActions;

    /** I18n translation function. Both legacy JS and React use this. */
    t: (key: string, ...args: unknown[]) => string;

    /** Repaint every `data-i18n-*` node in the active locale. */
    applyI18n?: () => void;

    /** Array of active session summaries read by SessionList. */
    SERVER_SESSIONS?: unknown[];
  }
}

export {};
