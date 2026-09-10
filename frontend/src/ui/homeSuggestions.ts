/*
 * homeSuggestions.ts
 *
 * Renders the landing-page starter prompts returned by
 * /api/suggestions/starters. The server only returns a result when the
 * account has history, the built-in Beagle model is available, and exactly
 * three prompts passed validation. This module therefore renders nothing
 * until the complete response arrives.
 */

import { apiFetch } from '../util/api.js';
import { escapeHtml } from '../util/safe.js';

type SuggestionIcon = 'spark' | 'history' | 'target';

interface SuggestionItem {
  id: string;
  icon: SuggestionIcon;
  prompt: string;
}

const SUGGESTION_COUNT = 3;
const ICON_ROTATION: SuggestionIcon[] = ['spark', 'history', 'target'];
const EMOJI_RE = /\p{Extended_Pictographic}/u;
const PLACEHOLDER_RE = /\[[^\]]+\]|\{\{[^}]+\}\}/;

let inFlightKey = '';
let inFlightPromise: Promise<void> | null = null;
let lastSuccessKey = '';
let lastEmptyKey = '';
let lastEmptyAt = 0;

const ICON_SVGS: Record<SuggestionIcon, string> = {
  spark: `
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <path d="m12 3 1.7 4.6L18 9.3l-4.3 1.7L12 15.6l-1.7-4.6L6 9.3l4.3-1.7z"/>
      <path d="m18.7 15.2.8 2.1 2.1.8-2.1.8-.8 2.1-.8-2.1-2.1-.8 2.1-.8z"/>
    </svg>`,
  history: `
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <path d="M4.8 8.2A8.5 8.5 0 1 1 4 12"/>
      <path d="M4.8 4.8v3.7h3.7"/>
      <path d="M12 7.5V12l3 1.8"/>
    </svg>`,
  target: `
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="7.5"/>
      <circle cx="12" cy="12" r="3.5"/>
      <path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3"/>
    </svg>`,
};

function currentUserId(): string {
  if (typeof window === 'undefined') return '';
  const user = (window as any).CURRENT_USER;
  return user && user.id ? String(user.id) : '';
}

function currentLang(): 'zh' | 'en' {
  return (typeof window !== 'undefined' && (window as any)._currentLang === 'en') ? 'en' : 'zh';
}

function getIconSvg(icon: unknown, index: number): string {
  const normalized = icon === 'history' || icon === 'target' || icon === 'spark'
    ? icon
    : ICON_ROTATION[index % ICON_ROTATION.length];
  return ICON_SVGS[normalized];
}

function normalizeSuggestions(payload: unknown): SuggestionItem[] {
  const raw = payload && typeof payload === 'object' && Array.isArray((payload as any).suggestions)
    ? (payload as any).suggestions
    : null;
  if (!raw || raw.length !== SUGGESTION_COUNT) return [];

  const seen = new Set<string>();
  const out: SuggestionItem[] = [];
  for (let index = 0; index < raw.length; index++) {
    const item = raw[index];
    if (!item || typeof item !== 'object') return [];
    const prompt = typeof item.prompt === 'string' ? item.prompt.replace(/\s+/g, ' ').trim() : '';
    if (!prompt || prompt.length < 6 || prompt.length > 120) return [];
    if (PLACEHOLDER_RE.test(prompt) || EMOJI_RE.test(prompt)) return [];
    const fingerprint = prompt.toLocaleLowerCase();
    if (seen.has(fingerprint)) return [];
    seen.add(fingerprint);
    out.push({
      id: `home-suggestion-${index}`,
      icon: item.icon === 'history' || item.icon === 'target' || item.icon === 'spark'
        ? item.icon
        : ICON_ROTATION[index % ICON_ROTATION.length],
      prompt,
    });
  }
  return out;
}

function clearSuggestions(container: HTMLElement): void {
  container.innerHTML = '';
  container.removeAttribute('data-state');
}

function bindSuggestionHandlers(container: HTMLElement): void {
  container.querySelectorAll('.home-suggestion-btn').forEach((button) => {
    button.addEventListener('click', () => {
      const encoded = (button as HTMLElement).dataset.prompt;
      if (!encoded) return;
      const prompt = decodeURIComponent(encoded);
      const controller = (window as any).__socratesComposerController;
      if (controller && typeof controller.setMarkdown === 'function') {
        controller.setMarkdown('topic', prompt);
        controller.focus?.('topic');
        return;
      }
      const editor = document.querySelector('#topicComposerRoot .rich-composer-editor, #topicComposerRoot [contenteditable="true"]') as HTMLElement | null;
      if (editor) {
        editor.focus();
        document.execCommand('insertText', false, prompt);
      }
    });
  });

  container.querySelectorAll('.home-suggestion-dismiss').forEach((button) => {
    button.addEventListener('click', (event) => {
      event.stopPropagation();
      const item = (button as HTMLElement).closest('.home-suggestion-item') as HTMLElement | null;
      if (!item) return;
      item.classList.add('home-suggestion-item--dismissing');
      setTimeout(() => item.classList.add('home-suggestion-item--dismissed'), 200);
    });
  });
}

function renderSuggestions(container: HTMLElement, items: SuggestionItem[]): void {
  container.innerHTML = `
    <ul class="home-suggestions-list" role="list" aria-label="Suggested tasks">
      ${items.map((item, index) => `
        <li class="home-suggestion-item" data-suggestion-id="${escapeHtml(item.id)}" data-suggestion-index="${index}">
          <button type="button" class="home-suggestion-btn" data-prompt="${escapeHtml(encodeURIComponent(item.prompt))}">
            <span class="home-suggestion-icon">${getIconSvg(item.icon, index)}</span>
            <span class="home-suggestion-text">${escapeHtml(item.prompt)}</span>
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
  container.dataset.state = 'ready';
  bindSuggestionHandlers(container);
}

async function loadSuggestions(
  container: HTMLElement,
  userId: string,
  lang: 'zh' | 'en',
  key: string,
): Promise<void> {
  try {
    const payload = await apiFetch(`/api/suggestions/starters?lang=${encodeURIComponent(lang)}`);
    if (currentUserId() !== userId || currentLang() !== lang) return;
    const items = normalizeSuggestions(payload);
    if (items.length !== SUGGESTION_COUNT) {
      lastEmptyKey = key;
      lastEmptyAt = Date.now();
      clearSuggestions(container);
      return;
    }
    lastSuccessKey = key;
    lastEmptyKey = '';
    renderSuggestions(container, items);
  } catch (_) {
    if (currentUserId() === userId && currentLang() === lang) {
      lastEmptyKey = key;
      lastEmptyAt = Date.now();
      clearSuggestions(container);
    }
  }
}

export function mountHomeSuggestions(): void {
  const container = document.getElementById('homeSuggestionsWrap');
  if (!container) return;

  const userId = currentUserId();
  if (!userId) {
    clearSuggestions(container);
    return;
  }

  const lang = currentLang();
  const key = `${userId}:${lang}`;
  if (lastSuccessKey === key && container.querySelector('.home-suggestion-btn')) return;
  /* A negative result is retried when the user returns to the landing page
     after a short interval, so newly created history or a newly configured
     Beagle provider can surface without a full reload. */
  if (lastEmptyKey === key && Date.now() - lastEmptyAt < 60_000) return;
  if (inFlightKey === key && inFlightPromise) return;

  clearSuggestions(container);
  const promise = loadSuggestions(container, userId, lang, key);
  inFlightKey = key;
  inFlightPromise = promise;
  promise.finally(() => {
    if (inFlightPromise === promise) {
      inFlightPromise = null;
      inFlightKey = '';
    }
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
