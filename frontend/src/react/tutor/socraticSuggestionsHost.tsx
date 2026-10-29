import { createElement } from 'react';
import { mountOwnedRoot, type OwnedRootHandle } from '../lib/boot/ownedRoot';
import { reportSwallow } from '../../util/reportSwallow.ts';

let host: HTMLElement | null = null;
let root: OwnedRootHandle | null = null;
let pendingHost: HTMLElement | null = null;
let renderRequest = 0;

export function renderSocraticSuggestions(target: HTMLElement, prompts: string[], onSelect: (prompt: string) => void): void {
  const request = ++renderRequest;
  pendingHost = target;
  void import('./SocraticSuggestions').then(({ SocraticSuggestions }) => {
    if (request !== renderRequest || !target.isConnected) return;
    pendingHost = null;
    const content = createElement(SocraticSuggestions, { prompts, onSelect });
    if (host !== target) {
      root?.destroy();
      host = target;
      root = mountOwnedRoot(target, 'socratic-suggestions', content);
    } else {
      root?.render(content);
    }
  }).catch((error) => {
    reportSwallow(error, 'socraticSuggestionsHost:render');
  });
}

export function clearSocraticSuggestions(target: HTMLElement): void {
  if (host !== target && pendingHost !== target) return;
  renderRequest += 1;
  pendingHost = null;
  if (host === target && root) root.render(null);
}
