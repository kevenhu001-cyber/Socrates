import { createElement } from 'react';
import { createObservedRootGroup } from '../lib/boot/observedRootGroup';
import { ActionButton, type ActionButtonProps } from './ActionButton';

const roots = createObservedRootGroup('legacy-action-button', { synchronous: true });

export function renderActionButton(host: HTMLElement, props: ActionButtonProps): void {
  roots.render(host, createElement(ActionButton, props));
}

export function disposeActionButtonRoots(): void {
  roots.releaseAll();
}
