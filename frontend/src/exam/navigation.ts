import { prefersReducedMotion } from '../ui/motion.ts';
import { renderExamNavigation, clearExamNavigation } from '../react/exam/examNavigationHost.tsx';
import { examUiL as _examUiL } from './ui.ts';
import { runtimeWindow as browserWindow } from "../types/runtimeWindow.ts";


function answeredQuestionIndexes() {
  const answers = browserWindow.stateStore.read('examAnswers') || {};
  return Object.keys(answers).filter(function (key) {
    const value = answers[key];
    if (value === undefined || value === null) return false;
    return typeof value === 'string' ? value.trim().length > 0 : true;
  }).map(Number);
}

export function renderExamNav() {
  if (!browserWindow.stateStore.read('_examInView')) return;
  const host = document.getElementById('examViewReactNav');
  if (!host) return;
  const total = browserWindow.stateStore.read('examQuestions').length;
  if (total === 0) {
    clearExamNavigation();
    return;
  }
  renderExamNavigation(host, {
    current: examNavCurrentIdx(),
    total,
    answered: answeredQuestionIndexes(),
    isSubmitted: !!browserWindow.stateStore.read('examSubmitted'),
    labels: {
      previous: _examUiL('Previous question', '上一题'),
      next: _examUiL('Next question', '下一题'),
      answered: _examUiL('answered', '已答'),
    },
  });
}

export function examNavCurrentIdx() {
  const container = document.getElementById('examQuestionsContainer');
  if (!container) return 0;
  const cards = container.querySelectorAll(".exam-q-card[id^='examQ']");
  if (!cards.length) return 0;
  let closest = 0;
  let bestDistance = Infinity;
  const top = container.getBoundingClientRect().top;
  cards.forEach(function (card, index) {
    const distance = Math.abs(card.getBoundingClientRect().top - top);
    if (distance < bestDistance) {
      bestDistance = distance;
      closest = index;
    }
  });
  return closest;
}

export function examNavJump(index: string|number) {
  const card = document.getElementById('examQ' + index);
  if (!card) return;
  card.scrollIntoView({ behavior: prefersReducedMotion() ? 'auto' : 'smooth', block: 'start' });
  setTimeout(syncExamNav, 300);
}

export function examNavStep(direction: number) {
  const total = browserWindow.stateStore.read('examQuestions').length;
  if (total === 0) return;
  const next = Math.max(0, Math.min(total - 1, examNavCurrentIdx() + direction));
  examNavJump(next);
}

export function syncExamNav() {
  renderExamNav();
}

export function refreshExamNavTally() {
  renderExamNav();
}
