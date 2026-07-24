/* ui/promptTemplates.ts — Wave 1d of main-js-split plan.
 * Prompt-templates modal: lists built-in and user templates, with edit and
 * delete actions.
 */

/* React migration bridge — publishes prompt templates modal body HTML. */
function _publishPromptTemplatesState(): void {
  try {
    const bridge = (window as any).__socratesPromptTemplatesBridge;
    if (bridge && typeof bridge.publish === 'function') {
      const body = document.querySelector('#promptTemplatesOverlay .prompt-templates-modal') as HTMLElement | null;
      bridge.publish({
        open: document.getElementById('promptTemplatesOverlay') && !document.getElementById('promptTemplatesOverlay')!.classList.contains('hidden'),
        bodyHTML: body ? body.innerHTML : '',
      });
    }
  } catch (_) { /* swallow */ }
}

function _reactOwnsPromptTemplates(): boolean {
  const root = document.getElementById('promptTemplatesReactRoot');
  return !!(root && root.dataset.reactMigrationRuntime === 'prompt-templates');
}

interface PTemplate {
  id: string;
  title: string;
  shortcut: string;
  description?: string;
  icon?: string;
  isBuiltin?: boolean;
  category?: string;
  body?: string;
  systemPrompt?: string;
}

/* window globals accessed via (window as any).xxx — see windowExports */

function openPromptTemplatesModal(): void {
  if (_reactOwnsPromptTemplates()) {
    renderPromptTemplatesModal();
    document.getElementById('promptTemplatesOverlay')!.classList.remove('hidden');
    _publishPromptTemplatesState();
    return;
  }
  let overlay = document.getElementById('promptTemplatesOverlay') as HTMLElement | null;
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'promptTemplatesOverlay';
    overlay.className = 'cmd-k-overlay hidden';
    overlay.onclick = function (ev: MouseEvent) { if (ev.target === overlay) closePromptTemplatesModal(); };
    overlay.innerHTML = '<div class="cmd-k-modal prompt-templates-modal" onclick="event.stopPropagation()"></div>';
    document.body.appendChild(overlay);
  }
  overlay.classList.remove('hidden');
  renderPromptTemplatesModal();
}

function closePromptTemplatesModal(): void {
  if (_reactOwnsPromptTemplates()) {
    document.getElementById('promptTemplatesOverlay')!.classList.add('hidden');
    _publishPromptTemplatesState();
    return;
  }
  const overlay = document.getElementById('promptTemplatesOverlay');
  if (overlay) overlay.classList.add('hidden');
}

function renderPromptTemplatesModal(): void {
  const body = document.querySelector('#promptTemplatesOverlay .prompt-templates-modal') as HTMLElement | null;
  if (!body) return;
  const all = (window as any).loadPromptTemplates() as PTemplate[];
  const customs = all.filter(function (t: PTemplate) { return !t.isBuiltin; });
  const builtins = all.filter(function (t: PTemplate) { return t.isBuiltin; });
  const html =
    '<div class="modal-head">' +
      '<span class="modal-title">Skills &amp; shortcuts</span>' +
      '<button class="modal-close" onclick="closePromptTemplatesModal()">×</button>' +
    '</div>' +
    '<div class="prompt-templates-body">' +
      '<p class="prompt-templates-intro">Use a skill for a focused workflow, or create one with your own instructions and <code>/shortcut</code>.</p>' +
      '<div class="prompt-templates-section-label">Built-in skills (' + builtins.length + ')</div>' +
      builtins.map(function (t: PTemplate) { return renderPromptRow(t, false); }).join('') +
      '<div class="prompt-templates-section-label" style="margin-top:14px">Your skills (' + customs.length + ')</div>' +
      (customs.length ? customs.map(function (t: PTemplate) { return renderPromptRow(t, true); }).join('') :
        '<div class="prompt-templates-empty">No custom skills yet.</div>') +
      '<button class="prompt-templates-new" onclick="openPromptTemplateEditor()">+ Create skill</button>' +
    '</div>';
  body.innerHTML = html;
  if (_reactOwnsPromptTemplates()) { _publishPromptTemplatesState(); }
}

function renderPromptRow(t: PTemplate, editable: boolean): string {
  const iconHtml = t.icon && t.icon.indexOf('<svg') === 0 ? t.icon : ((window as any).esc(t.icon || 'pg'));
  return '<div class="prompt-row' + (t.isBuiltin ? ' builtin' : '') + '">' +
    '<span class="prompt-row-icon">' + iconHtml + '</span>' +
    '<div class="prompt-row-main">' +
      '<div class="prompt-row-title">' + (window as any).esc(t.title) + ' <span class="prompt-row-shortcut">' + (window as any).esc(t.shortcut) + '</span></div>' +
      '<div class="prompt-row-desc">' + (window as any).esc(t.description || '') + '</div>' +
    '</div>' +
    (editable ?
      '<div class="prompt-row-actions">' +
      '<button class="prompt-row-edit" onclick="openPromptTemplateEditor(' + encodeURIComponent(JSON.stringify(t)) + ')">Edit</button>' +
        '<button class="prompt-row-delete" onclick="onPromptRowDelete(\'' + (window as any).esc(t.id) + '\')">Delete</button>' +
      '</div>' : '') +
  '</div>';
}

function onPromptRowDelete(id: string): void {
  (window as any).showConfirm('Delete template?', 'This removes your custom template. Built-ins stay.', true).then(function (yes: boolean) {
    if (!yes) return;
    (window as any).deleteCustomTemplate(id);
    renderPromptTemplatesModal();
  });
}

function openPromptTemplateEditor(existing?: PTemplate): void {
  const body = document.querySelector('#promptTemplatesOverlay .prompt-templates-modal') as HTMLElement | null;
  if (!body) return;
  const t = existing || { id: 'tpl-' + Date.now().toString(36), title: '', description: '', body: '', systemPrompt: '', icon: 'pg', category: 'writing', shortcut: '/my-template' };
  body.innerHTML =
    '<div class="modal-head">' +
      '<span class="modal-title">' + (existing ? 'Edit skill' : 'Create skill') + '</span>' +
      '<button class="modal-close" onclick="renderPromptTemplatesModal()">×</button>' +
    '</div>' +
    '<div class="prompt-templates-body">' +
      '<div class="prompt-editor-grid">' +
        '<label class="prompt-editor-label">Title<input class="prompt-editor-input" id="ptTitle" maxlength="80" value="' + (window as any).esc(t.title) + '" placeholder="' + (window as any).t('prompt.placeholderTitle') + '"></label>' +
        '<label class="prompt-editor-label">Shortcut<input class="prompt-editor-input prompt-editor-shortcut" id="ptShortcut" maxlength="20" pattern="^/[a-z0-9-]+$" value="' + (window as any).esc(t.shortcut) + '" placeholder="' + (window as any).t('prompt.placeholderShortcut') + '"></label>' +
      '</div>' +
      '<label class="prompt-editor-label">Description<input class="prompt-editor-input" id="ptDescription" maxlength="200" value="' + (window as any).esc(t.description || '') + '" placeholder="' + (window as any).t('prompt.placeholderDesc') + '"></label>' +
      '<div class="prompt-editor-grid">' +
        '<label class="prompt-editor-label">Icon<input class="prompt-editor-input prompt-editor-icon" id="ptIcon" maxlength="4" value="' + (window as any).esc(t.icon || 'pg') + '"></label>' +
        '<label class="prompt-editor-label">Category' +
          '<select class="prompt-editor-input" id="ptCategory">' +
            ['writing', 'code', 'learning', 'analysis', 'creative', 'other'].map(function (c) {
              return '<option value="' + c + '" ' + (t.category === c ? 'selected' : '') + '>' + c + '</option>';
            }).join('') +
          '</select>' +
        '</label>' +
      '</div>' +
      '<label class="prompt-editor-label">Body<textarea class="prompt-editor-textarea" id="ptBody" rows="4" placeholder="' + (window as any).t('prompt.placeholderBody') + '">' + (window as any).esc(t.body || '') + '</textarea></label>' +
      '<label class="prompt-editor-label">System prompt<textarea class="prompt-editor-textarea" id="ptSystemPrompt" rows="6" placeholder="' + (window as any).t('prompt.placeholderSystem') + '">' + (window as any).esc(t.systemPrompt || '') + '</textarea></label>' +
    '</div>' +
    '<div class="modal-foot">' +
      '<div class="modal-spacer"></div>' +
      '<button class="modal-cancel" onclick="renderPromptTemplatesModal()">Cancel</button>' +
      '<button class="modal-save" onclick="onPromptTemplateEditorSave(\'' + (window as any).esc(t.id) + '\',' + (existing ? '1' : '0') + ')">Save</button>' +
    '</div>';
  if (_reactOwnsPromptTemplates()) { _publishPromptTemplatesState(); }
  const title = document.getElementById('ptTitle') as HTMLInputElement | null;
  if (title) { setTimeout(function () { title.focus(); title.select(); }, 0); }
}

function onPromptTemplateEditorSave(id: string, wasExisting: number): void {
  const title = ((document.getElementById('ptTitle') as HTMLInputElement | null) || {}).value || '';
  const shortcut = ((document.getElementById('ptShortcut') as HTMLInputElement | null) || {}).value || '';
  const description = ((document.getElementById('ptDescription') as HTMLInputElement | null) || {}).value || '';
  const icon = ((document.getElementById('ptIcon') as HTMLInputElement | null) || {}).value || 'pg';
  const category = ((document.getElementById('ptCategory') as HTMLSelectElement | null) || {}).value || 'other';
  const body = ((document.getElementById('ptBody') as HTMLTextAreaElement | null) || {}).value || '';
  const systemPrompt = ((document.getElementById('ptSystemPrompt') as HTMLTextAreaElement | null) || {}).value || '';
  if (!title.trim()) { (window as any).showToast('Title is required'); return; }
  if (!/^\/[a-z0-9-]+$/.test(shortcut.trim())) { (window as any).showToast('Shortcut must look like /my-template'); return; }
  const existing = (window as any).findTemplateByShortcut(shortcut.trim());
  if (existing && existing.id !== id) { (window as any).showToast('That shortcut is already in use'); return; }
  (window as any).upsertCustomTemplate({ id, title: title.trim(), description: description.trim(), icon: icon.trim() || 'pg', category, shortcut: shortcut.trim(), body, systemPrompt, isBuiltin: false });
  renderPromptTemplatesModal();
  (window as any).showToast('Skill saved');
}

export {
  openPromptTemplatesModal, closePromptTemplatesModal, renderPromptTemplatesModal,
  renderPromptRow, onPromptRowDelete, openPromptTemplateEditor,
  onPromptTemplateEditorSave,
};
