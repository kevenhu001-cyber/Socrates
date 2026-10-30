import { deleteCustomTemplate, findTemplateByShortcut, loadPromptTemplates, upsertCustomTemplate, syncPromptTemplates } from '../chat/promptTemplates.ts';
import { showToast } from './toast.js';
import { showConfirm } from './confirm.js';
import { runtimeWindow as browserWindow } from "../types/runtimeWindow.ts";

/* ui/promptTemplates.ts — Wave 1d of main-js-split plan.
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
 *   - showToast, t (from i18n.ts)
 * React delegates commands from the published markup to these module APIs.
 */

let _ptOpen = false;
let _ptView = 'list';
let _ptBuiltins: unknown[] = [];
let _ptCustoms: unknown[] = [];
let _ptEditor: object | null = null;

function _publishPromptTemplatesState() {
  try {
    const bridge = browserWindow.__socratesPromptTemplatesBridge;
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
  syncPromptTemplates(true)!.then(function () {
    if (_ptOpen) renderPromptTemplatesModal();
  });
}

function closePromptTemplatesModal() {
  _ptOpen = false;
  _publishPromptTemplatesState();
}

function renderPromptTemplatesModal() {
  const all = loadPromptTemplates();
  _ptBuiltins = all.filter(function (t) { return t.isBuiltin; });
  _ptCustoms = all.filter(function (t) { return !t.isBuiltin; });
  _ptView = 'list';
  _ptEditor = null;
  _publishPromptTemplatesState();
}

function onPromptRowDelete(id: any) {
  showConfirm(browserWindow.t("confirm.deleteTemplate.title"), browserWindow.t("confirm.deleteTemplate.msg"), true).then(function (yes) {
    if (!yes) return;
    deleteCustomTemplate(id);
    renderPromptTemplatesModal();
  });
}

function openPromptTemplateEditor(id: any) {
  let existing = null;
  if (id) {
    existing = loadPromptTemplates().filter(function (t) { return t.id === id; })[0] || null;
  }
  const t = existing || { id: "tpl-" + Date.now().toString(36), title: "", description: "", body: "", systemPrompt: "", icon: "pg", category: "writing", shortcut: "/my-template" };
  _ptView = 'editor';
  _ptEditor = t;
  _publishPromptTemplatesState();
  /* React renders the published HTML asynchronously; wait a tick
     before focusing the title input. */
  setTimeout(function () {
    const title = document.getElementById("ptTitle");
    if (title) { title.focus(); (title as HTMLInputElement).select(); }
  }, 50);
}

function readPromptEditorValue(id: string, fallback = "") {
  return ((document.getElementById(id) || {}) as HTMLInputElement).value || fallback;
}

function onPromptTemplateEditorSave(id: any) {
  const title = readPromptEditorValue("ptTitle").trim();
  const shortcut = readPromptEditorValue("ptShortcut").trim();
  const description = readPromptEditorValue("ptDescription").trim();
  const icon = readPromptEditorValue("ptIcon", "pg").trim();
  const category = readPromptEditorValue("ptCategory", "other");
  const body = readPromptEditorValue("ptBody");
  const systemPrompt = readPromptEditorValue("ptSystemPrompt");
  if (!title) { showToast("Title is required"); return; }
  if (!/^\/[a-z0-9-]+$/.test(shortcut)) { showToast("Shortcut must look like /my-template"); return; }
  const existing = findTemplateByShortcut(shortcut);
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
