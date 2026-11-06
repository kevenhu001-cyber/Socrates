/**
 * Text helpers for the scaffold parsers.
 *
 * The tutor writes XML-ish blocks (`<quiz><q>…</q></quiz>`); the parsers
 * hand the host raw markdown with the entities decoded and the stray HTML
 * removed. They live in their own leaf module so the parsers
 * (`learn/model.ts`) and the splitter (`learn/split.ts`) can share them
 * without an import cycle.
 */
import { markdownCodeRanges } from './learn/markdownCode.ts';

const ENTITIES: Record<string, string> = { '&lt;': '<', '&gt;': '>', '&quot;': '"', '&apos;': "'", '&amp;': '&' };

export function decodeEntities(value: string): string {
  return String(value).replace(/&(lt|gt|quot|apos|amp);/g, (m) => ENTITIES[m] || m);
}

export function stripTags(value: string): string {
  /* Repeated until stable: one pass over "<<script>" leaves "<script". */
  const text = String(value ?? '');
  const codeRanges = markdownCodeRanges(text);
  if (!codeRanges.length) return stripMarkupTags(text);

  const parts: string[] = [];
  let cursor = 0;
  for (const range of codeRanges) {
    parts.push(stripMarkupTags(text.slice(cursor, range.start)));
    parts.push(text.slice(range.start, range.end));
    cursor = range.end;
  }
  parts.push(stripMarkupTags(text.slice(cursor)));
  return parts.join('');
}

function stripMarkupTags(value: string): string {
  let text = value;
  for (let pass = 0; pass < 8; pass += 1) {
    const next = text.replace(/<[^>]*>/g, '');
    if (next === text) break;
    text = next;
  }
  return text;
}

/**
 * Escape the markup in a value that must be shown literally.
 *
 * A scaffold block that degrades to prose is model-authored text: it is
 * rendered as plain words, never as markup, so a question that contains
 * `<b>` shows the tag instead of bold text.
 */
export function escapeHtml(value: unknown): string {
  if (value == null) return '';
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
