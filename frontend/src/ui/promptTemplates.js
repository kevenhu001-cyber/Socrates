/* ui/promptTemplates.js — Wave 1d of main-js-split plan.
 * Prompt-templates modal: lists built-in and user templates, with edit and
 * delete actions. Extracted from main.js (post-Wave-1b): L9890-L10010.
 *
 * Touches the following globals (read from window.*):
 *   - loadPromptTemplates, deleteCustomTemplate, findTemplateByShortcut, upsertCustomTemplate
 *   - esc (from render/helpers.js)
 *   - showConfirm (from ui/confirm.js — Wave 1a)
 *   - t (from i18n.js)
 *   - closePromptTemplatesModal (self-call)
 */

/* React migration bridge — publishes prompt templates modal body HTML. */
function _publishPromptTemplatesState() {
  try {
    var bridge = window.__socratesPromptTemplatesBridge;
    if (bridge && typeof bridge.publish === "function") {
      var body = document.querySelector("#promptTemplatesOverlay .prompt-templates-modal");
      bridge.publish({
        open: document.getElementById("promptTemplatesOverlay") && !document.getElementById("promptTemplatesOverlay").classList.contains("hidden"),
        bodyHTML: body ? body.innerHTML : "",
      });
    }
  } catch (_) { /* swallow */ }
}

function _reactOwnsPromptTemplates() {
  return !!(document.getElementById("promptTemplatesReactRoot") && document.getElementById("promptTemplatesReactRoot").dataset.reactMigrationRuntime === "prompt-templates");
}

function openPromptTemplatesModal() {
  if (_reactOwnsPromptTemplates()) {
    renderPromptTemplatesModal();
    document.getElementById("promptTemplatesOverlay").classList.remove("hidden");
    _publishPromptTemplatesState();
    return;
  }
  var overlay = document.getElementById("promptTemplatesOverlay");
  if (!overlay) {
    overlay = document.createElement("div");
    overlay.id = "promptTemplatesOverlay";
    overlay.className = "cmd-k-overlay hidden";
    overlay.onclick = function (ev) { if (ev.target === overlay) closePromptTemplatesModal(); };
    overlay.innerHTML = '<div class="cmd-k-modal prompt-templates-modal" onclick="event.stopPropagation()"></div>';
    document.body.appendChild(overlay);
  }
  overlay.classList.remove("hidden");
  renderPromptTemplatesModal();
}

function closePromptTemplatesModal() {
  if (_reactOwnsPromptTemplates()) {
    document.getElementById("promptTemplatesOverlay").classList.add("hidden");
    _publishPromptTemplatesState();
    return;
  }
  var overlay = document.getElementById("promptTemplatesOverlay");
  if (overlay) overlay.classList.add("hidden");
}

function renderPromptTemplatesModal() {
  var body = document.querySelector("#promptTemplatesOverlay .prompt-templates-modal");
  if (!body) return;
  var all = window.loadPromptTemplates();
  var customs = all.filter(function (t) { return !t.isBuiltin; });
  var builtins = all.filter(function (t) { return t.isBuiltin; });
  var html =
    '<div class="modal-head">' +
      '<span class="modal-title">Skills &amp; shortcuts</span>' +
      '<button class="modal-close" onclick="closePromptTemplatesModal()">×</button>' +
    '</div>' +
    '<div class="prompt-templates-body">' +
      '<p class="prompt-templates-intro">Use a skill for a focused workflow, or create one with your own instructions and <code>/shortcut</code>.</p>' +
      '<div class="prompt-templates-section-label">Built-in skills (' + builtins.length + ')</div>' +
      builtins.map(function (t) { return renderPromptRow(t, false); }).join("") +
      '<div class="prompt-templates-section-label" style="margin-top:14px">Your skills (' + customs.length + ')</div>' +
      (customs.length ? customs.map(function (t) { return renderPromptRow(t, true); }).join("") :
        '<div class="prompt-templates-empty">No custom skills yet.</div>') +
      '<button class="prompt-templates-new" onclick="openPromptTemplateEditor()">+ Create skill</button>' +
    '</div>';
  body.innerHTML = html;
  if (_reactOwnsPromptTemplates()) { _publishPromptTemplatesState(); }
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
      '<button class="prompt-row-edit" onclick="openPromptTemplateEditor(' + encodeURIComponent(JSON.stringify(t)) + ')">Edit</button>' +
        '<button class="prompt-row-delete" onclick="onPromptRowDelete(\'' + window.esc(t.id) + '\')">Delete</button>' +
      '</div>' : '') +
  '</div>';
}

function onPromptRowDelete(id) {
  window.showConfirm("Delete template?", "This removes your custom template. Built-ins stay.", true).then(function (yes) {
    if (!yes) return;
    window.deleteCustomTemplate(id);
    renderPromptTemplatesModal();
  });
}

function openPromptTemplateEditor(existing) {
  var body = document.querySelector("#promptTemplatesOverlay .prompt-templates-modal");
  if (!body) return;
  var t = existing || { id: "tpl-" + Date.now().toString(36), title: "", description: "", body: "", systemPrompt: "", icon: "pg", category: "writing", shortcut: "/my-template" };
  body.innerHTML =
    '<div class="modal-head">' +
      '<span class="modal-title">' + (existing ? "Edit skill" : "Create skill") + '</span>' +
      '<button class="modal-close" onclick="renderPromptTemplatesModal()">×</button>' +
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
      '<button class="modal-cancel" onclick="renderPromptTemplatesModal()">Cancel</button>' +
      '<button class="modal-save" onclick="onPromptTemplateEditorSave(\'' + window.esc(t.id) + '\',' + (existing ? '1' : '0') + ')">Save</button>' +
    '</div>';
  if (_reactOwnsPromptTemplates()) { _publishPromptTemplatesState(); }
  var title = document.getElementById("ptTitle");
  if (title) { setTimeout(function () { title.focus(); title.select(); }, 0); }
}

function onPromptTemplateEditorSave(id, wasExisting) {
  var title = ((document.getElementById("ptTitle") || {}).value || "").trim();
  var shortcut = ((document.getElementById("ptShortcut") || {}).value || "").trim();
  var description = ((document.getElementById("ptDescription") || {}).value || "").trim();
  var icon = ((document.getElementById("ptIcon") || {}).value || "pg").trim();
  var category = ((document.getElementById("ptCategory") || {}).value || "other");
  var body = ((document.getElementById("ptBody") || {}).value || "");
  var systemPrompt = ((document.getElementById("ptSystemPrompt") || {}).value || "");
  if (!title) { window.showToast("Title is required"); return; }
  if (!/^\/[a-z0-9-]+$/.test(shortcut)) { window.showToast("Shortcut must look like /my-template"); return; }
  var existing = window.findTemplateByShortcut(shortcut);
  if (existing && existing.id !== id) { window.showToast("That shortcut is already in use"); return; }
  window.upsertCustomTemplate({ id: id, title: title, description: description, icon: icon || "pg", category: category, shortcut: shortcut, body: body, systemPrompt: systemPrompt, isBuiltin: false });
  renderPromptTemplatesModal();
  window.showToast("Skill saved");
}

export {
  openPromptTemplatesModal, closePromptTemplatesModal, renderPromptTemplatesModal,
  renderPromptRow, onPromptRowDelete, openPromptTemplateEditor,
  onPromptTemplateEditorSave,
};
