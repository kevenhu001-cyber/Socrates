import { createElement } from 'react';
import { createObservedRootGroup } from '../lib/boot/observedRootGroup';
import { ToolCardDisclosure } from './ToolCardDisclosure';

const roots = createObservedRootGroup('tool-card-disclosure', { synchronous: true });

export function renderToolCardDisclosure(host: HTMLElement, contentHtml: string, detailId: string): void {
  roots.render(host, createElement(ToolCardDisclosure, { contentHtml, detailId }));
}
