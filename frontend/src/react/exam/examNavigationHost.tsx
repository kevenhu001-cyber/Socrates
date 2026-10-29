import { mountOwnedRoot, type OwnedRootHandle } from '../lib/boot/ownedRoot';
import { ExamNavigation, type ExamNavigationSnapshot } from './ExamNavigation';

let root: OwnedRootHandle | null = null;
let lastSnapshot = '';

export function renderExamNavigation(host: HTMLElement, snapshot: ExamNavigationSnapshot) {
  const key = JSON.stringify(snapshot);
  if (key === lastSnapshot) return;
  lastSnapshot = key;
  const content = <ExamNavigation snapshot={snapshot} />;
  if (root) root.render(content);
  else root = mountOwnedRoot(host, 'exam-navigation', content);
}

export function clearExamNavigation() {
  lastSnapshot = '';
  root?.render(null);
}
