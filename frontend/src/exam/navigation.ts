import { prefersReducedMotion } from '../ui/motion.ts';
import { runtimeWindow as browserWindow } from "../types/runtimeWindow.ts";

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
}

export function examNavStep(direction: number, current = examNavCurrentIdx()) {
  const total = browserWindow.stateStore.read('examQuestions').length;
  if (total === 0) return null;
  const next = Math.max(0, Math.min(total - 1, current + direction));
  examNavJump(next);
  return next;
}
