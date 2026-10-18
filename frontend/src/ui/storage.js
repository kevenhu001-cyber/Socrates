/* Lightweight facade for the archived-session storage surface.
 * The modal implementation is only needed after the user opens archived
 * chats; keeping this module tiny prevents its React bridge helpers from
 * joining the application entry graph.
 */
let _implPromise = null;
let _impl = null;

function loadStorageImpl() {
  if (_impl) return Promise.resolve(_impl);
  if (!_implPromise) {
    _implPromise = import('./storage.impl.mjs')
      .then(function (module) { _impl = module; return module; })
      .catch(function (error) {
        _implPromise = null;
        console.error('[storage] failed to load feature runtime', error);
        throw error;
      });
  }
  return _implPromise;
}

function runStorageAction(action) {
  void loadStorageImpl().then(action).catch(function () { /* loader logs */ });
}

function openStorageModal() {
  runStorageAction(function (module) { module.openStorageModal(); });
}

function closeStorageModal() {
  if (_impl) _impl.closeStorageModal();
  else if (_implPromise) void _implPromise.then(function (module) { module.closeStorageModal(); }).catch(function () {});
}

function renderArchivedList() {
  runStorageAction(function (module) { module.renderArchivedList(); });
}

export { loadStorageImpl, openStorageModal, closeStorageModal, renderArchivedList };
