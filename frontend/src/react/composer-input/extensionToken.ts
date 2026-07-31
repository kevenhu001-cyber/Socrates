import { Node, mergeAttributes } from '@tiptap/core';
import DOMPurify from 'dompurify';

import type { ComposerExtensionToken } from './types';

export interface ExtensionTokenOptions {
  onRemove: (key: string) => void;
}

function safeIconMarkup(icon: string): string {
  return DOMPurify.sanitize(icon || '', {
    USE_PROFILES: { svg: true },
  });
}

/**
 * A leaf node keeps workflow state visible in the text flow without leaking
 * the visual token into the markdown request body.
 */
export const ExtensionToken = Node.create<ExtensionTokenOptions>({
  name: 'extensionToken',
  group: 'inline',
  inline: true,
  atom: true,
  selectable: false,
  addOptions() {
    return {
      onRemove: () => undefined,
    };
  },
  addAttributes() {
    return {
      key: { default: '' },
      title: { default: '' },
      icon: { default: '' },
      hint: { default: '' },
    };
  },
  parseHTML() {
    return [{ tag: 'span[data-composer-extension-token]' }];
  },
  renderHTML({ HTMLAttributes }) {
    return [
      'span',
      mergeAttributes(HTMLAttributes, {
        'data-composer-extension-token': 'true',
        class: 'composer-extension-token',
      }),
      HTMLAttributes.title || '',
    ];
  },
  renderMarkdown() {
    return '';
  },
  addNodeView() {
    return ({ node }) => {
      const attrs = node.attrs as ComposerExtensionToken;
      const dom = document.createElement('span');
      dom.className = 'composer-extension-inline';
      dom.contentEditable = 'false';
      dom.dataset.composerExtensionToken = 'true';
      dom.dataset.extensionKey = attrs.key;
      dom.setAttribute('role', 'group');
      dom.setAttribute('aria-label', `${attrs.title}. Active workflow`);
      dom.title = attrs.hint ? `${attrs.title}. ${attrs.hint}` : attrs.title;

      const token = document.createElement('span');
      token.className = 'composer-extension-token';

      const icon = document.createElement('span');
      icon.className = 'composer-extension-token-icon';
      icon.setAttribute('aria-hidden', 'true');
      icon.innerHTML = safeIconMarkup(attrs.icon);

      const label = document.createElement('span');
      label.className = 'composer-extension-token-label';
      label.textContent = attrs.title;

      const remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'composer-extension-token-remove';
      remove.setAttribute('aria-label', `Remove ${attrs.title} workflow`);
      remove.title = 'Remove workflow';
      remove.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg>';
      remove.addEventListener('mousedown', (event) => {
        event.preventDefault();
        event.stopPropagation();
      });
      remove.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        this.options.onRemove(attrs.key);
      });

      const hint = document.createElement('span');
      hint.className = 'composer-extension-token-hint';
      hint.textContent = attrs.hint || '';

      token.append(icon, label, remove);
      dom.append(token, hint);
      return { dom };
    };
  },
});
