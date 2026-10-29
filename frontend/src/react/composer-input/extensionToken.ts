import { Node, mergeAttributes } from '@tiptap/core';
import { createElement } from 'react';
import { flushSync } from 'react-dom';
import DOMPurify from 'dompurify';

import type { ComposerExtensionToken } from '../../composer/types.ts';
import { mountOwnedRoot, type OwnedRootHandle } from '../lib/boot/ownedRoot';
import { Button } from '../ui/shadcn/button';

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

      const removeHost = document.createElement('span');
      removeHost.className = 'composer-extension-token-remove-host';
      let removeRoot!: OwnedRootHandle;
      flushSync(() => {
        removeRoot = mountOwnedRoot(removeHost, 'composer-extension-token-remove', createElement(Button, {
          type: 'button',
          variant: 'ghost',
          size: 'icon-xs',
          className: 'composer-extension-token-remove',
          'aria-label': `Remove ${attrs.title} workflow`,
          title: 'Remove workflow',
          onMouseDown: (event) => {
            event.preventDefault();
            event.stopPropagation();
          },
          onClick: (event) => {
            event.preventDefault();
            event.stopPropagation();
            this.options.onRemove(attrs.key);
          },
          children: '×',
        }));
      });

      token.append(icon, label, removeHost);
      dom.append(token);
      return { dom, destroy: () => removeRoot.destroy() };
    };
  },
});
