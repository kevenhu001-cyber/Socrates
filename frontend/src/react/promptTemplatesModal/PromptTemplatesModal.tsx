import { useRef, type ReactNode } from 'react';
import { createRootSlot } from '../lib/boot/ownedRoot';
import {
  FoundationDialog,
} from '../dialog/FoundationDialog';
import {
  closePromptTemplatesModal,
  onPromptRowDelete,
  onPromptTemplateEditorSave,
  openPromptTemplateEditor,
  renderPromptTemplatesModal,
} from '../../ui/promptTemplates.js';
import {
  installPromptTemplatesBridge,
  usePromptTemplatesDispatch,
  usePromptTemplatesSnapshot,
} from './promptTemplates.bridge';

function PromptTemplatesModal(): ReactNode {
  const snap = usePromptTemplatesSnapshot();
  const dispatch = usePromptTemplatesDispatch();
  const lastSnap = useRef(snap);
  if (snap.open) lastSnap.current = snap;
  const content = snap.open ? snap : lastSnap.current;

  const handleCommand = (event: React.MouseEvent) => {
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
      <div
        style={{ display: 'contents' }}
        onClick={(e: React.MouseEvent) => {
          handleCommand(e);
        }}
        dangerouslySetInnerHTML={{ __html: content.bodyHTML }}
      />
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
