type FeatureRuntime = typeof import("./editBranch.impl.ts");

/* chat/editBranch.ts — lazy compatibility facade.
 *
 * Edit / regenerate / branch are message-toolbar actions. Keep their stable
 * public import path and command semantics, but do not retain the full
 * rollback/markdown/history/mutation-outbox graph in the application entry.
 */
let _implPromise: Promise<FeatureRuntime> | null = null;
let _impl: FeatureRuntime | null = null;

function loadEditBranchImpl() {
  if (!_implPromise) {
    _implPromise = import('./editBranch.impl.ts').then(function (module) {
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

function runEditBranchAction(action: (module: FeatureRuntime) => void) {
  if (_impl) {
    action(_impl);
    return;
  }
  void loadEditBranchImpl().then(action).catch(function () { /* loader logs */ });
}

export function commitUserMessageEdit(messageId: string, text: string) {
  runEditBranchAction(function (module: FeatureRuntime) { module.commitUserMessageEdit(messageId, text); });
}

export function regenerateAssistantMessage(messageId: string) {
  runEditBranchAction(function (module: FeatureRuntime) { module.regenerateAssistantMessage(messageId); });
}

export function branchFromMessage(messageId: string, options: Parameters<FeatureRuntime['branchFromMessage']>[1]) {
  runEditBranchAction(function (module: FeatureRuntime) { module.branchFromMessage(messageId, options); });
}

export function switchMessageBranch(messageId: string, targetIndex: number) {
  runEditBranchAction(function (module: FeatureRuntime) { module.switchMessageBranch(messageId, targetIndex); });
}
