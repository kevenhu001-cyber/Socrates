// src/batchStorage.js — Phase 1.5 sub-extraction (main.js A.5)
// Coalesce multiple localStorage writes within the same microtask
// tick. During a chat turn, saveCurrentSession and various settings
// toggles can fire 3-5 independent setItem calls. Each one blocks
// the main thread for synchronous I/O; batching them into a single
// write reduces cumulative latency.
//
// Module-load probe detects whether Chromium Tracking Prevention is
// blocking localStorage (3rd-party iframe / sandboxed context / strict
// cookie settings). When detected, Storage.prototype is replaced with
// in-memory implementations so the ~8 "Tracking Prevention blocked
// access to storage" warnings per tutor-mode turn go away.

import { showToast } from './ui/toast.js';

var _batchStoragePending = null;
var _storageBlockedNotified = false;
var _storageBlocked = false;
var _memStorage = null;
var _memSessionStorage = null;

function _detectStorageBlocked(err) {
  if (!err) return false;
  var name = err && err.name;
  return name === "SecurityError" || name === "QuotaExceededError";
}

function _notifyStorageBlockedOnce() {
  if (_storageBlockedNotified) return;
  _storageBlockedNotified = true;
  try {
    showToast("Browser tracking prevention blocked session storage — your chat won't persist across reloads. Open this site in a regular tab to save sessions.", 12000);
  } catch (_) {}
}

/* P_storage-shim — Replace `window.localStorage` and `window.sessionStorage`
   instances with in-memory shims so the ~60 direct storage callers
   across the codebase don't each emit a "Tracking Prevention blocked
   access to storage" warning (one per call, ~8 per tutor-mode turn).
   We can't just override Storage.prototype — Chrome may bind setItem
   as a host-object own property on the Storage instance, shadowing
   the prototype. Replacing the instance via Object.defineProperty is
   the only override that reliably sticks across all browsers.
   Same API shape, so callers don't change. Cross-reload persistence
   is lost (which it would be anyway in a partitioned bucket). */
function _overrideStorageInstances() {
  if (_storageBlocked) return;
  _storageBlocked = true;
  _memStorage = new Map();
  _memSessionStorage = new Map();
  try { window.SOCRATES_STORAGE_BLOCKED = true; } catch (_) {}
  function _makeShim(bag) {
    return {
      setItem: function (k, v) { bag.set(String(k), String(v)); },
      getItem: function (k) { return bag.has(String(k)) ? bag.get(String(k)) : null; },
      removeItem: function (k) { bag.delete(String(k)); },
      clear: function () { bag.clear(); },
      key: function (i) { return Array.from(bag.keys())[i] || null; },
      get length() { return bag.size; },
      [Symbol.iterator]: function () { return bag.entries(); },
    };
  }
  var localShim = _makeShim(_memStorage);
  var sessionShim = _makeShim(_memSessionStorage);
  try {
    Object.defineProperty(window, 'localStorage', {
      value: localShim, writable: false, configurable: true,
    });
  } catch (_) { /* some hosts forbid redefining localStorage */ }
  try {
    Object.defineProperty(window, 'sessionStorage', {
      value: sessionShim, writable: false, configurable: true,
    });
  } catch (_) {}
  /* Prototype fallback — captures of the old localStorage / sessionStorage
     (taken before the defineProperty ran) still need to hit our shim. */
  try {
    Storage.prototype.setItem = function (k, v) {
      var bag = (this === sessionShim) ? _memSessionStorage : _memStorage;
      bag.set(String(k), String(v));
    };
    Storage.prototype.getItem = function (k) {
      var bag = (this === sessionShim) ? _memSessionStorage : _memStorage;
      return bag.has(String(k)) ? bag.get(String(k)) : null;
    };
    Storage.prototype.removeItem = function (k) {
      var bag = (this === sessionShim) ? _memSessionStorage : _memStorage;
      bag.delete(String(k));
    };
    Storage.prototype.clear = function () {
      var bag = (this === sessionShim) ? _memSessionStorage : _memStorage;
      bag.clear();
    };
  } catch (_) {}
}

(function _probeStorage() {
  if (typeof window === "undefined") return;
  var inIframe = false;
  try { inIframe = window.self !== window.top; } catch (_) { inIframe = true; }
  if (inIframe) { _overrideStorageInstances(); _notifyStorageBlockedOnce(); return; }
  var probeKey = "__socrates_probe__";
  try {
    window.localStorage.setItem(probeKey, "1");
    var v = window.localStorage.getItem(probeKey);
    window.localStorage.removeItem(probeKey);
    if (v !== "1") { _overrideStorageInstances(); _notifyStorageBlockedOnce();  }
  } catch {
    _overrideStorageInstances(); _notifyStorageBlockedOnce();
  }
})();

export function batchSetItem(key, value) {
  if (!_batchStoragePending) {
    _batchStoragePending = {};
    queueMicrotask(function () {
      var batch = _batchStoragePending;
      _batchStoragePending = null;
      for (var k in batch) {
        try { localStorage.setItem(k, batch[k]); }
        catch (err) {
          if (_detectStorageBlocked(err)) {
            _overrideStorageInstances();
            _notifyStorageBlockedOnce();
          }
        }
      }
    });
  }
  _batchStoragePending[key] = value;
}

export function batchRemoveItem(key) {
  try { localStorage.removeItem(key); }
  catch (err) {
    if (_detectStorageBlocked(err)) {
      _overrideStorageInstances();
      _notifyStorageBlockedOnce();
    }
  }
}