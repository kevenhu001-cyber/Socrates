import {
  callBridge,
  examBridge,
  kbBridge,
  namespaceBridges,
  searchBridge,
  sessionBridge,
  uiBridge,
} from './index.ts';

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

function pathFor(key) {
  if (typeof key !== 'string' || !key) return null;
  if (key.includes('.')) return key;
  var names = Object.keys(namespaceBridges);
  for (var index = 0; index < names.length; index++) {
    var namespace = names[index];
    if (Object.prototype.hasOwnProperty.call(namespaceBridges[namespace].getSnapshot(), key)) {
      return namespace + '.' + key;
    }
  }
  return null;
}

function readPath(path) {
  var parts = path && path.split('.');
  if (!parts || parts.length < 2) return undefined;
  var bridge = namespaceBridges[parts[0]];
  if (!bridge) return undefined;
  var value = bridge.getSnapshot();
  for (var index = 1; index < parts.length; index++) {
    if (value == null) return undefined;
    value = value[parts[index]];
  }
  return value;
}

function dispatchToNamespace(namespace, action) {
  var bridge = namespaceBridges[namespace];
  if (!bridge) throw new TypeError('Unknown state namespace: ' + namespace);
  bridge.dispatch(action);
  bridge.flush();
}

function nestedValue(source, path, value) {
  if (!path.length) return value;
  var root = Array.isArray(source) ? source.slice() : Object.assign({}, source || {});
  var cursor = root;
  var current = source;
  for (var index = 0; index < path.length - 1; index++) {
    current = current && current[path[index]];
    cursor[path[index]] = Array.isArray(current) ? current.slice() : Object.assign({}, current || {});
    cursor = cursor[path[index]];
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
 * Wake the legacy listeners after a commit that did not go through the
 * facade. Callers that write a domain store directly — the typed helpers
 * in src/store/index.ts — use this so the subscribers that watch
 * `stateStore.subscribe` (the research tracker, the scroll indicator) see
 * the change exactly as they would have through the facade.
 */
function notifyLegacyListeners() { notify(); }

export function subscribeAll(listener) {
  var disposers = Object.keys(namespaceBridges).map(function (namespace) {
    return namespaceBridges[namespace].subscribe(listener);
  });
  return function () { disposers.forEach(function (dispose) { dispose(); }); };
}

var stateStore = (function () {
  /** @param {string} key @returns {any} */
  function read(key) {
    var path = pathFor(key);
    return path ? readPath(path) : undefined;
  }

  function dispatchStateSet(action) {
    var setPath = pathFor(action.key);
    if (!setPath) throw new TypeError('Unknown state key: ' + action.key);
    var parts = setPath.split('.');
    var value = parts.length > 2
      ? nestedValue(namespaceBridges[parts[0]].getSnapshot()[parts[1]], parts.slice(2), action.value)
      : action.value;
    dispatchToNamespace(parts[0], { type: parts[0] + '/set', key: parts[1], value: value });
  }

  function dispatchStateBatch(action) {
    if (!action.patch || typeof action.patch !== 'object') {
      throw new TypeError('state/batch requires a patch');
    }
    var perNamespace = {};
    Object.keys(action.patch).forEach(function (key) {
      var path = pathFor(key);
      if (!path) throw new TypeError('Unknown state key: ' + key);
      var parts = path.split('.');
      if (!perNamespace[parts[0]]) perNamespace[parts[0]] = {};
      var current = Object.prototype.hasOwnProperty.call(perNamespace[parts[0]], parts[1])
        ? perNamespace[parts[0]][parts[1]]
        : namespaceBridges[parts[0]].getSnapshot()[parts[1]];
      perNamespace[parts[0]][parts[1]] = parts.length > 2
        ? nestedValue(current, parts.slice(2), action.patch[key])
        : action.patch[key];
    });
    Object.keys(perNamespace).forEach(function (namespace) {
      dispatchToNamespace(namespace, { type: namespace + '/patch', patch: perNamespace[namespace] });
    });
  }

  function dispatchBatchEntry(inner) {
    if (!inner || typeof inner.type !== 'string') {
      throw new TypeError('state/batch-actions: every entry requires a type');
    }
    var namespaceMatch = /^([a-z]+)\/(set|patch|reset)$/.exec(inner.type);
    if (namespaceMatch && namespaceBridges[namespaceMatch[1]]) {
      dispatchToNamespace(namespaceMatch[1], inner);
      return;
    }
    var slash = inner.type.indexOf('/');
    var root = slash > 0 ? inner.type.slice(0, slash) : null;
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

  function dispatchBatchActions(action) {
    /* One notify after all inner actions keeps a batch to one subscriber walk. */
    if (!Array.isArray(action.actions)) {
      throw new TypeError('state/batch-actions requires an actions array');
    }
    for (var index = 0; index < action.actions.length; index += 1) {
      dispatchBatchEntry(action.actions[index]);
    }
  }

  function updateSessionMessage(action) {
    var before = sessionBridge.getSnapshot().messages[Number(action.index)];
    dispatchToNamespace('session', {
      type: action.type, index: action.index, clientId: action.clientId, patch: action.patch || {},
    });
    var after = sessionBridge.getSnapshot().messages[Number(action.index)];
    return action.clientId && (!before || before.clientId !== action.clientId) ? null : after || null;
  }

  function removeSessionMessage(action) {
    var removed = sessionBridge.getSnapshot().messages[Number(action.index)];
    dispatchToNamespace('session', { type: action.type, index: action.index, clientId: action.clientId });
    return action.clientId && removed && removed.clientId !== action.clientId ? null : removed;
  }

  function truncateSessionMessages(action) {
    var messages = sessionBridge.getSnapshot().messages;
    var keep = Number(action.index);
    dispatchToNamespace('session', { type: action.type, index: action.index });
    return Number.isInteger(keep) && keep >= -1 ? messages.slice(keep + 1) : [];
  }

  var sessionActionHandlers = {
    'session/append-message': function (action) {
      dispatchToNamespace('session', { type: action.type, payload: action.payload });
      return sessionBridge.getSnapshot().messages.length - 1;
    },
    'session/replace-messages': function (action) {
      dispatchToNamespace('session', { type: action.type, payload: action.payload });
      return sessionBridge.getSnapshot().messages;
    },
    'session/update-message': updateSessionMessage,
    'session/remove-message-at': removeSessionMessage,
    'session/truncate-messages-after': truncateSessionMessages,
  };

  function dispatchSessionAction(action) {
    if (!Object.prototype.hasOwnProperty.call(sessionActionHandlers, action.type)) {
      throw new TypeError('Unknown state action: ' + action.type);
    }
    return sessionActionHandlers[action.type](action);
  }

  function dispatchAction(action) {
    switch (action.type) {
      case 'state/set': return dispatchStateSet(action);
      case 'state/batch': return dispatchStateBatch(action);
      case 'state/patch-namespace':
        if (!action.namespace) throw new TypeError('state/patch-namespace requires a namespace');
        return dispatchToNamespace(action.namespace, { type: action.namespace + '/patch', patch: action.patch || {} });
      case 'state/batch-actions': return dispatchBatchActions(action);
      case 'state/reset': return resetBridges();
      default: return dispatchSessionAction(action);
    }
  }

  /** @param {StateStoreAction | { type: string; [key: string]: any }} action @returns {any} */
  function dispatch(action) {
    if (!action || typeof action.type !== 'string') {
      throw new TypeError('stateStore.dispatch requires an action');
    }
    var namespaceMatch = /^([a-z]+)\/(set|patch|reset)$/.exec(action.type);
    if (namespaceMatch && namespaceBridges[namespaceMatch[1]]) {
      dispatchToNamespace(namespaceMatch[1], action);
      notify();
      return undefined;
    }
    var result = dispatchAction(action);
    if (action.deferNotify) notifyDeferred();
    else notify();
    return result;
  }

  return Object.freeze({
    read: read,
    dispatch: dispatch,
    getSnapshot: rootSnapshot,
    subscribe: function (listener) {
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
  window.stateStore = stateStore;
  window.resetState = resetState;
  window.__socratesSessionBridge = sessionBridge;
  window.__socratesKbBridge = kbBridge;
  window.__socratesSearchBridge = searchBridge;
  window.__socratesCallBridge = callBridge;
  window.__socratesUiBridge = uiBridge;
  window.__socratesExamBridge = examBridge;
}

export { stateStore, resetState };
export { notifyLegacyListeners };
export { callBridge, examBridge, kbBridge, searchBridge, sessionBridge, uiBridge };
