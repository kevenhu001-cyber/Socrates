// Lightweight facade for the keyboard-shortcut cheatsheet.
// Keep the compatibility import path eager while the actual surface code
// arrives only when the user opens it.
let _implPromise = null;
let _impl = null;

function loadCheatsheetImpl() {
  if (_impl) return Promise.resolve(_impl);
  if (!_implPromise) {
    _implPromise = import('./cheatsheet.impl.mjs')
      .then(function (module) { _impl = module; return module; })
      .catch(function (error) {
        _implPromise = null;
        console.error('[cheatsheet] failed to load feature runtime', error);
        throw error;
      });
  }
  return _implPromise;
}

function runCheatsheetAction(action) {
  void loadCheatsheetImpl().then(action).catch(function () { /* loader logs */ });
}

export function openCheatsheet() {
  runCheatsheetAction(function (module) { module.openCheatsheet(); });
}

export function closeCheatsheet() {
  if (_impl) _impl.closeCheatsheet();
  else if (_implPromise) void _implPromise.then(function (module) { module.closeCheatsheet(); }).catch(function () {});
}

/* No first-party caller consumes this helper directly; retain it for legacy
   compatibility while keeping the implementation out of startup. */
export function buildCheatsheetSection(title, rows) {
  return loadCheatsheetImpl().then(function (module) { return module.buildCheatsheetSection(title, rows); });
}
