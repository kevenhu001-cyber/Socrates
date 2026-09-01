import { createRoot, type Root } from 'react-dom/client';
import React from 'react';
import {
  closePromptTemplatesModal,
  onPromptRowDelete,
  onPromptTemplateEditorSave,
  openPromptTemplateEditor,
  renderPromptTemplatesModal,
} from '../../ui/promptTemplates.js';
import { installPromptTemplatesBridge, usePromptTemplatesSnapshot, usePromptTemplatesDispatch } from './promptTemplates.bridge';

function PromptTemplatesModal() {
  const snap = usePromptTemplatesSnapshot();
  const dispatch = usePromptTemplatesDispatch();
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

  if (!snap.open) return null;

  return React.createElement('div', {
    className: 'cmd-k-overlay',
    id: 'promptTemplatesOverlay',
    onClick: (e: React.MouseEvent) => { if (e.target === e.currentTarget) dispatch.close(); },
  },
    React.createElement('div', {
      className: 'prompt-templates-modal',
      onClick: (e: React.MouseEvent) => { e.stopPropagation(); handleCommand(e); },
      dangerouslySetInnerHTML: { __html: snap.bodyHTML },
    }),
  );
}

let root: Root | null = null;

export function mountPromptTemplatesModal(): void {
  installPromptTemplatesBridge();
  let container = document.getElementById('promptTemplatesReactRoot');
  if (!container) {
    container = document.createElement('div');
    container.id = 'promptTemplatesReactRoot';
    document.body.appendChild(container);
  }
  if (!root) root = createRoot(container);
  root.render(React.createElement(PromptTemplatesModal));
}

export function unmountPromptTemplatesModal(): void {
  if (root) { root.unmount(); root = null; }
}
