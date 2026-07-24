/**
 * Shared contracts for the Cmd+K palette React migration boundary.
 *
 * Mirrors the legacy wire shape in src/ui/cmdK.js — Fuse result docs plus
 * the recent-query list. The runtime representation stays exactly the same;
 * only the access path changes (typed bridge over `window.__socratesCmdK`
 * instead of direct module-private reads).
 */

export type CmdKDocKind = 'session' | 'message' | 'remote';

export interface CmdKDocBase {
  kind: CmdKDocKind;
  id: string;
  title: string;
  snippet: string;
}

export interface CmdKSessionDoc extends CmdKDocBase {
  kind: 'session';
  topic?: string;
  mode?: string;
  updatedAt?: number;
}

export interface CmdKMessageDoc extends CmdKDocBase {
  kind: 'message';
  sessionId?: string | null;
  topic?: string;
}

export interface CmdKRemoteDoc extends CmdKDocBase {
  kind: 'remote';
  sessionId?: string | null;
}

export type CmdKDoc = CmdKSessionDoc | CmdKMessageDoc | CmdKRemoteDoc;

/**
 * A Fuse search hit. The legacy module publishes these as `{ item, refIndex, matches? }`;
 * `item` is the canonical CmdKDoc. Some code paths also push raw remote hits
 * shaped like `{ kind, id, sessionId, title, snippet }`, so we accept both.
 */
export interface CmdKHit {
  item?: CmdKDoc;
  refIndex?: number;
  matches?: ReadonlyArray<unknown>;
}

export interface CmdKSnapshot {
  isOpen: boolean;
  query: string;
  results: ReadonlyArray<CmdKHit>;
  selectedIndex: number;
  recent: ReadonlyArray<string>;
  revision: number;
}

export interface CmdKBridge {
  getSnapshot: () => CmdKSnapshot;
  publish: (snapshot: Omit<CmdKSnapshot, 'revision'>) => void;
  subscribe: (listener: () => void) => () => void;
}

declare global {
  interface Window {
    __socratesCmdK?: CmdKBridge;
  }
}