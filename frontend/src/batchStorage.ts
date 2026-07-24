// src/batchStorage.ts
//
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

let _batchStoragePending: Record<string, string> | null = null;
let _storageBlockedNotified = false;
let _storageBlocked = false;
let _memStorage: Map<string, string> | null = null;
let _memSessionStorage: Map<string, string> | null = null;

function _detectStorageBlocked(err: unknown): boolean {
  if (!err) return false;
  const name = (err as Error).name;
  return name === 'SecurityError' || name === 'QuotaExceededError';
}

function _notifyStorageBlockedOnce(): void {
  if (_storageBlockedNotified) return;
  _storageBlockedNotified = true;
  try {
    if (typeof (window as any).showToast === 'function') {
      (window as any).showToast('Browser tracking prevention blocked session storage \u2014 your chat won\'t persist across reloads. Open this site in a regular tab to save sessions.', 12000);
    }
  } catch (_) { /* ignore */ }
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
function _overrideStorageInstances(): void {
  if (_storageBlocked) return;
  _storageBlocked = true;
  _memStorage = new Map<string, string>();
  _memSessionStorage = new Map<string, string>();
  try { (window as any).SOCRATES_STORAGE_BLOCKED = true; } catch (_) { /* ignore */ }

  interface StorageShim {
    setItem(k: string, v: string): void;
    getItem(k: string): string | null;
    removeItem(k: string): void;
    clear(): void;
    key(i: number): string | null;
    readonly length: number;
    [Symbol.iterator](): IterableIterator<[string, string]>;
  }

  function _makeShim(bag: Map<string, string>): StorageShim {
    return {
      setItem: (k: string, v: string) => { bag.set(String(k), String(v)); },
      getItem: (k: string) => bag.has(String(k)) ? bag.get(String(k)) ?? null : null,
      removeItem: (k: string) => { bag.delete(String(k)); },
      clear: () => { bag.clear(); },
      key: (i: number) => Array.from(bag.keys())[i] || null,
      get length() { return bag.size; },
      [Symbol.iterator]: () => bag.entries(),
    };
  }
  const localShim = _makeShim(_memStorage);
  const sessionShim = _makeShim(_memSessionStorage);
  try {
    Object.defineProperty(window, 'localStorage', {
      value: localShim, writable: false, configurable: true,
    });
  } catch (_) { /* some hosts forbid redefining localStorage */ }
  try {
    Object.defineProperty(window, 'sessionStorage', {
      value: sessionShim, writable: false, configurable: true,
    });
  } catch (_) { /* ignore */ }
  /* Prototype fallback — captures of the old localStorage / sessionStorage
     (taken before the defineProperty ran) still need to hit our shim. */
  try {
    /* eslint-disable @typescript-eslint/unbound-method -- deliberate prototype override */
    Storage.prototype.setItem = function (this: Storage, k: string, v: string): void {
      const bag = (this === sessionShim) ? _memSessionStorage! : _memStorage!;
      bag.set(String(k), String(v));
    };
    Storage.prototype.getItem = function (this: Storage, k: string): string | null {
      const bag = (this === sessionShim) ? _memSessionStorage! : _memStorage!;
      return bag.has(String(k)) ? bag.get(String(k)) ?? null : null;
    };
    Storage.prototype.removeItem = function (this: Storage, k: string): void {
      const bag = (this === sessionShim) ? _memSessionStorage! : _memStorage!;
      bag.delete(String(k));
    };
    Storage.prototype.clear = function (this: Storage): void {
      const bag = (this === sessionShim) ? _memSessionStorage! : _memStorage!;
      bag.clear();
    };
  } catch (_) { /* ignore */ }
}

(function _probeStorage(): void {
  if (typeof window === 'undefined') return;
  let inIframe = false;
  try { inIframe = window.self !== window.top; } catch (_) { inIframe = true; }
  if (inIframe) { _overrideStorageInstances(); _notifyStorageBlockedOnce(); return; }
  const probeKey = '__socrates_probe__';
  try {
    window.localStorage.setItem(probeKey, '1');
    const v = window.localStorage.getItem(probeKey);
    window.localStorage.removeItem(probeKey);
    if (v !== '1') { _overrideStorageInstances(); _notifyStorageBlockedOnce(); return; }
  } catch (err) {
    _overrideStorageInstances(); _notifyStorageBlockedOnce();
  }
})();

export function batchSetItem(key: string, value: string): void {
  if (!_batchStoragePending) {
    _batchStoragePending = {};
    queueMicrotask(() => {
      const batch = _batchStoragePending!;
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

export function batchRemoveItem(key: string): void {
  try { localStorage.removeItem(key); }
  catch (err) {
    if (_detectStorageBlocked(err)) {
      _overrideStorageInstances();
      _notifyStorageBlockedOnce();
    }
  }
}
