/**
 * chat/replyLanguage.ts — the "answer language" preference.
 *
 * The reply language used to be derived only from the text the user typed, with
 * the UI locale as a silent fallback. Switching the interface to English and
 * then typing Chinese therefore produced a Chinese answer, which reads as the
 * toggle being broken. This preference makes the choice explicit:
 *
 *   auto — follow the language the user typed (the old behaviour, default)
 *   zh   — always answer in Chinese
 *   en   — always answer in English
 *
 * It is read by chat/lang.ts, so it affects the system directive of the next
 * turn only; answers already on screen keep their own language.
 */

export type ReplyLanguage = 'auto' | 'zh' | 'en';

const STORAGE_KEY = 'socrates-reply-language';

function readStoredPreference(): ReplyLanguage {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === 'auto' || saved === 'zh' || saved === 'en') return saved;
  } catch {
    /* empty-catch: intentional — private mode or disabled storage leaves the default. */
  }
  return 'auto';
}

let current: ReplyLanguage = readStoredPreference();

export function getReplyLanguage(): ReplyLanguage {
  return current;
}

export function setReplyLanguage(next: ReplyLanguage): void {
  current = next === 'zh' || next === 'en' ? next : 'auto';
  try {
    localStorage.setItem(STORAGE_KEY, current);
  } catch {
    /* empty-catch: intentional — the preference still applies to this page session. */
  }
  try {
    document.dispatchEvent(
      new CustomEvent('socrates:reply-language', { detail: { language: current } }),
    );
  } catch {
    /* empty-catch: intentional — non-DOM hosts (tests) have no event target. */
  }
}
