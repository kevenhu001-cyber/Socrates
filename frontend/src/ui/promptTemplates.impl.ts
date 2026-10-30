import { deleteCustomTemplate, findTemplateByShortcut, loadPromptTemplates, upsertCustomTemplate, syncPromptTemplates } from '../chat/promptTemplates.ts';
import type { PromptTemplate } from '../chat/promptTemplates.ts';
import { showToast } from './toast.js';
import { showConfirm } from './confirm.js';
import { runtimeWindow as browserWindow } from "../types/runtimeWindow.ts";
import { reportSwallow as reportEmptyCatch } from '../util/reportSwallow.ts';
import { publishPromptTemplatesState, type PromptTemplateData } from './promptTemplatesState.ts';

/* ui/promptTemplates.ts — Wave 1d of main-js-split plan.
 * Prompt-templates modal: lists built-in and user templates, with edit and
 * delete actions. Extracted from main.js (post-Wave-1b): L9890-L10010.
 *
 * The module owns prompt-template actions and publishes its view data through
 * the shared state store. React owns the modal UI and subscribes to that store.
 * The only legacy global used here is `window.t` for translated confirmation
 * copy; a short timer focuses the editor after React has rendered it.
 */

let _ptOpen = false;
let _ptView: 'list' | 'editor' = 'list';
let _ptBuiltins: PromptTemplateData[] = [];
let _ptCustoms: PromptTemplateData[] = [];
let _ptEditor: PromptTemplateData | null = null;

function _publishPromptTemplatesState() {
  try {
    publishPromptTemplatesState({ open: _ptOpen, view: _ptView, builtins: _ptBuiltins, customs: _ptCustoms, editor: _ptEditor });
  } catch (error) {
    reportEmptyCatch(error, 'empty catch: ui/promptTemplates.impl.ts:37');
  }
}

function toPromptTemplateData(template: PromptTemplate): PromptTemplateData {
  return {
    id: template.id,
    title: template.title,
    description: template.description || '',
    icon: template.icon || 'pg',
    category: template.category || 'other',
    shortcut: template.shortcut,
    body: template.body || '',
    systemPrompt: template.systemPrompt || '',
    isBuiltin: template.isBuiltin === true,
  };
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
  const all = loadPromptTemplates().map(toPromptTemplateData);
  _ptBuiltins = all.filter(function (t) { return t.isBuiltin; });
  _ptCustoms = all.filter(function (t) { return !t.isBuiltin; });
  _ptView = 'list';
  _ptEditor = null;
  _publishPromptTemplatesState();
}

function onPromptRowDelete(id: string) {
  showConfirm(browserWindow.t("confirm.deleteTemplate.title"), browserWindow.t("confirm.deleteTemplate.msg"), true).then(function (yes) {
    if (!yes) return;
    deleteCustomTemplate(id);
    renderPromptTemplatesModal();
  });
}

function openPromptTemplateEditor(id?: string) {
  let existing: PromptTemplateData | null = null;
  if (id) {
    const template = loadPromptTemplates().find((entry) => entry.id === id);
    existing = template ? toPromptTemplateData(template) : null;
  }
  const t = existing || { id: "tpl-" + Date.now().toString(36), title: "", description: "", body: "", systemPrompt: "", icon: "pg", category: "writing", shortcut: "/my-template", isBuiltin: false };
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

function onPromptTemplateEditorSave(id: string) {
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
