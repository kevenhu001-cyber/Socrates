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

export function openCheatsheet() {
  return loadCheatsheetImpl().then(function (module) { return module.openCheatsheet(); });
}

export function closeCheatsheet() {
  if (_impl) return _impl.closeCheatsheet();
  if (_implPromise) return _implPromise.then(function (module) { return module.closeCheatsheet(); });
}

export function buildCheatsheetSection(title, rows) {
  return loadCheatsheetImpl().then(function (module) { return module.buildCheatsheetSection(title, rows); });
}
