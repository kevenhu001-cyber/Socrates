/* M3 state facade — bridges own the canonical state.
   ─────────────────────────────────────────────────────────────
   Per-namespace `createImmutableBridge` instances in `./state/bridges.ts`
   own the snapshots. `stateStore` is a thin facade that:
     • forwards each action to the correct bridge via `dispatch`,
     • calls `.flush()` after dispatch so synchronous reads (main.js
       expects `state.X = Y; …; var v = state.X` to see the new value),
     • aggregates snapshots into the legacy root `state` shape for
       Proxy reads,
     • forwards subscriptions to every bridge so any namespace change
       wakes the listener once.

The `state` Proxy is kept as a backward-compat surface. Reads return live
bridge snapshots (frozen refs). Writes (`state.session.topic = "x"`)
are translated into the corresponding `state/set` dispatch. The legacy
`state.X` form works as long as `X` is registered in `FLAT_STATE_PATHS`
(see `./state/index.ts`); new fields belong in the appropriate
namespace module (`session.ts`, `kb.ts`, etc.).

`resetState()` is now a single action — `stateStore.dispatch({type:
'state/reset'})` — no more 60-line hand-maintained field list. */

import {
  callBridge,
  examBridge,
  FLAT_STATE_PATHS,
  kbBridge,
  namespaceBridges,
  searchBridge,
  sessionBridge,
  uiBridge,
} from './state/index.ts';

/* Read the live root state from the bridges. The returned object's
   namespaces are the bridge snapshots (frozen). */
function readRootState() {
  return {
    session: sessionBridge.getSnapshot(),
    kb: kbBridge.getSnapshot(),
    search: searchBridge.getSnapshot(),
    call: callBridge.getSnapshot(),
    ui: uiBridge.getSnapshot(),
    exam: examBridge.getSnapshot(),
    tutorAttachments: null,
    tutorPartsTemplate: null,
  };
}

function pathFor(key) {
  if (typeof key !== 'string') return null;
  return FLAT_STATE_PATHS[key] || key;
}

function readPath(path) {
  if (!path) return undefined;
  var parts = path.split('.');
  var value = readRootState();
  for (var i = 0; i < parts.length; i++) {
    if (value == null) return undefined;
    value = value[parts[i]];
  }
  return value;
}

function setPath(path, value) {
  var parts = path.split('.');
  if (parts.length === 1) {
    throw new TypeError('setPath requires a namespace, got: ' + path);
  }
  var namespace = parts[0];
  var key = parts[1];
  var bridge = namespaceBridges[namespace];
  if (!bridge) {
    throw new TypeError('Unknown state namespace: ' + namespace);
  }
  bridge.dispatch({ type: namespace + '/set', key: key, value: value });
  bridge.flush();
}

function setNamespacePatch(namespace, patch) {
  var bridge = namespaceBridges[namespace];
  if (!bridge) {
    throw new TypeError('Unknown state namespace: ' + namespace);
  }
  stateStore.dispatch({ type: namespace + '/patch', patch: patch });
}

function resetBridges() {
  for (var key in namespaceBridges) {
    namespaceBridges[key].dispatch({ type: key + '/reset' });
  }
  for (var key2 in namespaceBridges) {
    namespaceBridges[key2].flush();
  }
}

/* Aggregate subscriptions across all bridges so a single listener
   fires on every commit. (Currently `stateStore.dispatch` calls its
   own listeners directly; this helper is kept for callers that want
   to bridge directly without going through `stateStore`.) */
export function subscribeAll(listener) {
  var disposers = [];
  for (var key in namespaceBridges) {
    disposers.push(namespaceBridges[key].subscribe(listener));
  }
  return function () {
    for (var i = 0; i < disposers.length; i++) disposers[i]();
  };
}

/* Build the Proxy that turns legacy `state.X` reads/writes into
   bridge dispatches. The Proxy is the value of the module-level
   `state` identifier from this point on. The root Proxy returns
   nested proxies for namespace reads (`state.session`, `state.kb`,
   etc.) so writes through `state.session.phase = "x"` route through
   `sessionBridge.dispatch` exactly as `state.phase = "x"` does. */
var ROOT_NAMESPACES = {
  session: sessionBridge,
  kb: kbBridge,
  search: searchBridge,
  call: callBridge,
  ui: uiBridge,
  exam: examBridge,
};

function createNamespaceProxy(namespace, bridge) {
  return new Proxy({}, {
    get: function (_target, prop) {
      if (typeof prop !== 'string') return undefined;
      if (Object.prototype.hasOwnProperty.call(FLAT_STATE_PATHS, prop)) {
        var path = FLAT_STATE_PATHS[prop];
        /* `path` is "<namespace>.<key>" for this namespace's own keys.
           Translate to a bridge key read. */
        if (path.indexOf(namespace + '.') === 0) {
          var snapshot = bridge.getSnapshot();
          return snapshot[path.slice(namespace.length + 1)];
        }
        return readPath(path);
      }
      /* Anything else is an arbitrary sub-property — read the live
         snapshot. */
      return bridge.getSnapshot()[prop];
    },
    set: function (_target, prop, value) {
      if (typeof prop !== 'string') return false;
      if (Object.prototype.hasOwnProperty.call(FLAT_STATE_PATHS, prop)) {
        var path = FLAT_STATE_PATHS[prop];
        if (path.indexOf(namespace + '.') === 0) {
          var bridgeKey = path.slice(namespace.length + 1);
          bridge.dispatch({ type: namespace + '/set', key: bridgeKey, value: value });
          bridge.flush();
          return true;
        }
      }
      bridge.dispatch({ type: namespace + '/set', key: prop, value: value });
      bridge.flush();
      return true;
    },
    has: function (_target, prop) {
      if (typeof prop !== 'string') return false;
      return prop in bridge.getSnapshot();
    },
    ownKeys: function (_target) {
      var keys = Object.keys(bridge.getSnapshot());
      /* The bridge appends `revision` for change detection — hide it
         from the legacy compat surface so deepEqual(initial.session,
         state.session) continues to match. */
      var idx = keys.indexOf('revision');
      if (idx >= 0) keys.splice(idx, 1);
      return keys;
    },
    getOwnPropertyDescriptor: function (_target, prop) {
      if (typeof prop !== 'string') return undefined;
      if (prop === 'revision') return undefined;
      var snapshot = bridge.getSnapshot();
      if (!(prop in snapshot)) return undefined;
      return {
        configurable: true,
        enumerable: true,
        get: function () { return bridge.getSnapshot()[prop]; },
        set: function (v) {
          bridge.dispatch({ type: namespace + '/set', key: prop, value: v });
          bridge.flush();
        },
      };
    },
  });
}

function createProxy() {
  /* Sibling state slots (tutorAttachments / tutorPartsTemplate) live
     outside any namespace bridge. They are mutable per the legacy
     `state.tutorAttachments = [...]` pattern but reset to null on
     `state/reset`. */
  var siblingState = { tutorAttachments: null, tutorPartsTemplate: null };
  function refreshSiblingsOnReset() {
    siblingState.tutorAttachments = null;
    siblingState.tutorPartsTemplate = null;
  }
  /* We never cache `target` here — every read goes through the live
     bridges so legacy `state.X` always sees the current snapshot. */
  var proxyTarget = new Proxy({}, {
    getOwnPropertyDescriptor: function (_t, prop) {
      if (typeof prop !== 'string') return undefined;
      if (prop in siblingState) {
        return {
          configurable: true,
          enumerable: true,
          get: function () { return siblingState[prop]; },
          set: function (v) { siblingState[prop] = v; },
        };
      }
      return undefined;
    },
    ownKeys: function () { return Object.keys(siblingState); },
    has: function (_t, prop) {
      return typeof prop === 'string' && prop in siblingState;
    },
    get: function (_t, prop) {
      if (typeof prop === 'string' && prop in siblingState) return siblingState[prop];
      return undefined;
    },
    set: function (_t, prop, value) {
      if (typeof prop !== 'string') return false;
      siblingState[prop] = value;
      return true;
    },
  });
  /* Subscribe to the bridge subscription so reset also clears
     sibling state. The listener is a no-op but its lifecycle ties
     `siblingState` to the bridges' notification cycle. */
  stateStore.subscribe(refreshSiblingsOnReset);
  return new Proxy(proxyTarget, {
    get: function (_target, prop) {
      if (typeof prop !== 'string') return undefined;
      if (Object.prototype.hasOwnProperty.call(ROOT_NAMESPACES, prop)) {
        return createNamespaceProxy(prop, ROOT_NAMESPACES[prop]);
      }
      var liveRoot = readRootState();
      if (prop in liveRoot) return liveRoot[prop];
      if (prop in siblingState) return siblingState[prop];
      if (Object.prototype.hasOwnProperty.call(FLAT_STATE_PATHS, prop)) {
        return readPath(FLAT_STATE_PATHS[prop]);
      }
      return undefined;
    },
    set: function (_target, prop, value) {
      if (typeof prop !== 'string') return false;
      if (Object.prototype.hasOwnProperty.call(ROOT_NAMESPACES, prop)) {
        var setBridge = ROOT_NAMESPACES[prop];
        if (value && typeof value === 'object') {
          setBridge.dispatch({ type: prop + '/patch', patch: value });
          setBridge.flush();
          return true;
        }
        return false;
      }
      if (Object.prototype.hasOwnProperty.call(FLAT_STATE_PATHS, prop)) {
        setPath(FLAT_STATE_PATHS[prop], value);
        return true;
      }
      siblingState[prop] = value;
      return true;
    },
    deleteProperty: function (_target, prop) {
      if (typeof prop !== 'string') return false;
      if (Object.prototype.hasOwnProperty.call(FLAT_STATE_PATHS, prop)) {
        var path = FLAT_STATE_PATHS[prop];
        var parts = path.split('.');
        var namespace = parts[0];
        var bridge = namespaceBridges[namespace];
        if (!bridge) return true;
        bridge.dispatch({ type: namespace + '/set', key: parts[1], value: undefined });
        bridge.flush();
        return true;
      }
      if (prop in siblingState) {
        delete siblingState[prop];
        return true;
      }
      return true;
    },
    has: function (_target, prop) {
      if (typeof prop !== 'string') return false;
      if (Object.prototype.hasOwnProperty.call(ROOT_NAMESPACES, prop)) return true;
      if (Object.prototype.hasOwnProperty.call(FLAT_STATE_PATHS, prop)) return true;
      if (prop in siblingState) return true;
      return prop in readRootState();
    },
    ownKeys: function (_target) {
      return Array.from(new Set([].concat(
        Object.keys(ROOT_NAMESPACES),
        Object.keys(siblingState),
        Object.keys(FLAT_STATE_PATHS),
      )));
    },
    getOwnPropertyDescriptor: function (_target, prop) {
      if (typeof prop !== 'string') return undefined;
      if (Object.prototype.hasOwnProperty.call(ROOT_NAMESPACES, prop)) {
        return {
          configurable: true,
          enumerable: true,
          get: function () { return createNamespaceProxy(prop, ROOT_NAMESPACES[prop]); },
          set: function () { /* namespace replacement is via stateStore.dispatch */ },
        };
      }
      if (Object.prototype.hasOwnProperty.call(FLAT_STATE_PATHS, prop)) {
        var path = FLAT_STATE_PATHS[prop];
        return {
          configurable: true,
          enumerable: true,
          get: function () { return readPath(path); },
          set: function (v) { setPath(path, v); },
        };
      }
      if (prop in siblingState) {
        return {
          configurable: true,
          enumerable: true,
          get: function () { return siblingState[prop]; },
          set: function (v) { siblingState[prop] = v; },
        };
      }
      return undefined;
    },
  });
}

/* stateStore — the public facade.
   ─────────────────────────────────────────────────────────────
   Subscribers live in a single Set on this facade. stateStore
   calls them synchronously after each successful dispatch,
   matching the original notify() contract (and the `deferNotify`
   RAF path is preserved for `session/*` actions that used it).
   Per-bridge listeners are kept available on each bridge for
   code that wants raw bridge access (useSessionSnapshot etc.). */
var stateStore = (function () {
  var listeners = new Set();
  var notifyScheduled = false;
  function notify() { listeners.forEach(function (listener) { listener(); }); }
  function notifyDeferred() {
    if (notifyScheduled) return;
    notifyScheduled = true;
    var flush = function () { notifyScheduled = false; notify(); };
    if (typeof requestAnimationFrame === 'function') requestAnimationFrame(flush);
    else if (typeof queueMicrotask === 'function') queueMicrotask(flush);
    else Promise.resolve().then(flush);
  }
  /**
   * @param {string} key
   * @returns {unknown}
   */
  function read(key) { return readPath(pathFor(key)); }
  /**
   * @param {StateStoreAction | { type: string; [k: string]: unknown }} action
   * @returns {unknown}
   */
  function dispatch(action) {
      if (!action || typeof action.type !== 'string') {
        throw new TypeError('stateStore.dispatch requires an action');
      }
      var result;
      var namespaceActionMatch = /^([a-z]+)\/(set|patch|reset)$/.exec(action.type);
      if (namespaceActionMatch && namespaceBridges[namespaceActionMatch[1]]) {
        var ns = namespaceActionMatch[1];
        var nsBridge = namespaceBridges[ns];
        nsBridge.dispatch(action);
        nsBridge.flush();
        notify();
        return undefined;
      }
      switch (action.type) {
        case 'state/set': {
          var setPathValue = pathFor(action.key);
          if (!setPathValue) {
            throw new TypeError('state/set requires a key, got: ' + action.key);
          }
          var setParts = setPathValue.split('.');
          var setNamespace = setParts[0];
          var setBridge = namespaceBridges[setNamespace];
          if (!setBridge) throw new TypeError('Unknown namespace: ' + setNamespace);
          setBridge.dispatch({
            type: setNamespace + '/set',
            key: setParts[1],
            value: action.value,
          });
          setBridge.flush();
          break;
        }
        case 'state/batch': {
          if (!action.patch || typeof action.patch !== 'object') {
            throw new TypeError('state/batch requires a patch');
          }
          /* Group by namespace so we can dispatch a single patch per
             bridge (and flush once per bridge). */
          var perNamespace = {};
          Object.keys(action.patch).forEach(function (key) {
            var batchPath = pathFor(key);
            if (!batchPath) {
              throw new TypeError('state/batch contains an invalid key: ' + key);
            }
            var batchParts = batchPath.split('.');
            var batchNamespace = batchParts[0];
            if (!perNamespace[batchNamespace]) perNamespace[batchNamespace] = {};
            perNamespace[batchNamespace][batchParts[1]] = action.patch[key];
          });
          Object.keys(perNamespace).forEach(function (ns) {
            var batchBridge = namespaceBridges[ns];
            batchBridge.dispatch({
              type: ns + '/patch',
              patch: perNamespace[ns],
            });
            batchBridge.flush();
          });
          break;
        }
        case 'state/patch-namespace': {
          if (!action.namespace) {
            throw new TypeError('state/patch-namespace requires a namespace');
          }
          setNamespacePatch(action.namespace, action.patch || {});
          namespaceBridges[action.namespace].flush();
          break;
        }
        case 'state/reset':
          resetBridges();
          break;
        case 'session/append-message':
          sessionBridge.dispatch({
            type: 'session/append-message',
            payload: action.payload,
          });
          sessionBridge.flush();
          result = sessionBridge.getSnapshot().messages.length - 1;
          break;
        case 'session/replace-messages':
          sessionBridge.dispatch({
            type: 'session/replace-messages',
            payload: action.payload,
          });
          sessionBridge.flush();
          result = sessionBridge.getSnapshot().messages;
          break;
        case 'session/update-message':
          {
            var beforeMsg = sessionBridge.getSnapshot().messages[Number(action.index)];
            var beforeClientId = beforeMsg && beforeMsg.clientId;
            sessionBridge.dispatch({
              type: 'session/update-message',
              index: action.index,
              clientId: action.clientId,
              patch: action.patch || {},
            });
            sessionBridge.flush();
            var afterMsg = sessionBridge.getSnapshot().messages[Number(action.index)];
            result = (action.clientId && beforeClientId !== action.clientId) ? null : afterMsg || null;
          }
          break;
        case 'session/remove-message-at':
          {
            var beforeRemove = sessionBridge.getSnapshot().messages[Number(action.index)];
            sessionBridge.dispatch({
              type: 'session/remove-message-at',
              index: action.index,
              clientId: action.clientId,
            });
            sessionBridge.flush();
            result = (action.clientId && beforeRemove && beforeRemove.clientId !== action.clientId)
              ? null
              : beforeRemove;
            break;
          }
        case 'session/truncate-messages-after':
          {
            var beforeTruncate = sessionBridge.getSnapshot().messages;
            sessionBridge.dispatch({
              type: 'session/truncate-messages-after',
              index: action.index,
            });
            sessionBridge.flush();
            var keep = Number(action.index);
            if (!Number.isInteger(keep) || keep < -1) {
              result = [];
              break;
            }
            /* Return the messages that were dropped, not the kept ones. */
            result = beforeTruncate.slice(keep + 1);
          }
          break;
        default:
          throw new TypeError('Unknown state action: ' + action.type);
      }
      if (action.deferNotify) notifyDeferred();
      else notify();
      return result;
    }
    return Object.freeze({
      read: read,
      dispatch: dispatch,
      getSnapshot: function () { return readRootState(); },
      subscribe: function (listener) {
        listeners.add(listener);
        return function () { listeners.delete(listener); };
      },
    });
})();

/* Reset entry point used by main.js / onclick handlers. */
function resetState() {
  stateStore.dispatch({ type: 'state/reset' });
  try { if (typeof setCurrentSessionId === 'function') setCurrentSessionId(null); } catch (_) {}
}

/* Module-level `state` Proxy — the legacy compat shim. */
var state = createProxy();

/* Expose as a global for backward compat with the rest of the code. */
if (typeof window !== 'undefined') {
  window.state = state;
  window.stateStore = stateStore;
  window.resetState = resetState;
} else if (typeof globalThis !== 'undefined') {
  globalThis.state = state;
  globalThis.stateStore = stateStore;
  globalThis.resetState = resetState;
}

/* Window slots for per-namespace bridges — same convention as the
   React-side `xxx.bridge.ts` files. Useful for advanced subscribers
   that want a single-namespace read without iterating `namespaceBridges`. */
if (typeof window !== 'undefined') {
  window.__socratesSessionBridge = sessionBridge;
  window.__socratesKbBridge = kbBridge;
  window.__socratesSearchBridge = searchBridge;
  window.__socratesCallBridge = callBridge;
  window.__socratesUiBridge = uiBridge;
  window.__socratesExamBridge = examBridge;
}

export { state, stateStore, resetState };
export {
  callBridge,
  examBridge,
  kbBridge,
  searchBridge,
  sessionBridge,
  uiBridge,
};