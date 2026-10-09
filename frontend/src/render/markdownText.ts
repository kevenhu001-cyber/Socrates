/* Plain-text helpers used by message-editing flows. */
import { _looksLikeInlineMath } from './markdownMath.js';
import { stateStore } from '../state/store.js';

/* ── Plain-text helpers (used by message-editing flows) ──────────── */

export function stripMarkdown(s: string | null | undefined): string {
  if (!s) return '';
  return String(s)
    .replace(/<\/?[a-zA-Z][^>]*>/g, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<!\[CDATA\[[\s\S]*?\]\]>/g, '')
    .replace(/```[\s\S]*?```/g, '')
    .replace(/~~~[\s\S]*?~~~/g, '')
    .replace(/\$\$([^$]*)\$\$/g, function (m, inner: string) {
      return _looksLikeInlineMath(inner.trim()) ? '' : m;
    })
    .replace(/\$([^$]*)\$/g, function (m, inner: string) {
      return _looksLikeInlineMath(inner.trim()) ? '' : m;
    })
    .replace(/`[^`]*`/g, '')
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\*\*([^*]*)\*\*/g, '$1')
    .replace(/__([^_]*)__/g, '$1')
    .replace(/\*([^*]*)\*/g, '$1')
    .replace(/_([^_]*)_/g, '$1')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/^>\s+/gm, '')
    .replace(/^[-*_]{3,}\s*$/gm, '')
    .replace(/^[-*+]\s+/gm, '')
    .replace(/^\d+\.\s+/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/* Returns the most recent user message with markdown stripped, or null.
   Used by the `↑` (empty input) shortcut to pop the previous prompt
   back into the input for editing. */
export function findLastUserMessage(): string | null {
  const list = (stateStore.read('messages') || []) as Array<{ role?: string; rawText?: string }>;
  for (let i = list.length - 1; i >= 0; i--) {
    if (list[i].role === 'user' && list[i].rawText) return stripMarkdown(list[i].rawText);
  }
  return null;
}
