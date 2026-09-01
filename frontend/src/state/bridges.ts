/**
 * Per-namespace immutable bridges for the M3 state refactor.
 *
 * Each namespace (session / kb / search / call / ui / exam) owns its
 * own `createImmutableBridge` instance. `state/store.js` exposes a thin
 * facade (`stateStore`) that forwards actions to the correct bridge,
 * aggregates snapshots into the legacy `state` shape, and forwards
 * subscriptions to all bridges.
 *
 * Why split into per-namespace bridges?
 *  - The session namespace changes a lot (every chat turn) while
 *    `ui` and `call` change rarely. Independent bridges let
 *    `useSyncExternalStore` subscribers re-render only when their
 *    namespace actually changed.
 *  - Each reducer is small and pure — easy to unit-test in isolation.
 *  - Future M4 work can replace the Proxy shim with direct bridge
 *    reads without touching this file.
 */

import {
  createImmutableBridge,
  type ImmutableBridge,
  type RevisionedSnapshot,
} from '../lib/bridge/createImmutableBridge.ts';
import {
  createInitialKbState,
  type KbState,
} from './kb.ts';
import {
  createInitialSearchState,
  type SearchState,
} from './search.ts';
import {
  createInitialCallState,
  type CallState,
} from './call.ts';
import {
  createInitialUiState,
  type UiState,
} from './ui.ts';
import {
  createInitialExamState,
  type ExamState,
} from './exam.ts';
import {
  createInitialSessionState,
  type SessionState,
  type ChatMessageShape,
} from './session.ts';

/* ────────────────────────── Session ─────────────────────────── */

export type SessionAction =
  | { type: 'session/set'; key: keyof SessionState; value: unknown }
  | { type: 'session/patch'; patch: Partial<SessionState> }
  | { type: 'session/reset' }
  | { type: 'session/append-message'; payload: ChatMessageShape }
  | { type: 'session/replace-messages'; payload: ChatMessageShape[] }
  | {
      type: 'session/update-message';
      index: number;
      clientId?: string;
      patch: Record<string, unknown>;
    }
  | { type: 'session/remove-message-at'; index: number; clientId?: string }
  | { type: 'session/truncate-messages-after'; index: number };

type SessionSnapshot = SessionState & RevisionedSnapshot;

function sessionReducer(
  state: SessionSnapshot,
  action: SessionAction,
): SessionSnapshot {
  switch (action.type) {
    case 'session/set':
      return { ...state, [action.key]: action.value };
    case 'session/patch':
      return { ...state, ...action.patch };
    case 'session/reset':
      return { ...createInitialSessionState(), revision: state.revision };
    case 'session/append-message': {
      const messages = state.messages.concat([action.payload]);
      return { ...state, messages };
    }
    case 'session/replace-messages': {
      if (!Array.isArray(action.payload)) return state;
      return { ...state, messages: action.payload.slice() };
    }
    case 'session/update-message': {
      const idx = Number(action.index);
      const current = state.messages[idx];
      if (!Number.isInteger(idx) || !current) return state;
      if (action.clientId && current.clientId !== action.clientId) return state;
      const updated = { ...current, ...action.patch };
      const messages = state.messages
        .slice(0, idx)
        .concat([updated], state.messages.slice(idx + 1));
      return { ...state, messages };
    }
    case 'session/remove-message-at': {
      const idx = Number(action.index);
      const candidate = state.messages[idx];
      if (!Number.isInteger(idx) || !candidate) return state;
      if (action.clientId && candidate.clientId !== action.clientId) return state;
      const messages = state.messages
        .slice(0, idx)
        .concat(state.messages.slice(idx + 1));
      return { ...state, messages };
    }
    case 'session/truncate-messages-after': {
      const keep = Number(action.index);
      if (!Number.isInteger(keep) || keep < -1) return state;
      return { ...state, messages: state.messages.slice(0, keep + 1) };
    }
    default:
      return state;
  }
}

export const sessionBridge: ImmutableBridge<SessionSnapshot, SessionAction> =
  createImmutableBridge<SessionSnapshot, SessionAction>({
    initial: {
      ...createInitialSessionState(),
      revision: 0,
    },
    reducer: sessionReducer,
  });

/* ────────────────────────── KB ─────────────────────────────── */

export type KbAction =
  | { type: 'kb/set'; key: keyof KbState; value: unknown }
  | { type: 'kb/patch'; patch: Partial<KbState> }
  | { type: 'kb/reset' };

type KbSnapshot = KbState & RevisionedSnapshot;

function kbReducer(state: KbSnapshot, action: KbAction): KbSnapshot {
  switch (action.type) {
    case 'kb/set':
      return { ...state, [action.key]: action.value };
    case 'kb/patch':
      return { ...state, ...action.patch };
    case 'kb/reset':
      return { ...createInitialKbState(), revision: state.revision };
    default:
      return state;
  }
}

export const kbBridge: ImmutableBridge<KbSnapshot, KbAction> =
  createImmutableBridge<KbSnapshot, KbAction>({
    initial: {
      ...createInitialKbState(),
      revision: 0,
    },
    reducer: kbReducer,
  });

/* ────────────────────────── Search ─────────────────────────── */

export type SearchAction =
  | { type: 'search/set'; key: keyof SearchState; value: unknown }
  | { type: 'search/patch'; patch: Partial<SearchState> }
  | { type: 'search/reset' };

type SearchSnapshot = SearchState & RevisionedSnapshot;

function searchReducer(
  state: SearchSnapshot,
  action: SearchAction,
): SearchSnapshot {
  switch (action.type) {
    case 'search/set':
      return { ...state, [action.key]: action.value };
    case 'search/patch':
      return { ...state, ...action.patch };
    case 'search/reset':
      return { ...createInitialSearchState(), revision: state.revision };
    default:
      return state;
  }
}

export const searchBridge: ImmutableBridge<SearchSnapshot, SearchAction> =
  createImmutableBridge<SearchSnapshot, SearchAction>({
    initial: {
      ...createInitialSearchState(),
      revision: 0,
    },
    reducer: searchReducer,
  });

/* ────────────────────────── Call ───────────────────────────── */

export type CallAction =
  | { type: 'call/set'; key: keyof CallState; value: unknown }
  | { type: 'call/patch'; patch: Partial<CallState> }
  | { type: 'call/reset' };

type CallSnapshot = CallState & RevisionedSnapshot;

function callReducer(state: CallSnapshot, action: CallAction): CallSnapshot {
  switch (action.type) {
    case 'call/set':
      return { ...state, [action.key]: action.value };
    case 'call/patch':
      return { ...state, ...action.patch };
    case 'call/reset':
      return { ...createInitialCallState(), revision: state.revision };
    default:
      return state;
  }
}

export const callBridge: ImmutableBridge<CallSnapshot, CallAction> =
  createImmutableBridge<CallSnapshot, CallAction>({
    initial: {
      ...createInitialCallState(),
      revision: 0,
    },
    reducer: callReducer,
  });

/* ────────────────────────── UI ─────────────────────────────── */

export type UiAction =
  | { type: 'ui/set'; key: keyof UiState; value: unknown }
  | { type: 'ui/patch'; patch: Partial<UiState> }
  | { type: 'ui/reset' };

type UiSnapshot = UiState & RevisionedSnapshot;

function uiReducer(state: UiSnapshot, action: UiAction): UiSnapshot {
  switch (action.type) {
    case 'ui/set':
      return { ...state, [action.key]: action.value };
    case 'ui/patch':
      return { ...state, ...action.patch };
    case 'ui/reset':
      return { ...createInitialUiState(), revision: state.revision };
    default:
      return state;
  }
}

export const uiBridge: ImmutableBridge<UiSnapshot, UiAction> =
  createImmutableBridge<UiSnapshot, UiAction>({
    initial: {
      ...createInitialUiState(),
      revision: 0,
    },
    reducer: uiReducer,
  });

/* ────────────────────────── Exam ───────────────────────────── */

export type ExamAction =
  | { type: 'exam/set'; key: keyof ExamState; value: unknown }
  | { type: 'exam/patch'; patch: Partial<ExamState> }
  | { type: 'exam/reset' };

type ExamSnapshot = ExamState & RevisionedSnapshot;

function examReducer(state: ExamSnapshot, action: ExamAction): ExamSnapshot {
  switch (action.type) {
    case 'exam/set':
      return { ...state, [action.key]: action.value };
    case 'exam/patch':
      return { ...state, ...action.patch };
    case 'exam/reset':
      return { ...createInitialExamState(), revision: state.revision };
    default:
      return state;
  }
}

export const examBridge: ImmutableBridge<ExamSnapshot, ExamAction> =
  createImmutableBridge<ExamSnapshot, ExamAction>({
    initial: {
      ...createInitialExamState(),
      revision: 0,
    },
    reducer: examReducer,
  });

/* ────────────────────────── Aggregate ──────────────────────── */

/**
 * All namespace bridges — used by `state/store.js` to forward actions to
 * the correct bridge and to aggregate snapshots/subscriptions.
 */
export const namespaceBridges = {
  session: sessionBridge,
  kb: kbBridge,
  search: searchBridge,
  call: callBridge,
  ui: uiBridge,
  exam: examBridge,
} as const;

export type NamespaceName = keyof typeof namespaceBridges;

/** Re-export `createInitialSessionState` so tests can reset a single bridge. */
export { createInitialSessionState };
export { createInitialKbState };
export { createInitialSearchState };
export { createInitialCallState };
export { createInitialUiState };
export { createInitialExamState };