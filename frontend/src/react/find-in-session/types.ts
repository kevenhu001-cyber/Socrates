/**
 * Shared contracts for in-session find (Ctrl-F) state and actions.
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
