import { stateStore } from '../state/store.js';
import { setComposerMarkdown } from '../composer/controller.ts';

function translate(key: string, fallback: string): string {
  if (typeof (window as unknown as { t?: (k: string) => string }).t === 'function') {
    const val = (window as unknown as { t: (k: string) => string }).t(key);
    if (val && val !== key) return val;
  }
  return fallback;
}

const STAGES = [
  { step: 1, labelKey: 'tutor.mastery.step1', defaultLabel: '1. 探索提问' },
  { step: 2, labelKey: 'tutor.mastery.step2', defaultLabel: '2. 反思辨析' },
  { step: 3, labelKey: 'tutor.mastery.step3', defaultLabel: '3. 归纳洞察' },
  { step: 4, labelKey: 'tutor.mastery.step4', defaultLabel: '4. 融会贯通' },
];

export function getActiveSocraticStage(turnCount: number): typeof STAGES[number] {
  if (turnCount <= 2) return STAGES[0];
  if (turnCount <= 4) return STAGES[1];
  if (turnCount <= 6) return STAGES[2];
  return STAGES[3];
}

export function syncSocraticMasteryUI(): void {
  const isTutor = document.documentElement.dataset.mainView === 'tutor'
    || document.getElementById('topModeTutor')?.classList.contains('is-active')
    || document.getElementById('topModeTutor')?.getAttribute('aria-selected') === 'true';

  const pill = document.getElementById('tutorMasteryPill');
  if (!pill) return;

  if (!isTutor) {
    pill.classList.add('hidden');
    clearSocraticSuggestions();
    return;
  }

  pill.classList.remove('hidden');

  const messages = stateStore.read('messages');
  const count = Array.isArray(messages) ? messages.filter((m: { role?: string }) => m.role === 'user').length : 0;
  const activeStage = getActiveSocraticStage(count);

  const labelEl = document.getElementById('tutorMasteryStageLabel');
  if (labelEl) {
    labelEl.textContent = translate(activeStage.labelKey, activeStage.defaultLabel);
  }

  const dots = pill.querySelectorAll('.step-dot');
  dots.forEach((dot, index) => {
    dot.classList.toggle('active', index < activeStage.step);
  });
}

export function showSocraticSuggestions(customSuggestions?: string[]): void {
  const isTutor = document.documentElement.dataset.mainView === 'tutor'
    || document.getElementById('topModeTutor')?.classList.contains('is-active')
    || document.getElementById('topModeTutor')?.getAttribute('aria-selected') === 'true';

  const container = document.getElementById('socraticSuggestions');
  if (!container || !isTutor) return;

  const defaultPrompts = [
    '为什么会有这个前提？',
    '如果换一个条件会怎样？',
    '能举出一个反例吗？',
  ];

  const prompts = (customSuggestions && customSuggestions.length > 0) ? customSuggestions : defaultPrompts;
  container.innerHTML = '';

  prompts.forEach((promptText) => {
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'socratic-chip';
    chip.setAttribute('aria-label', promptText);

    const icon = document.createElement('span');
    icon.className = 'socratic-chip-icon';
    icon.setAttribute('aria-hidden', 'true');
    icon.textContent = '◇';
    chip.appendChild(icon);

    const text = document.createElement('span');
    text.textContent = promptText;
    chip.appendChild(text);

    chip.addEventListener('click', () => {
      try {
        setComposerMarkdown('chat', promptText);
        const editor = document.querySelector<HTMLElement>('#composerRoot [contenteditable="true"]');
        if (editor) {
          editor.focus();
        }
        clearSocraticSuggestions();
      } catch (_) { /* empty-catch: intentional — focus composer from chip click is best-effort */ }
    });

    container.appendChild(chip);
  });

  container.classList.remove('hidden');
}

export function clearSocraticSuggestions(): void {
  const container = document.getElementById('socraticSuggestions');
  if (container) {
    container.innerHTML = '';
    container.classList.add('hidden');
  }
}
