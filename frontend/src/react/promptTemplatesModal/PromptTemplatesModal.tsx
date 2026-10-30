import { useRef, type MouseEvent, type ReactNode } from 'react';
import { Bug, CircleHelp, Code2, Languages, ListChecks, MessageCircleQuestion, Sparkles, X } from 'lucide-react';
import { createRootSlot } from '../lib/boot/ownedRoot';
import { Button } from '../ui/shadcn/button';
import { Input } from '../ui/shadcn/input';
import { Label } from '../ui/shadcn/label';
import { NativeSelect, NativeSelectOption } from '../ui/shadcn/native-select';
import { Textarea } from '../ui/shadcn/textarea';
import { FoundationDialog, FoundationDialogTitle } from '../dialog/FoundationDialog';
import { i18n } from '../legacy/gateway.ts';
import {
  closePromptTemplatesModal,
  onPromptRowDelete,
  onPromptTemplateEditorSave,
  openPromptTemplateEditor,
  renderPromptTemplatesModal,
} from '../../ui/promptTemplates.ts';
import {
  installPromptTemplatesBridge,
  usePromptTemplatesDispatch,
  usePromptTemplatesSnapshot,
} from './promptTemplates.bridge';
import type { PromptTemplateData } from './types';

function PromptIcon({ template }: { template: PromptTemplateData }) {
  const icons: Record<string, ReactNode> = {
    'tpl-summarize': <ListChecks aria-hidden="true" />,
    'tpl-translate': <Languages aria-hidden="true" />,
    'tpl-explain-code': <Code2 aria-hidden="true" />,
    'tpl-debug': <Bug aria-hidden="true" />,
    'tpl-quiz': <CircleHelp aria-hidden="true" />,
    'tpl-socratic': <MessageCircleQuestion aria-hidden="true" />,
  };
  return <span className="prompt-row-icon">{icons[template.id] || (template.isBuiltin ? <Sparkles aria-hidden="true" /> : template.icon || 'pg')}</span>;
}

function PromptRow({ template, editable }: { template: PromptTemplateData; editable: boolean }) {
  return (
    <div className={`prompt-row${template.isBuiltin ? ' builtin' : ''}`}>
      <PromptIcon template={template} />
      <div className="prompt-row-main">
        <div className="prompt-row-title">
          {template.title} <span className="prompt-row-shortcut">{template.shortcut}</span>
        </div>
        <div className="prompt-row-desc">{template.description || ''}</div>
      </div>
      {editable && (
        <div className="prompt-row-actions">
          <Button variant="outline" size="xs" className="prompt-row-edit" data-prompt-command="edit" data-template-id={template.id}>Edit</Button>
          <Button variant="destructive" size="xs" className="prompt-row-delete" data-prompt-command="delete" data-template-id={template.id}>Delete</Button>
        </div>
      )}
    </div>
  );
}

function PromptTemplateList({ builtins, customs }: { builtins: PromptTemplateData[]; customs: PromptTemplateData[] }) {
  return (
    <>
      <div className="modal-head">
        <FoundationDialogTitle className="modal-title">Skills &amp; shortcuts</FoundationDialogTitle>
        <Button variant="ghost" size="icon-sm" className="prompt-modal-close" data-prompt-command="close" aria-label="Close" title="Close">
          <X aria-hidden="true" />
        </Button>
      </div>
      <div className="prompt-templates-body">
        <p className="prompt-templates-intro">Use a skill for a focused workflow, or create one with your own instructions and <code>/shortcut</code>.</p>
        <div className="prompt-templates-section-label">Built-in skills ({builtins.length})</div>
        {builtins.map((template) => <PromptRow key={template.id} template={template} editable={false} />)}
        <div className="prompt-templates-section-label prompt-templates-custom-label">Your skills ({customs.length})</div>
        {customs.length
          ? customs.map((template) => <PromptRow key={template.id} template={template} editable />)
          : <div className="prompt-templates-empty">No custom skills yet.</div>}
        <Button variant="outline" size="sm" className="prompt-templates-new" data-prompt-command="create">
          <Sparkles aria-hidden="true" /> Create skill
        </Button>
      </div>
    </>
  );
}

function PromptTemplateEditor({ template, existing }: { template: PromptTemplateData; existing: boolean }) {
  const categories = ['writing', 'code', 'learning', 'analysis', 'creative', 'other'];
  return (
    <>
      <div className="modal-head">
        <FoundationDialogTitle className="modal-title">{existing ? 'Edit skill' : 'Create skill'}</FoundationDialogTitle>
        <Button variant="ghost" size="icon-sm" className="prompt-modal-close" data-prompt-command="list" aria-label="Back to skills" title="Back to skills">
          <X aria-hidden="true" />
        </Button>
      </div>
      <div className="prompt-templates-body prompt-editor" key={template.id}>
        <div className="prompt-editor-grid">
          <Label className="prompt-editor-label" htmlFor="ptTitle">Title
            <Input className="prompt-editor-input" id="ptTitle" maxLength={80} defaultValue={template.title} placeholder={i18n('prompt.placeholderTitle', 'Title')} />
          </Label>
          <Label className="prompt-editor-label" htmlFor="ptShortcut">Shortcut
            <Input className="prompt-editor-input prompt-editor-shortcut" id="ptShortcut" maxLength={20} pattern="^/[a-z0-9-]+$" defaultValue={template.shortcut} placeholder={i18n('prompt.placeholderShortcut', '/my-skill')} />
          </Label>
        </div>
        <Label className="prompt-editor-label" htmlFor="ptDescription">Description
          <Input className="prompt-editor-input" id="ptDescription" maxLength={200} defaultValue={template.description || ''} placeholder={i18n('prompt.placeholderDesc', 'What this skill does')} />
        </Label>
        <div className="prompt-editor-grid">
          <Label className="prompt-editor-label" htmlFor="ptIcon">Icon
            <Input className="prompt-editor-input prompt-editor-icon" id="ptIcon" maxLength={4} defaultValue={template.icon || 'pg'} />
          </Label>
          <Label className="prompt-editor-label" htmlFor="ptCategory">Category
            <NativeSelect className="prompt-editor-input" id="ptCategory" defaultValue={template.category || 'other'}>
              {categories.map((category) => <NativeSelectOption key={category} value={category}>{category}</NativeSelectOption>)}
            </NativeSelect>
          </Label>
        </div>
        <Label className="prompt-editor-label" htmlFor="ptBody">Body
          <Textarea className="prompt-editor-textarea" id="ptBody" rows={4} defaultValue={template.body || ''} placeholder={i18n('prompt.placeholderBody', 'Template instructions')} />
        </Label>
        <Label className="prompt-editor-label" htmlFor="ptSystemPrompt">System prompt
          <Textarea className="prompt-editor-textarea" id="ptSystemPrompt" rows={6} defaultValue={template.systemPrompt || ''} placeholder={i18n('prompt.placeholderSystem', 'System prompt')} />
        </Label>
      </div>
      <div className="modal-foot">
        <div className="modal-spacer" />
        <Button variant="outline" size="sm" className="prompt-modal-cancel" data-prompt-command="list">Cancel</Button>
        <Button size="sm" className="prompt-modal-save" data-prompt-command="save" data-template-id={template.id}>Save</Button>
      </div>
    </>
  );
}

function PromptTemplatesModal(): ReactNode {
  const snap = usePromptTemplatesSnapshot();
  const dispatch = usePromptTemplatesDispatch();
  const lastSnap = useRef(snap);
  if (snap.open) lastSnap.current = snap;
  const content = snap.open ? snap : lastSnap.current;

  const handleCommand = (event: MouseEvent) => {
    const button = (event.target as HTMLElement).closest<HTMLElement>('[data-prompt-command]');
    if (!button) return;
    const command = button.dataset.promptCommand;
    const id = button.dataset.templateId;
    if (command === 'close') closePromptTemplatesModal();
    else if (command === 'list') renderPromptTemplatesModal();
    else if (command === 'create') openPromptTemplateEditor();
    else if (command === 'edit') openPromptTemplateEditor(id);
    else if (command === 'delete' && id) onPromptRowDelete(id);
    else if (command === 'save' && id) onPromptTemplateEditorSave(id);
  };

  return (
    <FoundationDialog
      id="promptTemplatesOverlay"
      open={snap.open}
      onOpenChange={(open) => {
        if (!open) {
          closePromptTemplatesModal();
          dispatch.close();
        }
      }}
      overlayClassName="cmd-k-overlay"
      className="cmd-k-modal prompt-templates-modal"
    >
      <div style={{ display: 'contents' }} onClick={handleCommand}>
        {content.view === 'editor' && content.editor
          ? <PromptTemplateEditor key={content.editor.id} template={content.editor} existing={!!content.editor.title} />
          : <PromptTemplateList builtins={content.builtins} customs={content.customs} />}
      </div>
    </FoundationDialog>
  );
}

const rootSlot = createRootSlot('prompt-templates');

export function mountPromptTemplatesModal(): void {
  let container = document.getElementById('promptTemplatesReactRoot');
  if (!container) {
    container = document.createElement('div');
    container.id = 'promptTemplatesReactRoot';
    document.body.appendChild(container);
  }
  rootSlot.mount(container, <PromptTemplatesModal />, installPromptTemplatesBridge);
}

export function unmountPromptTemplatesModal(): void {
  rootSlot.destroy();
}
