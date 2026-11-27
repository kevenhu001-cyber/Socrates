/* Plain-text helpers used by message-editing flows. */
import { _looksLikeInlineMath } from './markdownMath.ts';
import { sessionBridge } from '../store/index.ts';
import { stripHtmlTags } from '../util/stripHtml.ts';

/* ── Plain-text helpers (used by message-editing flows) ──────────── */

export function stripMarkdown(s: string | null | undefined): string {
  if (!s) return '';
  return stripHtmlTags(String(s))
    .replace(/```[\s\S]*?```/g, '')
    .replace(/~~~[\s\S]*?~~~/g, '')
    .replace(/\$\$[\s\S]*?\$\$/g, '')
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
  const list = (sessionBridge.getSnapshot().messages || []) as Array<{
    role?: string;
    rawText?: string;
  }>;
  for (let i = list.length - 1; i >= 0; i--) {
    if (list[i].role === 'user' && list[i].rawText) return stripMarkdown(list[i].rawText);
  }
  return null;
}

/* Returns the most recent assistant message's raw markdown text, or null.
   Used by Cmd/Ctrl+Shift+C to copy the last response (ChatGPT shortcut). */
export function findLastAssistantMessage(): string | null {
  const list = (sessionBridge.getSnapshot().messages || []) as Array<{
    role?: string;
    rawText?: string;
  }>;
  for (let i = list.length - 1; i >= 0; i--) {
    const raw = list[i].rawText;
    if (list[i].role === 'assistant' && raw) return raw;
  }
  return null;
}
