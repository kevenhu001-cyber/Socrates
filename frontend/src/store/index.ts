/**
 * Public state API for React code.
 *
 * `store/bridge.ts` is the single snapshot/reducer/RAF implementation.
 * `store/createDomainStore.ts` adds a read-only Zustand reader; this module
 * exposes the typed hooks and the transition types.
 *
 * New React code should use these hooks:
 *
 *   import { useSessionStore } from '../store/index.ts';
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
import { notifyLegacyListeners, notifyLegacyListenersDeferred } from './legacyListeners.ts';
import type { RevisionedSnapshot } from './bridge.ts';

export {
  createBridge,
  createImmutableBridge,
  type Bridge,
  type BridgeFreezeMode,
  type CreateBridgeOptions,
} from './bridge.ts';
export { useBridge, useBridgeSelector } from './useBridge.ts';

type DomainSnapshot =
  SessionSnapshot | KbSnapshot | SearchSnapshot | CallSnapshot | UiSnapshot | ExamSnapshot;

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
 * an action type or a missing field is a compile error.
 *
 * Each commit flushes synchronously, then wakes commit subscribers such as
 * the research tracker.
 */
export function dispatchSession(action: SessionAction): SessionSnapshot {
  sessionBridge.dispatch(action);
  sessionBridge.flush();
  notifyLegacyListeners();
  return sessionStore.getState();
}

/**
 * Patch one message row and return it, mirroring the facade's
 * `session/update-message` handler: a stale `clientId` yields `null`, and
 * `deferNotify` wakes the legacy listeners on the next frame instead of
 * synchronously. The streaming ownership guard depends on both behaviours.
 */
export function updateSessionMessage(
  index: number,
  clientId: string | undefined,
  patch: Record<string, unknown>,
  deferNotify = false,
): SessionSnapshot['messages'][number] | null {
  const before = sessionBridge.getSnapshot().messages[index];
  sessionBridge.dispatch({ type: 'session/update-message', index, clientId, patch });
  sessionBridge.flush();
  if (deferNotify) notifyLegacyListenersDeferred();
  else notifyLegacyListeners();
  const after = sessionStore.getState().messages[index];
  return clientId && (!before || before.clientId !== clientId) ? null : after || null;
}

export function dispatchUi(action: UiAction): UiSnapshot {
  uiBridge.dispatch(action);
  uiBridge.flush();
  notifyLegacyListeners();
  return uiStore.getState();
}

export function dispatchKb(action: KbAction): KbSnapshot {
  kbBridge.dispatch(action);
  kbBridge.flush();
  notifyLegacyListeners();
  return kbStore.getState();
}

export function dispatchExam(action: ExamAction): ExamSnapshot {
  examBridge.dispatch(action);
  examBridge.flush();
  notifyLegacyListeners();
  return examStore.getState();
}

export function dispatchSearch(action: SearchAction): SearchSnapshot {
  searchBridge.dispatch(action);
  searchBridge.flush();
  notifyLegacyListeners();
  return searchStore.getState();
}

export function dispatchCall(action: CallAction): CallSnapshot {
  callBridge.dispatch(action);
  callBridge.flush();
  notifyLegacyListeners();
  return callStore.getState();
}

/**
 * Reset every domain store — the typed equivalent of the facade's
 * `state/reset`. Each bridge resets first, then all flush, so a subscriber
 * never observes a half-reset tree.
 */
export function resetDomains(): void {
  sessionBridge.dispatch({ type: 'session/reset' });
  kbBridge.dispatch({ type: 'kb/reset' });
  searchBridge.dispatch({ type: 'search/reset' });
  callBridge.dispatch({ type: 'call/reset' });
  uiBridge.dispatch({ type: 'ui/reset' });
  examBridge.dispatch({ type: 'exam/reset' });
  for (const bridge of [sessionBridge, kbBridge, searchBridge, callBridge, uiBridge, examBridge]) {
    bridge.flush();
  }
  notifyLegacyListeners();
}

type PatchOf<Snapshot> = Partial<Omit<Snapshot, 'revision'>>;

/**
 * Apply one patch per namespace in a single commit — the typed equivalent of
 * the facade's `state/batch`. Each bridge flushes once and the legacy
 * listeners wake once, so a multi-namespace write is still one notification.
 */
export function dispatchPatches(patches: {
  session?: PatchOf<SessionSnapshot>;
  kb?: PatchOf<KbSnapshot>;
  search?: PatchOf<SearchSnapshot>;
  call?: PatchOf<CallSnapshot>;
  ui?: PatchOf<UiSnapshot>;
  exam?: PatchOf<ExamSnapshot>;
}): void {
  if (patches.session) sessionBridge.dispatch({ type: 'session/patch', patch: patches.session });
  if (patches.kb) kbBridge.dispatch({ type: 'kb/patch', patch: patches.kb });
  if (patches.search) searchBridge.dispatch({ type: 'search/patch', patch: patches.search });
  if (patches.call) callBridge.dispatch({ type: 'call/patch', patch: patches.call });
  if (patches.ui) uiBridge.dispatch({ type: 'ui/patch', patch: patches.ui });
  if (patches.exam) examBridge.dispatch({ type: 'exam/patch', patch: patches.exam });
  for (const bridge of [sessionBridge, kbBridge, searchBridge, callBridge, uiBridge, examBridge]) {
    bridge.flush();
  }
  notifyLegacyListeners();
}

/**
 * Apply one typed action per namespace in a single commit — the typed
 * equivalent of the facade's `state/batch-actions`.
 */
export function dispatchBatch(actions: {
  session?: SessionAction;
  kb?: KbAction;
  search?: SearchAction;
  call?: CallAction;
  ui?: UiAction;
  exam?: ExamAction;
}): void {
  if (actions.session) sessionBridge.dispatch(actions.session);
  if (actions.kb) kbBridge.dispatch(actions.kb);
  if (actions.search) searchBridge.dispatch(actions.search);
  if (actions.call) callBridge.dispatch(actions.call);
  if (actions.ui) uiBridge.dispatch(actions.ui);
  if (actions.exam) examBridge.dispatch(actions.exam);
  for (const bridge of [sessionBridge, kbBridge, searchBridge, callBridge, uiBridge, examBridge]) {
    bridge.flush();
  }
  notifyLegacyListeners();
}

/** The zustand snapshot stores, for advanced subscribers outside React. */
export { callStore, examStore, kbStore, searchStore, sessionStore, uiStore };

/** Legacy ImmutableBridge facades (dispatch/flush semantics). */
export { callBridge, examBridge, kbBridge, searchBridge, sessionBridge, uiBridge };

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
