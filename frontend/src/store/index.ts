/**
 * Domain store hooks — the public state API for React code (M1 of the
 * LobeHub-alignment plan, ADR 0001).
 *
 * LobeHub organizes app state as per-domain stores (`src/store/<domain>`)
 * consumed through store hooks + selectors. Socrates now mirrors that
 * shape: the six state namespaces (session/kb/search/call/ui/exam) are
 * Zustand stores; this module exposes the typed selector hooks.
 *
 * Legacy JS keeps writing through the `stateStore` facade /
 * `window.stateStore` — the bridges adapt both worlds onto the same
 * snapshot stores, so reads are always consistent regardless of which
 * API wrote last.
 *
 * New React code should use these hooks:
 *
 *   import { useSessionStore } from '../../store/index.ts';
 *   const topic = useSessionStore((s) => s.topic);
 *
 * Re-renders are keyed on the selector's return value (identity or
 * `Object.is`), which is why selector functions must return stable
 * values (a field, a frozen array, or a memoized projection).
 */

import { useStoreWithEqualityFn } from 'zustand/traditional';
import { shallow } from 'zustand/shallow';
import type { DomainStoreReader } from './createDomainStore.ts';

import {
  callBridge,
  callStore,
  examBridge,
  examStore,
  kbBridge,
  kbStore,
  searchBridge,
  searchStore,
  sessionBridge,
  sessionStore,
  uiBridge,
  uiStore,
  type CallAction,
  type CallSnapshot,
  type ExamAction,
  type ExamSnapshot,
  type KbAction,
  type KbSnapshot,
  type SearchAction,
  type SearchSnapshot,
  type SessionAction,
  type SessionSnapshot,
  type UiAction,
  type UiSnapshot,
} from '../state/bridges.ts';
import { notifyLegacyListeners } from '../state/store.ts';
import type { RevisionedSnapshot } from '../lib/bridge/createImmutableBridge.ts';

type DomainSnapshot =
  | SessionSnapshot
  | KbSnapshot
  | SearchSnapshot
  | CallSnapshot
  | UiSnapshot
  | ExamSnapshot;

function defineDomainHook<Snapshot extends DomainSnapshot & RevisionedSnapshot, _Action>(
  store: DomainStoreReader<Snapshot>,
) {
  function useDomainStore<T>(selector: (snapshot: Snapshot) => T): T {
    /* Shallow equality (the LobeHub `createWithEqualityFn` + `shallow`
       pattern): selectors may return fresh object/array projections
       without re-rendering the component every commit. Callers that
       want strict identity can compare inside the selector and return
       the previous reference. */
    return useStoreWithEqualityFn(store, selector, shallow);
  }
  useDomainStore.getState = store.getState;
  useDomainStore.subscribe = store.subscribe;
  return useDomainStore;
}

export const useSessionStore = defineDomainHook<SessionSnapshot, SessionAction>(sessionStore);
export const useKbStore = defineDomainHook<KbSnapshot, KbAction>(kbStore);
export const useSearchStore = defineDomainHook<SearchSnapshot, SearchAction>(searchStore);
export const useCallStore = defineDomainHook<CallSnapshot, CallAction>(callStore);
export const useUiStore = defineDomainHook<UiSnapshot, UiAction>(uiStore);
export const useExamStore = defineDomainHook<ExamSnapshot, ExamAction>(examStore);

/**
 * Typed imperative access to the domain stores.
 *
 * The hooks above are for components. These are for the code that is not
 * one: an event handler in a legacy module, a callback that has to commit
 * a change and read the result back in the same tick.
 *
 * The action is one of the typed unions from state/bridges.ts, so a typo in
 * an action type or a missing field is a compile error rather than a
 * silent no-op. The legacy facade's `stateStore.dispatch` takes a bare
 * string type and cannot offer that — which is why the stringly-typed
 * calls are the thing `check-state-ownership.mjs` freezes.
 *
 * Each commit flushes synchronously — the same thing the facade does — and
 * then wakes the legacy listeners, so a subscriber of
 * `stateStore.subscribe` (the research tracker, the scroll indicator) sees
 * exactly the change it would have seen through the facade.
 */
export function dispatchSession(action: SessionAction): SessionSnapshot {
  sessionBridge.dispatch(action);
  sessionBridge.flush();
  notifyLegacyListeners();
  return sessionStore.getState();
}

export function dispatchUi(action: UiAction): UiSnapshot {
  uiBridge.dispatch(action);
  uiBridge.flush();
  notifyLegacyListeners();
  return uiStore.getState();
}

/** The zustand snapshot stores, for advanced subscribers outside React. */
export {
  callStore,
  examStore,
  kbStore,
  searchStore,
  sessionStore,
  uiStore,
};

/** Legacy ImmutableBridge facades (dispatch/flush semantics). */
export {
  callBridge,
  examBridge,
  kbBridge,
  searchBridge,
  sessionBridge,
  uiBridge,
};

export type {
  CallAction,
  ExamAction,
  KbAction,
  SearchAction,
  SessionAction,
  UiAction,
  CallSnapshot,
  ExamSnapshot,
  KbSnapshot,
  SearchSnapshot,
  SessionSnapshot,
  UiSnapshot,
};
