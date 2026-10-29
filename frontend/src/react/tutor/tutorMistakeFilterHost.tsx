import { createElement } from 'react';
import { mountOwnedRoot, type OwnedRootHandle } from '../lib/boot/ownedRoot';
import { reportSwallow } from '../../util/reportSwallow.ts';
import type { TutorMistakeFilterProps } from './TutorMistakeFilter';

let host: HTMLElement | null = null;
let root: OwnedRootHandle | null = null;
let renderRequest = 0;

export function renderTutorMistakeFilter(target: HTMLElement, props: TutorMistakeFilterProps): void {
  const request = ++renderRequest;
  void import('./TutorMistakeFilter').then(({ TutorMistakeFilter }) => {
    if (request !== renderRequest || !target.isConnected) return;
    const content = createElement(TutorMistakeFilter, props);
    if (host !== target) {
      root?.destroy();
      host = target;
      root = mountOwnedRoot(target, 'tutor-mistake-filter', content);
    } else {
      root?.render(content);
    }
  }).catch((error) => {
    reportSwallow(error, 'tutorMistakeFilterHost:render');
  });
}
