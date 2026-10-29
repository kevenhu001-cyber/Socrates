import { createElement } from 'react';
import { flushSync } from 'react-dom';
import { mountOwnedRoot, type OwnedRootHandle } from '../lib/boot/ownedRoot';
import { SharedExamFooterAction } from './SharedExamFooterAction';

const roots = new WeakMap<HTMLElement, OwnedRootHandle>();

export function renderSharedExamFooter(host: HTMLElement, label: string): void {
  const content = createElement(SharedExamFooterAction, { label });
  const existing = roots.get(host);
  if (existing) {
    flushSync(() => existing.render(content));
    return;
  }
  let root: OwnedRootHandle | null = null;
  flushSync(() => { root = mountOwnedRoot(host, 'shared-exam-footer', content); });
  roots.set(host, root!);
}
