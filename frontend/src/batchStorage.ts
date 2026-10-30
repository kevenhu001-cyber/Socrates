// src/batchStorage.ts — Phase 1.5 sub-extraction (main.js A.5)
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
import { runtimeWindow as browserWindow } from "./types/runtimeWindow.ts";


let _batchStoragePending: { [x: string]: any; }|null = null;
let _storageBlockedNotified = false;
let _storageBlocked = false;
let _memStorage: Map<any,any>|null = null;
let _memSessionStorage: Map<any,any>|null = null;

function _detectStorageBlocked(err: unknown) {
  if (!err || typeof err !== "object" || !("name" in err)) return false;
  const name = err && err.name;
  return name === "SecurityError" || name === "QuotaExceededError";
}

function _notifyStorageBlockedOnce() {
  if (_storageBlockedNotified) return;
  _storageBlockedNotified = true;
  try {
    showToast("Browser tracking prevention blocked session storage — your chat won't persist across reloads. Open this site in a regular tab to save sessions.", 12000);
  } catch (_) { /* empty-catch: intentional — a failed toast must not block the storage fallback. */ }
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
  try { browserWindow.SOCRATES_STORAGE_BLOCKED = true; } catch (_) { /* empty-catch: intentional — the diagnostic flag is optional outside a writable browser global. */ }
  function _makeShim(bag: Map<any,any>) {
    return {
      setItem: function (k: any, v: any) { bag.set(String(k), String(v)); },
      getItem: function (k: any) { return bag.has(String(k)) ? bag.get(String(k)) : null; },
      removeItem: function (k: any) { bag.delete(String(k)); },
      clear: function () { bag.clear(); },
      key: function (i: number) { return Array.from(bag.keys())[i] || null; },
      get length() { return bag.size; },
      [Symbol.iterator]: function () { return bag.entries(); },
    };
  }
  const localShim = _makeShim(_memStorage);
  const sessionShim = _makeShim(_memSessionStorage);
  try {
    Object.defineProperty(browserWindow, 'localStorage', {
      value: localShim, writable: false, configurable: true,
    });
  } catch (_) { /* some hosts forbid redefining localStorage */ }
  try {
    Object.defineProperty(browserWindow, 'sessionStorage', {
      value: sessionShim, writable: false, configurable: true,
    });
  } catch (_) { /* empty-catch: intentional — a host may forbid replacing sessionStorage; the prototype fallback still runs. */ }
  /* Prototype fallback — captures of the old localStorage / sessionStorage
     (taken before the defineProperty ran) still need to hit our shim. */
  try {
    Storage.prototype.setItem = function (k, v) {
      const bag = (this === sessionShim) ? _memSessionStorage : _memStorage;
      bag!.set(String(k), String(v));
    };
    Storage.prototype.getItem = function (k) {
      const bag = (this === sessionShim) ? _memSessionStorage : _memStorage;
      return bag!.has(String(k)) ? bag!.get(String(k)) : null;
    };
    Storage.prototype.removeItem = function (k) {
      const bag = (this === sessionShim) ? _memSessionStorage : _memStorage;
      bag!.delete(String(k));
    };
    Storage.prototype.clear = function () {
      const bag = (this === sessionShim) ? _memSessionStorage : _memStorage;
      bag!.clear();
    };
  } catch (_) { /* empty-catch: intentional — some hosts freeze Storage.prototype; instance shims remain active where supported. */ }
}

(function _probeStorage() {
  if (typeof window === "undefined") return;
  let inIframe;
  try { inIframe = browserWindow.self !== browserWindow.top; } catch (_) { inIframe = true; }
  if (inIframe) { _overrideStorageInstances(); _notifyStorageBlockedOnce(); return; }
  const probeKey = "__socrates_probe__";
  try {
    browserWindow.localStorage.setItem(probeKey, "1");
    const v = browserWindow.localStorage.getItem(probeKey);
    browserWindow.localStorage.removeItem(probeKey);
    if (v !== "1") { _overrideStorageInstances(); _notifyStorageBlockedOnce();  }
  } catch {
    _overrideStorageInstances(); _notifyStorageBlockedOnce();
  }
})();

export function batchSetItem(key: string, value: string) {
  if (!_batchStoragePending) {
    _batchStoragePending = {};
    queueMicrotask(function () {
      const batch = _batchStoragePending;
      _batchStoragePending = null;
      for (const k in batch) {
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

/* Read through a queued write. A caller that saves and immediately reads back
   (turnClient.savePendingTurn → loadPendingTurn, or bumpPendingSeq) must see
   the value it just wrote; without this it would see the previous commit and
   silently drop the update. */
export function batchPeek(key: string) {
  if (_batchStoragePending && Object.prototype.hasOwnProperty.call(_batchStoragePending, key)) {
    return _batchStoragePending[key];
  }
  try { return typeof localStorage === 'undefined' ? null : localStorage.getItem(key); }
  catch { return null; }
}

export function batchRemoveItem(key: string) {
  /* Cancel a queued write first: otherwise the microtask would resurrect the
     value after this removal (save → clear in one tick). */
  if (_batchStoragePending && Object.prototype.hasOwnProperty.call(_batchStoragePending, key)) {
    delete _batchStoragePending[key];
  }
  try { localStorage.removeItem(key); }
  catch (err) {
    if (_detectStorageBlocked(err)) {
      _overrideStorageInstances();
      _notifyStorageBlockedOnce();
    }
  }
}
