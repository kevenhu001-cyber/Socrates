import { focusComposer, setComposerMarkdown } from '../react/composer-input/controller.ts';

export function initHomeIdeas() {
  const ideas = document.querySelector('.home-ideas');
  if (!ideas || ideas.dataset.initialized === 'true') return;
  ideas.dataset.initialized = 'true';
  ideas.addEventListener('click', (event) => {
    const button = event.target.closest('[data-home-prompt]');
    if (!button) return;
    setComposerMarkdown('topic', button.dataset.homePrompt || '');
    focusComposer('topic');
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initHomeIdeas, { once: true });
} else {
  initHomeIdeas();
}
