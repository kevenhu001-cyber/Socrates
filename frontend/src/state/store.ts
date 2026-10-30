import type { AppState, NamespaceBridge } from './index.ts';
import type { ChatMessageShape } from './session.ts';
const namespaceBridges = typedNamespaceBridges as unknown as Record<string, NamespaceBridge>;

import { runtimeWindow as browserWindow } from '../types/runtimeWindow.ts';
/** The string-path compatibility facade accepts open legacy actions. Domain
 * writers use the discriminated actions exported by store/index.ts. */
interface LegacyStateAction { type: string; [key: string]: unknown }
import {
  callBridge,
  examBridge,
  kbBridge,
  namespaceBridges as typedNamespaceBridges,
  searchBridge,
  sessionBridge,
  uiBridge,
} from './index.ts';

type LegacyStateValues = AppState['session']
  & AppState['kb']
  & AppState['search']
  & AppState['call']
  & AppState['ui']
  & AppState['exam']
  & Record<string, unknown>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function rootSnapshot() {
  return Object.freeze({
    session: sessionBridge.getSnapshot(),
    kb: kbBridge.getSnapshot(),
    search: searchBridge.getSnapshot(),
    call: callBridge.getSnapshot(),
    ui: uiBridge.getSnapshot(),
    exam: examBridge.getSnapshot(),
  });
}

function pathFor(key: unknown) {
  if (typeof key !== 'string' || !key) return null;
  if (key.includes('.')) return key;
  const names = Object.keys(namespaceBridges);
  for (let index = 0; index < names.length; index++) {
    const namespace = names[index];
    if (Object.prototype.hasOwnProperty.call(namespaceBridges[namespace].getSnapshot(), key)) {
      return namespace + '.' + key;
    }
  }
  return null;
}

function readPath(path: string) {
  const parts = path && path.split('.');
  if (!parts || parts.length < 2) return undefined;
  const bridge = namespaceBridges[parts[0]];
  if (!bridge) return undefined;
  let value: unknown = bridge.getSnapshot();
  for (let index = 1; index < parts.length; index++) {
    if (!isRecord(value) && !Array.isArray(value)) return undefined;
    value = (value as Record<string, unknown>)[parts[index]];
  }
  return value;
}

function dispatchToNamespace(namespace: string, action: LegacyStateAction) {
  const bridge = namespaceBridges[namespace];
  if (!bridge) throw new TypeError('Unknown state namespace: ' + namespace);
  bridge.dispatch(action);
  bridge.flush();
}

function nestedValue(source: unknown, path: string[], value: unknown) {
  if (!path.length) return value;
  const root: Record<string, unknown> | unknown[] = Array.isArray(source)
    ? source.slice()
    : Object.assign({}, isRecord(source) ? source : {});
  let cursor = root as Record<string, unknown>;
  let current = source;
  for (let index = 0; index < path.length - 1; index++) {
    current = isRecord(current) || Array.isArray(current)
      ? (current as Record<string, unknown>)[path[index]]
      : undefined;
    const next: Record<string, unknown> | unknown[] = Array.isArray(current)
      ? current.slice()
      : Object.assign({}, isRecord(current) ? current : {});
    cursor[path[index]] = next;
    cursor = next as Record<string, unknown>;
  }
  cursor[path[path.length - 1]] = value;
  return root;
}

function resetBridges() {
  Object.keys(namespaceBridges).forEach(function (namespace) {
    namespaceBridges[namespace].dispatch({ type: namespace + '/reset' });
  });
  Object.keys(namespaceBridges).forEach(function (namespace) {
    namespaceBridges[namespace].flush();
  });
}

/* The legacy listener set lives at module scope rather than inside the
 * facade's closure, because a typed caller that commits a domain action
 * through src/store/index.ts has to be able to wake the same listeners the
 * facade wakes. The facade is not the only writer of the domain stores —
 * it is the only writer that has to be stringly typed.
 *
 * The notification contract is one wake per commit: a batch that touches
 * several namespaces still wakes the listeners once, and a deferred commit
 * coalesces into the next microtask. */
const listeners = new Set<() => void>();
let notifyScheduled = false;

function notify() { listeners.forEach(function (listener: () => void) { listener(); }); }
function notifyDeferred() {
  if (notifyScheduled) return;
  notifyScheduled = true;
  const flush = function () { notifyScheduled = false; notify(); };
  if (typeof requestAnimationFrame === 'function') requestAnimationFrame(flush);
  else if (typeof queueMicrotask === 'function') queueMicrotask(flush);
  else Promise.resolve().then(flush);
}

/**
 * Wake the legacy listeners after a commit that did not go through the
 * facade. Callers that write a domain store directly — the typed helpers
 * in src/store/index.ts — use this so the subscribers that watch
 * `stateStore.subscribe` (the research tracker, the scroll indicator) see
 * the change exactly as they would have through the facade.
 */
function notifyLegacyListeners() { notify(); }

export function subscribeAll(listener: () => void) {
  const disposers = Object.keys(namespaceBridges).map(function (namespace) {
    return namespaceBridges[namespace].subscribe(listener);
  });
  return function () { disposers.forEach(function (dispose) { dispose(); }); };
}

const stateStore = (function () {
  function read<Key extends string>(key: Key): Key extends keyof LegacyStateValues ? LegacyStateValues[Key] : unknown {
    const path = pathFor(key);
    return (path ? readPath(path) : undefined) as Key extends keyof LegacyStateValues ? LegacyStateValues[Key] : unknown;
  }

  function dispatchStateSet(action: LegacyStateAction) {
    if (typeof action.key !== 'string') throw new TypeError('state/set requires a string key');
    const setPath = pathFor(action.key);
    if (!setPath) throw new TypeError('Unknown state key: ' + action.key);
    const parts = setPath.split('.');
    const value = parts.length > 2
      ? nestedValue(namespaceBridges[parts[0]].getSnapshot()[parts[1]], parts.slice(2), action.value)
      : action.value;
    dispatchToNamespace(parts[0], { type: parts[0] + '/set', key: parts[1], value: value });
  }

  function dispatchStateBatch(action: LegacyStateAction) {
    if (!isRecord(action.patch)) {
      throw new TypeError('state/batch requires a patch');
    }
    const patch = action.patch;
    const perNamespace: Record<string, Record<string, unknown>> = {};
    Object.keys(patch).forEach(function (key) {
      const path = pathFor(key);
      if (!path) throw new TypeError('Unknown state key: ' + key);
      const parts = path.split('.');
      if (!perNamespace[parts[0]]) perNamespace[parts[0]] = {};
      const current = Object.prototype.hasOwnProperty.call(perNamespace[parts[0]], parts[1])
        ? perNamespace[parts[0]][parts[1]]
        : namespaceBridges[parts[0]].getSnapshot()[parts[1]];
      perNamespace[parts[0]][parts[1]] = parts.length > 2
        ? nestedValue(current, parts.slice(2), patch[key])
        : patch[key];
    });
    Object.keys(perNamespace).forEach(function (namespace) {
      dispatchToNamespace(namespace, { type: namespace + '/patch', patch: perNamespace[namespace] });
    });
  }

  function dispatchBatchEntry(rawInner: unknown) {
    if (!isRecord(rawInner) || typeof rawInner.type !== 'string') {
      throw new TypeError('state/batch-actions: every entry requires a type');
    }
    const inner = rawInner as LegacyStateAction;
    const namespaceMatch = /^([a-z]+)\/(set|patch|reset)$/.exec(inner.type);
    if (namespaceMatch && namespaceBridges[namespaceMatch[1]]) {
      dispatchToNamespace(namespaceMatch[1], inner);
      return;
    }
    const slash = inner.type.indexOf('/');
    const root = slash > 0 ? inner.type.slice(0, slash) : null;
    if (root === 'session' || root === 'kb' || root === 'search' || root === 'call' || root === 'ui' || root === 'exam') {
      dispatchToNamespace(root, inner);
      return;
    }
    if (inner.type === 'state/set') {
      dispatchStateSet(inner);
      return;
    }
    if (inner.type === 'state/reset') {
      resetBridges();
      return;
    }
    throw new TypeError('state/batch-actions: unsupported action ' + inner.type);
  }

  function dispatchBatchActions(action: LegacyStateAction) {
    /* One notify after all inner actions keeps a batch to one subscriber walk. */
    if (!Array.isArray(action.actions)) {
      throw new TypeError('state/batch-actions requires an actions array');
    }
    for (let index = 0; index < action.actions.length; index += 1) {
      dispatchBatchEntry(action.actions[index]);
    }
  }

  function updateSessionMessage(action: LegacyStateAction) {
    const before = sessionBridge.getSnapshot().messages[Number(action.index)];
    const clientId = typeof action.clientId === 'string' ? action.clientId : undefined;
    const patch = isRecord(action.patch) ? action.patch : {};
    dispatchToNamespace('session', {
      type: action.type, index: Number(action.index), clientId, patch,
    });
    const after = sessionBridge.getSnapshot().messages[Number(action.index)];
    return clientId && (!before || before.clientId !== clientId) ? null : after || null;
  }

  function removeSessionMessage(action: LegacyStateAction) {
    const removed = sessionBridge.getSnapshot().messages[Number(action.index)];
    const clientId = typeof action.clientId === 'string' ? action.clientId : undefined;
    dispatchToNamespace('session', { type: action.type, index: Number(action.index), clientId });
    return clientId && removed && removed.clientId !== clientId ? null : removed;
  }

  function truncateSessionMessages(action: LegacyStateAction) {
    const messages = sessionBridge.getSnapshot().messages;
    const keep = Number(action.index);
    dispatchToNamespace('session', { type: action.type, index: action.index });
    return Number.isInteger(keep) && keep >= -1 ? messages.slice(keep + 1) : [];
  }

  const sessionActionHandlers: Record<string, (action: LegacyStateAction) => unknown> = {
    'session/append-message': function (action: LegacyStateAction) {
      dispatchToNamespace('session', { type: action.type, payload: action.payload });
      return sessionBridge.getSnapshot().messages.length - 1;
    },
    'session/replace-messages': function (action: LegacyStateAction) {
      dispatchToNamespace('session', { type: action.type, payload: action.payload });
      return sessionBridge.getSnapshot().messages;
    },
    'session/update-message': updateSessionMessage,
    'session/remove-message-at': removeSessionMessage,
    'session/truncate-messages-after': truncateSessionMessages,
  };

  function dispatchSessionAction(action: LegacyStateAction) {
    if (!Object.prototype.hasOwnProperty.call(sessionActionHandlers, action.type)) {
      throw new TypeError('Unknown state action: ' + action.type);
    }
    return sessionActionHandlers[action.type](action);
  }

  function dispatchAction(action: LegacyStateAction) {
    switch (action.type) {
      case 'state/set': return dispatchStateSet(action);
      case 'state/batch': return dispatchStateBatch(action);
      case 'state/patch-namespace':
        if (typeof action.namespace !== 'string' || !action.namespace) throw new TypeError('state/patch-namespace requires a namespace');
        return dispatchToNamespace(action.namespace, {
          type: action.namespace + '/patch',
          patch: isRecord(action.patch) ? action.patch : {},
        });
      case 'state/batch-actions': return dispatchBatchActions(action);
      case 'state/reset': return resetBridges();
      default: return dispatchSessionAction(action);
    }
  }

  function dispatch(action: {
    type: 'session/update-message';
    index: number;
    clientId?: string;
    patch: Record<string, unknown>;
  }): ChatMessageShape | null;
  function dispatch(action: { type: 'session/append-message'; payload: ChatMessageShape }): number;
  function dispatch(action: LegacyStateAction): unknown;
  function dispatch(action: LegacyStateAction): unknown {
    if (!action || typeof action.type !== 'string') {
      throw new TypeError('stateStore.dispatch requires an action');
    }
    const namespaceMatch = /^([a-z]+)\/(set|patch|reset)$/.exec(action.type);
    if (namespaceMatch && namespaceBridges[namespaceMatch[1]]) {
      dispatchToNamespace(namespaceMatch[1], action);
      notify();
      return undefined;
    }
    const result = dispatchAction(action);
    if (action.deferNotify === true) notifyDeferred();
    else notify();
    return result;
  }

  return Object.freeze({
    read: read,
    dispatch: dispatch,
    getSnapshot: rootSnapshot,
    subscribe: function (listener: () => void) {
      listeners.add(listener);
      return function () { listeners.delete(listener); };
    },
  });
})();

function resetState() {
  // resetBridges() resets every namespace, including session
  // (session/reset restores currentSessionId to null). No legacy
  // window-level setter is needed here.
  stateStore.dispatch({ type: 'state/reset' });
}

if (typeof window !== 'undefined') {
  browserWindow.stateStore = stateStore;
  browserWindow.resetState = resetState;
}

export { stateStore, resetState };
export { notifyLegacyListeners };
export { callBridge, examBridge, kbBridge, searchBridge, sessionBridge, uiBridge };
