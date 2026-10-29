import { mountOwnedRoot, type OwnedRootHandle } from '../lib/boot/ownedRoot';
import { ExamQuestionCard, type ExamQuestionCardData } from './ExamQuestionCard';

const roots = new Map<HTMLElement, OwnedRootHandle>();

export function renderExamQuestionCard(host: HTMLElement, commandHost: HTMLElement, data: ExamQuestionCardData) {
  const content = <ExamQuestionCard {...data} commandHost={commandHost} />;
  const existing = roots.get(host);
  if (existing) {
    existing.render(content);
    return;
  }
  roots.set(host, mountOwnedRoot(host, 'exam-question-card', content));
}

export function clearExamQuestionCards() {
  for (const root of roots.values()) root.destroy();
  roots.clear();
}
