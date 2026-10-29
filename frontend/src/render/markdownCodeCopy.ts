/* Mount and release React controls for Markdown code-block headers. */
import { createElement } from 'react';
import { flushSync } from 'react-dom';
import { createRootGroup } from '../react/lib/boot/ownedRoot';
import { reportSwallow } from '../util/reportSwallow.ts';

const COPY_HEADER_SELECTOR = '.msg-body .code-block-header, .think-content .code-block-header';
const ACTION_HOST_SELECTOR = '[data-code-block-actions-root]';
const codeActionRoots = createRootGroup('markdown-code-actions');
const renderRequests = new WeakMap<HTMLElement, number>();

function addCodeBlockActions(header: Element): void {
  const pre = header.nextElementSibling;
  if (!pre || pre.tagName !== 'PRE') return;
  let host = header.querySelector<HTMLElement>(ACTION_HOST_SELECTOR);
  if (!host) {
    host = document.createElement('div');
    host.className = 'code-block-actions';
    host.setAttribute('data-code-block-actions-root', '');
    header.appendChild(host);
  }

  const lang = header.querySelector('.code-block-header-lang')?.textContent?.trim() || '';
  const request = (renderRequests.get(host) || 0) + 1;
  renderRequests.set(host, request);
  void import('../react/render/CodeBlockActions.tsx').then(({ CodeBlockActions }) => {
    if (!host.isConnected || renderRequests.get(host) !== request) return;
    const content = createElement(CodeBlockActions, { codeElement: pre as HTMLElement, language: lang });
    const root = codeActionRoots.render(host, content);
    flushSync(() => root.render(content));
  }).catch((error) => {
    reportSwallow(error, 'render/markdownCodeCopy.ts:addCodeBlockActions');
  });
}

function hostsWithin(root: Node): HTMLElement[] {
  const hosts: HTMLElement[] = [];
  const rootEl = root as Element;
  if (typeof rootEl.matches === 'function' && rootEl.matches(ACTION_HOST_SELECTOR)) hosts.push(rootEl as HTMLElement);
  if (typeof rootEl.querySelectorAll === 'function') {
    hosts.push(...Array.from(rootEl.querySelectorAll<HTMLElement>(ACTION_HOST_SELECTOR)));
  }
  return hosts;
}

function wireCodeBlockActions(root: ParentNode): void {
  const headers: Element[] = [];
  const rootEl = root as Element;
  if (typeof rootEl.matches === 'function' && rootEl.matches(COPY_HEADER_SELECTOR)) headers.push(rootEl);
  headers.push(...Array.from(root.querySelectorAll(COPY_HEADER_SELECTOR)));
  headers.forEach((header) => {
    if (header.closest('.exec-artifact') || header.closest('.agent-tool-card') || header.closest('.viz')) return;
    addCodeBlockActions(header);
  });
}

let _codeCopyInstalled = false;

export function installCodeBlockCopy(): void {
  if (_codeCopyInstalled || typeof document === 'undefined' || typeof MutationObserver === 'undefined') return;
  _codeCopyInstalled = true;

  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      mutation.removedNodes.forEach((node) => {
        if (node.nodeType === 1) hostsWithin(node).forEach((host) => codeActionRoots.release(host));
      });
      mutation.addedNodes.forEach((node) => {
        if (node.nodeType !== 1) return;
        try {
          wireCodeBlockActions(node as Element);
        } catch (error) {
          console.warn('[markdown] could not mount code-block actions', error);
        }
      });
    }
  });

  const start = () => {
    if (!document.body) return;
    observer.observe(document.body, { childList: true, subtree: true });
    wireCodeBlockActions(document);
  };

  if (document.body) start();
  else if (typeof window !== 'undefined') window.addEventListener('DOMContentLoaded', start, { once: true });
}
