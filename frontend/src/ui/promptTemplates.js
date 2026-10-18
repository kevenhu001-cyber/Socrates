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
    _implPromise = import('./promptTemplates.impl.js')
      .then(function (module) { _impl = module; return module; })
      .catch(function (error) {
        _implPromise = null;
        console.error('[prompt-templates] failed to load feature runtime', error);
        throw error;
      });
  }
  return _implPromise;
}

function openPromptTemplatesModal() {
  return loadPromptTemplatesImpl().then(function (module) { return module.openPromptTemplatesModal(); });
}

function closePromptTemplatesModal() {
  if (_impl) return _impl.closePromptTemplatesModal();
  if (_implPromise) return _implPromise.then(function (module) { return module.closePromptTemplatesModal(); });
}

function renderPromptTemplatesModal() {
  return loadPromptTemplatesImpl().then(function (module) { return module.renderPromptTemplatesModal(); });
}

function renderPromptRow(template, editable) {
  return loadPromptTemplatesImpl().then(function (module) { return module.renderPromptRow(template, editable); });
}

function onPromptRowDelete(id) {
  return loadPromptTemplatesImpl().then(function (module) { return module.onPromptRowDelete(id); });
}

function openPromptTemplateEditor(id) {
  return loadPromptTemplatesImpl().then(function (module) { return module.openPromptTemplateEditor(id); });
}

function onPromptTemplateEditorSave(id) {
  return loadPromptTemplatesImpl().then(function (module) { return module.onPromptTemplateEditorSave(id); });
}

export {
  loadPromptTemplatesImpl,
  openPromptTemplatesModal, closePromptTemplatesModal, renderPromptTemplatesModal,
  renderPromptRow, onPromptRowDelete, openPromptTemplateEditor,
  onPromptTemplateEditorSave,
};
