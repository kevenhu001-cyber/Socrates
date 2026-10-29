import { deleteCustomTemplate, findTemplateByShortcut, loadPromptTemplates, upsertCustomTemplate, syncPromptTemplates } from '../chat/promptTemplates.js';
import { showToast } from './toast.js';
import { showConfirm } from './confirm.js';
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
var _ptView = 'list';
var _ptBuiltins = [];
var _ptCustoms = [];
var _ptEditor = null;

function _publishPromptTemplatesState() {
  try {
    var bridge = window.__socratesPromptTemplatesBridge;
    if (bridge && typeof bridge.publish === "function") {
      bridge.publish({ open: _ptOpen, view: _ptView, builtins: _ptBuiltins, customs: _ptCustoms, editor: _ptEditor });
    }
  } catch (_) { /* swallow */ }
}

function openPromptTemplatesModal() {
  _ptOpen = true;
  renderPromptTemplatesModal();
  /* Pull the account-level copy; re-render once the merge lands so rows
     synced from other devices appear without reopening the modal. */
  syncPromptTemplates(true).then(function () {
    if (_ptOpen) renderPromptTemplatesModal();
  });
}

function closePromptTemplatesModal() {
  _ptOpen = false;
  _publishPromptTemplatesState();
}

function renderPromptTemplatesModal() {
  var all = loadPromptTemplates();
  _ptBuiltins = all.filter(function (t) { return t.isBuiltin; });
  _ptCustoms = all.filter(function (t) { return !t.isBuiltin; });
  _ptView = 'list';
  _ptEditor = null;
  _publishPromptTemplatesState();
}

function onPromptRowDelete(id) {
  showConfirm(window.t("confirm.deleteTemplate.title"), window.t("confirm.deleteTemplate.msg"), true).then(function (yes) {
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
  _ptView = 'editor';
  _ptEditor = t;
  _publishPromptTemplatesState();
  /* React renders the published HTML asynchronously; wait a tick
     before focusing the title input. */
  setTimeout(function () {
    var title = document.getElementById("ptTitle");
    if (title) { title.focus(); title.select(); }
  }, 50);
}

function readPromptEditorValue(id, fallback = "") {
  return (document.getElementById(id) || {}).value || fallback;
}

function onPromptTemplateEditorSave(id) {
  var title = readPromptEditorValue("ptTitle").trim();
  var shortcut = readPromptEditorValue("ptShortcut").trim();
  var description = readPromptEditorValue("ptDescription").trim();
  var icon = readPromptEditorValue("ptIcon", "pg").trim();
  var category = readPromptEditorValue("ptCategory", "other");
  var body = readPromptEditorValue("ptBody");
  var systemPrompt = readPromptEditorValue("ptSystemPrompt");
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
  onPromptRowDelete, openPromptTemplateEditor,
  onPromptTemplateEditorSave,
};
