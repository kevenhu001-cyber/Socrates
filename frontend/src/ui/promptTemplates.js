import { deleteCustomTemplate, findTemplateByShortcut, loadPromptTemplates, upsertCustomTemplate } from '../chat/promptTemplates.js';
import { showToast } from './toast.js';
/* ui/promptTemplates.js — Wave 1d of main-js-split plan.
 * Prompt-templates modal: lists built-in and user templates, with edit and
 * delete actions. Extracted from main.js (post-Wave-1b): L9890-L10010.
 *
 * Under the always-on React runtime the overlay DOM
 * (#promptTemplatesOverlay) exists only while the React modal is open, so
 * this module never touches that DOM directly. It keeps the open flag and
 * body HTML as module state and publishes them through
 * window.__socratesPromptTemplatesBridge; React renders the result via
 * dangerouslySetInnerHTML.
 *
 * Touches the following globals (read from window.*):
 *   - loadPromptTemplates, deleteCustomTemplate, findTemplateByShortcut, upsertCustomTemplate
 *   - esc (from render/helpers.js)
 *   - showConfirm (from ui/confirm.js — Wave 1a)
 *   - showToast, t (from i18n.js)
 * React delegates commands from the published markup to these module APIs.
 */

var _ptOpen = false;
var _ptBodyHTML = "";

function _publishPromptTemplatesState() {
  try {
    var bridge = window.__socratesPromptTemplatesBridge;
    if (bridge && typeof bridge.publish === "function") {
      bridge.publish({ open: _ptOpen, bodyHTML: _ptBodyHTML });
    }
  } catch (_) { /* swallow */ }
}

function openPromptTemplatesModal() {
  _ptOpen = true;
  renderPromptTemplatesModal();
}

function closePromptTemplatesModal() {
  _ptOpen = false;
  _publishPromptTemplatesState();
}

function renderPromptTemplatesModal() {
  var all = loadPromptTemplates();
  var customs = all.filter(function (t) { return !t.isBuiltin; });
  var builtins = all.filter(function (t) { return t.isBuiltin; });
  _ptBodyHTML =
    '<div class="modal-head">' +
      '<span class="modal-title">Skills &amp; shortcuts</span>' +
      '<button class="modal-close" data-prompt-command="close">×</button>' +
    '</div>' +
    '<div class="prompt-templates-body">' +
      '<p class="prompt-templates-intro">Use a skill for a focused workflow, or create one with your own instructions and <code>/shortcut</code>.</p>' +
      '<div class="prompt-templates-section-label">Built-in skills (' + builtins.length + ')</div>' +
      builtins.map(function (t) { return renderPromptRow(t, false); }).join("") +
      '<div class="prompt-templates-section-label" style="margin-top:14px">Your skills (' + customs.length + ')</div>' +
      (customs.length ? customs.map(function (t) { return renderPromptRow(t, true); }).join("") :
        '<div class="prompt-templates-empty">No custom skills yet.</div>') +
      '<button class="prompt-templates-new" data-prompt-command="create">+ Create skill</button>' +
    '</div>';
  _publishPromptTemplatesState();
}

function renderPromptRow(t, editable) {
  var iconHtml = t.icon && t.icon.indexOf("<svg") === 0 ? t.icon : window.esc(t.icon || "pg");
  return '<div class="prompt-row' + (t.isBuiltin ? " builtin" : "") + '">' +
    '<span class="prompt-row-icon">' + iconHtml + '</span>' +
    '<div class="prompt-row-main">' +
      '<div class="prompt-row-title">' + window.esc(t.title) + ' <span class="prompt-row-shortcut">' + window.esc(t.shortcut) + '</span></div>' +
      '<div class="prompt-row-desc">' + window.esc(t.description || "") + '</div>' +
    '</div>' +
    (editable ?
      '<div class="prompt-row-actions">' +
        '<button class="prompt-row-edit" data-prompt-command="edit" data-template-id="' + window.esc(t.id) + '">Edit</button>' +
        '<button class="prompt-row-delete" data-prompt-command="delete" data-template-id="' + window.esc(t.id) + '">Delete</button>' +
      '</div>' : '') +
  '</div>';
}

function onPromptRowDelete(id) {
  window.showConfirm(window.t("confirm.deleteTemplate.title"), window.t("confirm.deleteTemplate.msg"), true).then(function (yes) {
    if (!yes) return;
    deleteCustomTemplate(id);
    renderPromptTemplatesModal();
  });
}

function openPromptTemplateEditor(id) {
  var existing = null;
  if (id) {
    existing = loadPromptTemplates().filter(function (t) { return t.id === id; })[0] || null;
  }
  var t = existing || { id: "tpl-" + Date.now().toString(36), title: "", description: "", body: "", systemPrompt: "", icon: "pg", category: "writing", shortcut: "/my-template" };
  _ptBodyHTML =
    '<div class="modal-head">' +
      '<span class="modal-title">' + (existing ? "Edit skill" : "Create skill") + '</span>' +
      '<button class="modal-close" data-prompt-command="list">×</button>' +
    '</div>' +
    '<div class="prompt-templates-body">' +
      '<div class="prompt-editor-grid">' +
        '<label class="prompt-editor-label">Title<input class="prompt-editor-input" id="ptTitle" maxlength="80" value="' + window.esc(t.title) + '" placeholder="' + window.t("prompt.placeholderTitle") + '"></label>' +
        '<label class="prompt-editor-label">Shortcut<input class="prompt-editor-input prompt-editor-shortcut" id="ptShortcut" maxlength="20" pattern="^/[a-z0-9-]+$" value="' + window.esc(t.shortcut) + '" placeholder="' + window.t("prompt.placeholderShortcut") + '"></label>' +
      '</div>' +
      '<label class="prompt-editor-label">Description<input class="prompt-editor-input" id="ptDescription" maxlength="200" value="' + window.esc(t.description || "") + '" placeholder="' + window.t("prompt.placeholderDesc") + '"></label>' +
      '<div class="prompt-editor-grid">' +
        '<label class="prompt-editor-label">Icon<input class="prompt-editor-input prompt-editor-icon" id="ptIcon" maxlength="4" value="' + window.esc(t.icon || "pg") + '"></label>' +
        '<label class="prompt-editor-label">Category' +
          '<select class="prompt-editor-input" id="ptCategory">' +
            ["writing", "code", "learning", "analysis", "creative", "other"].map(function (c) {
              return '<option value="' + c + '" ' + (t.category === c ? "selected" : "") + '>' + c + '</option>';
            }).join("") +
          '</select>' +
        '</label>' +
      '</div>' +
      '<label class="prompt-editor-label">Body<textarea class="prompt-editor-textarea" id="ptBody" rows="4" placeholder="' + window.t("prompt.placeholderBody") + '">' + window.esc(t.body || "") + '</textarea></label>' +
      '<label class="prompt-editor-label">System prompt<textarea class="prompt-editor-textarea" id="ptSystemPrompt" rows="6" placeholder="' + window.t("prompt.placeholderSystem") + '">' + window.esc(t.systemPrompt || "") + '</textarea></label>' +
    '</div>' +
    '<div class="modal-foot">' +
      '<div class="modal-spacer"></div>' +
      '<button class="modal-cancel" data-prompt-command="list">Cancel</button>' +
      '<button class="modal-save" data-prompt-command="save" data-template-id="' + window.esc(t.id) + '">Save</button>' +
    '</div>';
  _publishPromptTemplatesState();
  /* React renders the published HTML asynchronously; wait a tick
     before focusing the title input. */
  setTimeout(function () {
    var title = document.getElementById("ptTitle");
    if (title) { title.focus(); title.select(); }
  }, 50);
}

function onPromptTemplateEditorSave(id) {
  var title = ((document.getElementById("ptTitle") || {}).value || "").trim();
  var shortcut = ((document.getElementById("ptShortcut") || {}).value || "").trim();
  var description = ((document.getElementById("ptDescription") || {}).value || "").trim();
  var icon = ((document.getElementById("ptIcon") || {}).value || "pg").trim();
  var category = ((document.getElementById("ptCategory") || {}).value || "other");
  var body = ((document.getElementById("ptBody") || {}).value || "");
  var systemPrompt = ((document.getElementById("ptSystemPrompt") || {}).value || "");
  if (!title) { showToast("Title is required"); return; }
  if (!/^\/[a-z0-9-]+$/.test(shortcut)) { showToast("Shortcut must look like /my-template"); return; }
  var existing = findTemplateByShortcut(shortcut);
  if (existing && existing.id !== id) { showToast("That shortcut is already in use"); return; }
  upsertCustomTemplate({ id: id, title: title, description: description, icon: icon || "pg", category: category, shortcut: shortcut, body: body, systemPrompt: systemPrompt, isBuiltin: false });
  renderPromptTemplatesModal();
  showToast("Skill saved");
}

export {
  openPromptTemplatesModal, closePromptTemplatesModal, renderPromptTemplatesModal,
  renderPromptRow, onPromptRowDelete, openPromptTemplateEditor,
  onPromptTemplateEditorSave,
};
