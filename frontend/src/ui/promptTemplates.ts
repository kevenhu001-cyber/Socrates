type FeatureRuntime = typeof import("./promptTemplates.impl.ts");

/* Lightweight facade for the Skills / prompt-templates surface.
 *
 * The implementation pulls template persistence, confirm/toast UI and the
 * editor renderer. None of that is needed until the user opens Skills, so
 * preserve this stable import path while deferring the feature runtime.
 */
let _implPromise: Promise<FeatureRuntime> | null = null;
let _impl: FeatureRuntime | null = null;

function loadPromptTemplatesImpl() {
  if (_impl) return Promise.resolve(_impl);
  if (!_implPromise) {
    _implPromise = import('./promptTemplates.impl.ts')
      .then(function (module) { _impl = module; return module; })
      .catch(function (error) {
        _implPromise = null;
        console.error('[prompt-templates] failed to load feature runtime', error);
        throw error;
      });
  }
  return _implPromise;
}

function runPromptTemplatesAction(action: { (module: FeatureRuntime): void; (module: FeatureRuntime): void; (module: FeatureRuntime): void; (module: FeatureRuntime): void; (module: FeatureRuntime): void; }) {
  void loadPromptTemplatesImpl().then(action).catch(function () { /* loader logs */ });
}

function openPromptTemplatesModal() {
  runPromptTemplatesAction(function (module: FeatureRuntime) { module.openPromptTemplatesModal(); });
}

function closePromptTemplatesModal() {
  if (_impl) _impl.closePromptTemplatesModal();
  else if (_implPromise) void _implPromise.then(function (module: FeatureRuntime) { module.closePromptTemplatesModal(); }).catch(() => undefined);
}

function renderPromptTemplatesModal() {
  runPromptTemplatesAction(function (module: FeatureRuntime) { module.renderPromptTemplatesModal(); });
}

function onPromptRowDelete(id: string) {
  runPromptTemplatesAction(function (module: FeatureRuntime) { module.onPromptRowDelete(id); });
}

function openPromptTemplateEditor(id?: string|undefined) {
  runPromptTemplatesAction(function (module: FeatureRuntime) { module.openPromptTemplateEditor(id); });
}

function onPromptTemplateEditorSave(id: string) {
  runPromptTemplatesAction(function (module: FeatureRuntime) { module.onPromptTemplateEditorSave(id); });
}

export {
  loadPromptTemplatesImpl,
  openPromptTemplatesModal, closePromptTemplatesModal, renderPromptTemplatesModal,
  onPromptRowDelete, openPromptTemplateEditor,
  onPromptTemplateEditorSave,
};
