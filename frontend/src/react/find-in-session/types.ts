/**
 * Shared contracts for the in-session find (Ctrl-F) React migration boundary.
 *
 * Mirrors the legacy wire shape in ui/findInSession.js. The runtime
 * representation stays exactly the same; only the access path changes
 * (typed bridge over `window.__socratesFindInSession` instead of direct
 * module-private variables).
 */

export interface FindInSessionSnapshot {
  isOpen: boolean;
  query: string;
  matchCount: number;
  activeIndex: number; /** 0-based, or -1 when none */
}

export interface FindInSessionBridge {
  getSnapshot: () => FindInSessionSnapshot;
  publish: (snapshot: FindInSessionSnapshot) => void;
  subscribe: (listener: () => void) => () => void;
}

declare global {
  interface Window {
    __socratesFindInSession?: FindInSessionBridge;
  }
}
