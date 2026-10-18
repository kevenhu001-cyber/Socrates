/* chat/editBranch.js — lazy compatibility facade.
 *
 * Edit / regenerate / branch are message-toolbar actions. Keep their stable
 * public import path and command semantics, but do not retain the full
 * rollback/markdown/history/mutation-outbox graph in the application entry.
 */
var _implPromise = null;
var _impl = null;

function loadEditBranchImpl() {
  if (!_implPromise) {
    _implPromise = import('./editBranch.impl.mjs').then(function (module) {
      _impl = module;
      return module;
    });
    _implPromise.catch(function (error) {
      _implPromise = null;
      console.error('[edit-branch] failed to load', error);
    });
  }
  return _implPromise;
}

function runEditBranchAction(action) {
  if (_impl) {
    action(_impl);
    return;
  }
  void loadEditBranchImpl().then(action).catch(function () { /* loader logs */ });
}

export function editUserMessage(messageId) {
  runEditBranchAction(function (module) { module.editUserMessage(messageId); });
}

export function regenerateAssistantMessage(messageId) {
  runEditBranchAction(function (module) { module.regenerateAssistantMessage(messageId); });
}

export function branchFromMessage(messageId, options) {
  runEditBranchAction(function (module) { module.branchFromMessage(messageId, options); });
}

export function switchMessageBranch(messageId, targetIndex) {
  runEditBranchAction(function (module) { module.switchMessageBranch(messageId, targetIndex); });
}
