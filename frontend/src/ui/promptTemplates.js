/* Lightweight facade for the Skills / prompt-templates surface.
 *
 * The implementation pulls template persistence, confirm/toast UI and the
 * editor renderer. None of that is needed until the user opens Skills, so
 * preserve this stable import path while deferring the feature runtime.
 */
let _implPromise = null;
let _impl = null;

function loadPromptTemplatesImpl() {
  if (_impl) return Promise.resolve(_impl);
  if (!_implPromise) {
    _implPromise = import('./promptTemplates.impl.mjs')
      .then(function (module) { _impl = module; return module; })
      .catch(function (error) {
        _implPromise = null;
        console.error('[prompt-templates] failed to load feature runtime', error);
        throw error;
      });
  }
  return _implPromise;
}

function runPromptTemplatesAction(action) {
  void loadPromptTemplatesImpl().then(action).catch(function () { /* loader logs */ });
}

function openPromptTemplatesModal() {
  runPromptTemplatesAction(function (module) { module.openPromptTemplatesModal(); });
}

function closePromptTemplatesModal() {
  if (_impl) _impl.closePromptTemplatesModal();
  else if (_implPromise) void _implPromise.then(function (module) { module.closePromptTemplatesModal(); }).catch(() => undefined);
}

function renderPromptTemplatesModal() {
  runPromptTemplatesAction(function (module) { module.renderPromptTemplatesModal(); });
}

/* Kept only for legacy compatibility. First-party rendering happens inside
   the implementation module, so callers should not depend on this helper
   synchronously before the feature has loaded. */
function renderPromptRow(template, editable) {
  return loadPromptTemplatesImpl().then(function (module) { return module.renderPromptRow(template, editable); });
}

function onPromptRowDelete(id) {
  runPromptTemplatesAction(function (module) { module.onPromptRowDelete(id); });
}

function openPromptTemplateEditor(id) {
  runPromptTemplatesAction(function (module) { module.openPromptTemplateEditor(id); });
}

function onPromptTemplateEditorSave(id) {
  runPromptTemplatesAction(function (module) { module.onPromptTemplateEditorSave(id); });
}

export {
  loadPromptTemplatesImpl,
  openPromptTemplatesModal, closePromptTemplatesModal, renderPromptTemplatesModal,
  renderPromptRow, onPromptRowDelete, openPromptTemplateEditor,
  onPromptTemplateEditorSave,
};
