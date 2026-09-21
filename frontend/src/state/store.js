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

export function subscribeAll(listener) {
  var disposers = Object.keys(namespaceBridges).map(function (namespace) {
    return namespaceBridges[namespace].subscribe(listener);
  });
  return function () { disposers.forEach(function (dispose) { dispose(); }); };
}

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

  /** @param {string} key @returns {any} */
  function read(key) {
    var path = pathFor(key);
    return path ? readPath(path) : undefined;
  }

  /** @param {StateStoreAction | { type: string; [key: string]: any }} action @returns {any} */
  function dispatch(action) {
    if (!action || typeof action.type !== 'string') {
      throw new TypeError('stateStore.dispatch requires an action');
    }
    var result;
    var namespaceMatch = /^([a-z]+)\/(set|patch|reset)$/.exec(action.type);
    if (namespaceMatch && namespaceBridges[namespaceMatch[1]]) {
      dispatchToNamespace(namespaceMatch[1], action);
      notify();
      return undefined;
    }

    switch (action.type) {
      case 'state/set': {
        var setPath = pathFor(action.key);
        if (!setPath) throw new TypeError('Unknown state key: ' + action.key);
        var setParts = setPath.split('.');
        dispatchToNamespace(setParts[0], {
          type: setParts[0] + '/set',
          key: setParts[1],
          value: setParts.length > 2
            ? nestedValue(namespaceBridges[setParts[0]].getSnapshot()[setParts[1]], setParts.slice(2), action.value)
            : action.value,
        });
        break;
      }
      case 'state/batch': {
        if (!action.patch || typeof action.patch !== 'object') {
          throw new TypeError('state/batch requires a patch');
        }
        var perNamespace = {};
        Object.keys(action.patch).forEach(function (key) {
          var batchPath = pathFor(key);
          if (!batchPath) throw new TypeError('Unknown state key: ' + key);
          var parts = batchPath.split('.');
          if (!perNamespace[parts[0]]) perNamespace[parts[0]] = {};
          var currentValue = Object.prototype.hasOwnProperty.call(perNamespace[parts[0]], parts[1])
            ? perNamespace[parts[0]][parts[1]]
            : namespaceBridges[parts[0]].getSnapshot()[parts[1]];
          perNamespace[parts[0]][parts[1]] = parts.length > 2
            ? nestedValue(currentValue, parts.slice(2), action.patch[key])
            : action.patch[key];
        });
        Object.keys(perNamespace).forEach(function (namespace) {
          dispatchToNamespace(namespace, {
            type: namespace + '/patch',
            patch: perNamespace[namespace],
          });
        });
        break;
      }
      case 'state/patch-namespace':
        if (!action.namespace) throw new TypeError('state/patch-namespace requires a namespace');
        dispatchToNamespace(action.namespace, {
          type: action.namespace + '/patch',
          patch: action.patch || {},
        });
        break;
      case 'state/reset':
        resetBridges();
        break;
      case 'session/append-message':
        dispatchToNamespace('session', { type: action.type, payload: action.payload });
        result = sessionBridge.getSnapshot().messages.length - 1;
        break;
      case 'session/append-turn': {
        var turnStart = sessionBridge.getSnapshot().messages.length;
        dispatchToNamespace('session', { type: action.type, payload: action.payload });
        result = [turnStart, turnStart + 1];
        break;
      }
      case 'session/replace-messages':
        dispatchToNamespace('session', { type: action.type, payload: action.payload });
        result = sessionBridge.getSnapshot().messages;
        break;
      case 'session/update-message': {
        var before = sessionBridge.getSnapshot().messages[Number(action.index)];
        dispatchToNamespace('session', {
          type: action.type,
          index: action.index,
          clientId: action.clientId,
          patch: action.patch || {},
        });
        var after = sessionBridge.getSnapshot().messages[Number(action.index)];
        result = action.clientId && (!before || before.clientId !== action.clientId) ? null : after || null;
        break;
      }
      case 'session/remove-message-at': {
        var removed = sessionBridge.getSnapshot().messages[Number(action.index)];
        dispatchToNamespace('session', {
          type: action.type,
          index: action.index,
          clientId: action.clientId,
        });
        result = action.clientId && removed && removed.clientId !== action.clientId ? null : removed;
        break;
      }
      case 'session/truncate-messages-after': {
        var messages = sessionBridge.getSnapshot().messages;
        var keep = Number(action.index);
        dispatchToNamespace('session', { type: action.type, index: action.index });
        result = Number.isInteger(keep) && keep >= -1 ? messages.slice(keep + 1) : [];
        break;
      }
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
export { callBridge, examBridge, kbBridge, searchBridge, sessionBridge, uiBridge };
