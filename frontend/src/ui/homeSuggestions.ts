/*
 * homeSuggestions.ts
 *
 * Replicates the 3 prompt suggestions displayed directly beneath the composer
 * on the ChatGPT reference homepage (chatgpt-home.png / ChatGPT.html):
 *   1. Resolve review comments on paseo PR #4167
 *   2. Let me know when subscription or authorization rules materially change
 *   3. Send me a Friday shortlist of new work on memory systems and low-compute self-evolving AI
 *
 * Clicking a suggestion populates the topic composer and focuses the editor.
 * Hovering reveals a dismiss button.
 */

interface SuggestionItem {
  id: string;
  iconType: 'github' | 'laptop' | 'robot';
  title: string;
  prompt: string;
}

const SUGGESTIONS: SuggestionItem[] = [
  {
    id: 'pr-review',
    iconType: 'github',
    title: 'Resolve review comments on paseo PR #4167',
    prompt: 'Resolve review comments on paseo PR #4167',
  },
  {
    id: 'rules-change',
    iconType: 'laptop',
    title: 'Let me know when subscription or authorization rules materially change',
    prompt: 'Let me know when subscription or authorization rules materially change',
  },
  {
    id: 'ai-shortlist',
    iconType: 'robot',
    title: 'Send me a Friday shortlist of new work on memory systems and low-compute self-evolving AI',
    prompt: 'Send me a Friday shortlist of new work on memory systems and low-compute self-evolving AI',
  },
];

function getIconSvg(type: SuggestionItem['iconType']): string {
  switch (type) {
    case 'github':
      return `<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path fill-rule="evenodd" clip-rule="evenodd" d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.53 1.032 1.53 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z"/></svg>`;
    case 'laptop':
      return `<span class="suggestion-emoji" aria-hidden="true">💻</span>`;
    case 'robot':
      return `<span class="suggestion-emoji" aria-hidden="true">🤖</span>`;
  }
}

export function mountHomeSuggestions(): void {
  const container = document.getElementById('homeSuggestionsWrap');
  if (!container) return;

  // Render the suggestions matching ChatGPT.html
  container.innerHTML = `
    <ul class="home-suggestions-list" role="list" aria-label="Suggested tasks">
      ${SUGGESTIONS.map((item, idx) => `
        <li class="home-suggestion-item" data-suggestion-id="${item.id}" data-suggestion-index="${idx}">
          <button type="button" class="home-suggestion-btn" data-prompt="${encodeURIComponent(item.prompt)}">
            <span class="home-suggestion-icon">${getIconSvg(item.iconType)}</span>
            <span class="home-suggestion-text">${item.title}</span>
          </button>
          <button type="button" class="home-suggestion-dismiss" aria-label="关闭建议" title="关闭建议">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        </li>
      `).join('')}
    </ul>
  `;

  // Attach click listener for suggestions
  container.querySelectorAll('.home-suggestion-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const promptEncoded = (btn as HTMLElement).dataset.prompt;
      if (!promptEncoded) return;
      const prompt = decodeURIComponent(promptEncoded);

      // Populate composer
      const controller = (window as any).__socratesComposerController;
      if (controller && typeof controller.setMarkdown === 'function') {
        controller.setMarkdown('topic', prompt);
        controller.focus?.('topic');
      } else {
        const editor = document.querySelector('#topicComposerRoot .rich-composer-editor, #topicComposerRoot [contenteditable="true"]') as HTMLElement;
        if (editor) {
          editor.focus();
          document.execCommand('insertText', false, prompt);
        }
      }
    });
  });

  // Attach click listener for dismiss
  container.querySelectorAll('.home-suggestion-dismiss').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const li = (btn as HTMLElement).closest('.home-suggestion-item') as HTMLElement;
      if (li) {
        li.style.opacity = '0';
        li.style.transform = 'translateY(-4px)';
        li.style.transition = 'opacity 0.2s ease, transform 0.2s ease';
        setTimeout(() => {
          li.style.display = 'none';
        }, 200);
      }
    });
  });
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      mountHomeSuggestions();
    });
  } else {
    mountHomeSuggestions();
  }
}

