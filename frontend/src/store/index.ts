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
import type { StoreApi } from 'zustand/vanilla';

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
import type { RevisionedSnapshot } from '../lib/bridge/createImmutableBridge.ts';

type DomainSnapshot =
  | SessionSnapshot
  | KbSnapshot
  | SearchSnapshot
  | CallSnapshot
  | UiSnapshot
  | ExamSnapshot;

function defineDomainHook<Snapshot extends DomainSnapshot & RevisionedSnapshot, _Action>(
  store: StoreApi<Snapshot>,
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
  return useDomainStore as UseBoundStoreShallow<StoreApi<Snapshot>>;
}

type UseBoundStoreShallow<Store> = {
  (selector: (snapshot: unknown) => unknown): unknown;
  getState: Store extends { getState: infer G } ? G : never;
  subscribe: Store extends { subscribe: infer S } ? S : never;
};

export const useSessionStore = defineDomainHook<SessionSnapshot, SessionAction>(sessionStore);
export const useKbStore = defineDomainHook<KbSnapshot, KbAction>(kbStore);
export const useSearchStore = defineDomainHook<SearchSnapshot, SearchAction>(searchStore);
export const useCallStore = defineDomainHook<CallSnapshot, CallAction>(callStore);
export const useUiStore = defineDomainHook<UiSnapshot, UiAction>(uiStore);
export const useExamStore = defineDomainHook<ExamSnapshot, ExamAction>(examStore);

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
