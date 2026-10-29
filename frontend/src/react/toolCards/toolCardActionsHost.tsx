import { createElement } from 'react';
import { createObservedRootGroup } from '../lib/boot/observedRootGroup';
import type { ToolCardCopyActionProps } from './ToolCardActions';
import { reportSwallow } from '../../util/reportSwallow.ts';

const roots = createObservedRootGroup('tool-card-actions', { synchronous: true });
const renderRequests = new WeakMap<HTMLElement, number>();

function renderContent(host: HTMLElement, content: ReturnType<typeof createElement>): void {
  roots.render(host, content);
}

function renderAction(host: HTMLElement, content: (components: typeof import('./ToolCardActions')) => ReturnType<typeof createElement>): void {
  const request = (renderRequests.get(host) || 0) + 1;
  renderRequests.set(host, request);
  void import('./ToolCardActions').then((components) => {
    if (!host.isConnected || renderRequests.get(host) !== request) return;
    renderContent(host, content(components));
  }).catch((error) => {
    reportSwallow(error, 'toolCardActionsHost:render');
  });
}

export function renderToolCardCopyAction(host: HTMLElement, props: ToolCardCopyActionProps): void {
  renderAction(host, ({ ToolCardCopyAction }) => createElement(ToolCardCopyAction, props));
}

export function renderToolOutputToggle(host: HTMLElement, props: {
  collapsed: boolean;
  showLabel: string;
  collapseLabel: string;
  onToggle: (collapsed: boolean) => void;
}): void {
  renderAction(host, ({ ToolOutputToggle }) => createElement(ToolOutputToggle, props));
}
