/**
 * Mounts the RN-4 question chain into #socraticSuggestions. The chain
 * replaces the old suggestion chips: the same host, the same lazy import,
 * one owned root per container.
 */
import { createElement } from 'react';
import type { ChainCandidate } from '@socrates/ui/think-model';
import { mountOwnedRoot, type OwnedRootHandle } from '../lib/boot/ownedRoot';
import { reportSwallow } from '../../util/reportSwallow.ts';

let host: HTMLElement | null = null;
let root: OwnedRootHandle | null = null;
let pendingHost: HTMLElement | null = null;
let renderRequest = 0;

export function renderSocraticSuggestions(target: HTMLElement, prompts: string[], onFollow: (candidate: ChainCandidate) => void): void {
  const request = ++renderRequest;
  pendingHost = target;
  void import('./QuestionChainRoot').then(({ QuestionChainRoot }) => {
    if (request !== renderRequest || !target.isConnected) return;
    pendingHost = null;
    const content = createElement(QuestionChainRoot, { prompts, onFollow });
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
