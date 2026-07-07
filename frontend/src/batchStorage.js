// src/batchStorage.js — Phase 1.5 sub-extraction (main.js A.5)
// Coalesce multiple localStorage writes within the same microtask
// tick. During a chat turn, saveCurrentSession and various settings
// toggles can fire 3-5 independent setItem calls. Each one blocks
// the main thread for synchronous I/O; batching them into a single
// write reduces cumulative latency.

var _batchStoragePending = null;

export function batchSetItem(key, value) {
  if (!_batchStoragePending) {
    _batchStoragePending = {};
    queueMicrotask(function () {
      var batch = _batchStoragePending;
      _batchStoragePending = null;
      for (var k in batch) {
        try { localStorage.setItem(k, batch[k]); } catch (_) {}
      }
    });
  }
  _batchStoragePending[key] = value;
}

export function batchRemoveItem(key) {
  try { localStorage.removeItem(key); } catch (_) {}
}