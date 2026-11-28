/* chat/lang.ts
 * Pure functions for language detection and language-specific system-message
 * directives. Extracted from legacy entry.
 * No mutation, no DOM, no state/store.ts reads. Only consumer is askChatTurn.
 */

import { getCurrentLanguage } from '../i18n/languageState.ts';
import { getReplyLanguage } from './replyLanguage.ts';

/* Detect user language from input text. Returns one of: zh, ja, ko, ru, ar, en.
 * Strategy: Japanese kana or Korean hangul are unambiguous signals. For CJK
 * we look at the longest consecutive CJK run (a 2+ char Chinese phrase
 * means zh, even with surrounding English). Pure non-Latin scripts
 * (Cyrillic, Arabic) win when present. Returns "en" as the safe default. */
function detectLanguage(text: string): string {
  if (!text) return 'en';
  let cjkRun = 0,
    bestCjkRun = 0;
  for (const char of text) {
    if (/[\u4e00-\u9fff\u3400-\u4dbf]/.test(char)) {
      cjkRun++;
      if (cjkRun > bestCjkRun) bestCjkRun = cjkRun;
    } else {
      cjkRun = 0;
    }
  }
  const jpKana = (text.match(/[\u3040-\u309f\u30a0-\u30ff]/g) || []).length;
  const koHangul = (text.match(/[\uac00-\ud7af]/g) || []).length;
  const cyrillic = (text.match(/[\u0400-\u04ff]/g) || []).length;
  const arabic = (text.match(/[\u0600-\u06ff]/g) || []).length;
  if (jpKana > 0) return 'ja';
  if (koHangul > 0) return 'ko';
  if (bestCjkRun >= 2) return 'zh';
  if (cyrillic > 0) return 'ru';
  if (arabic > 0) return 'ar';
  return 'en';
}

/* Build a strong, language-specific directive to inject at the top of
 * the system message. Goal: stop the model from leaking English into
 * Chinese responses (and vice versa). The directive is in the target
 * language so the model reads it as instructions in the language it
 * is about to use.
 * Source of truth: the language detected from the user's own input.
 * The UI language is only a fallback when the
 * input carries no detectable language signal — the reply must follow
 * the language the user writes in, never the UI locale (an English
 * question in a Chinese UI gets an English reply, and vice versa).
 * Returns "" when input looks like pure code/URL. */
function languageDirectiveFor(text: string): string {
  const t = text ? String(text).trim() : '';
  /* A URL or a pasted code fragment carries no reliable language signal.
     The old code returned no directive at all, so those turns inherited
     whatever the surrounding prompt felt like and could answer in the
     other language. Fall back to the UI language instead, which is the
     only signal the reader actually chose. */
  const noLanguageSignal =
    t.length >= 2 &&
    (/^(https?:\/\/|www\.|[/\\][\w\-./\\]+\.\w{1,5}$)/i.test(t) ||
      /^(function\s|class\s|def\s|import\s|const\s|let\s|var\s|#include|<\?xml|<!DOCTYPE)/i.test(
        t,
      ));
  const hasLangSignal =
    !noLanguageSignal &&
    /[A-Za-z\u4e00-\u9fff\u3400-\u4dbf\u3040-\u309f\u30a0-\u30ff\uac00-\ud7af\u0400-\u04ff\u0600-\u06ff]/.test(
      t,
    );
  const uiLang = getCurrentLanguage();
  const preference = getReplyLanguage();
  /* An explicit answer-language preference wins; otherwise the reply follows
     the language the user actually wrote in, never the UI locale. */
  const lang =
    preference !== 'auto'
      ? preference
      : hasLangSignal
        ? detectLanguage(t)
        : uiLang || detectLanguage(t);
  const names: Record<string, string> = {
    zh: 'Chinese',
    en: 'English',
    ja: 'Japanese',
    ko: 'Korean',
    ru: 'Russian',
    ar: 'Arabic',
  };
  const language = names[lang];
  return language
    ? '\n\nDefault response language: ' +
        language +
        '. Honor an explicit translation or output-language request instead; preserve technical terms, quotes and syntax.\n'
    : '';
}

export { detectLanguage, languageDirectiveFor };
