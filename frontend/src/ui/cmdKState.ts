import { createImmutableBridge } from '../lib/bridge/createImmutableBridge.ts';

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
  updatedAt?: number | string;
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

type CmdKUpdate = Omit<CmdKSnapshot, 'revision'>;

export const cmdKState = createImmutableBridge<CmdKSnapshot, CmdKUpdate>({
  initial: {
    isOpen: false,
    query: '',
    results: Object.freeze([]),
    selectedIndex: 0,
    recent: Object.freeze([]),
    revision: 0,
  },
  reducer: (_state, update) => ({
    ...update,
    results: Object.freeze([...update.results]),
    recent: Object.freeze([...update.recent]),
  }),
});

export function publishCmdKState(update: CmdKUpdate): void {
  cmdKState.dispatch({
    ...update,
    results: [...update.results],
    recent: [...update.recent],
  });
}
