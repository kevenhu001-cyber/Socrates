/**
 * highlight.js language-tag validation for fenced code blocks.
 */
import { reportSwallow as reportEmptyCatch } from '../util/reportSwallow.ts';

/* validate a code-fence language tag against
   the highlight.js instance on the page. Returns the lowercase tag
   when hljs.getLanguage(name) recognises it; returns '' otherwise
   so the caller emits `<pre><code>` without a `language-*` class and
   hljs falls back to no-highlight silently. Used by:
     • render/markdown.js — when parsing ``` fences in the markdown
       renderer, drops unknown tags before they reach the DOM.
     • render/highlight.ts validates DOM language tags when the lazy
       highlighter arrives, including tags parsed before it was ready. */
export function safeHljsLang(lang: string): string {
  const l = (lang || '').toLowerCase().trim();
  if (!l) return '';
  try {
    const hljs = (globalThis as { hljs?: { getLanguage?: (name: string) => unknown } }).hljs;
    if (hljs && typeof hljs.getLanguage === 'function') {
      if (!hljs.getLanguage(l)) return '';
    }
  } catch (_) {
    reportEmptyCatch(_, 'empty catch: render/code.ts');
    /* hljs missing or threw — fall through and keep the lang */
  }
  return l;
}
