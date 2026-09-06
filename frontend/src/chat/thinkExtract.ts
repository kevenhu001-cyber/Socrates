/**
 * chat/thinkExtract.ts — inline thinking text helpers for streaming turns.
 *
 * Extracted from the addStreamingMessage closure in main.js. The right
 * drawer shows both reasoning_content deltas and inline <think> blocks;
 * these pure helpers keep the panel's text snapshot in sync with the live
 * stream without slowing the markdown renderer.
 */

/** Default divider between reasoning_content and inline <think> text. */
export const INLINE_THINK_DIVIDER = '—— inline thinking ——';

/**
 * Extract the text inside <think>...</think> blocks, including an
 * unclosed trailing <think> tail that is still streaming in.
 */
export function extractThinkText(raw: unknown): string {
  if (typeof raw !== 'string' || raw.indexOf('<think>') === -1) return '';
  const out: string[] = [];
  const re = /<think>([\s\S]*?)<\/think>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(raw)) !== null) {
    if (m[1]) out.push(m[1]);
  }
  const lastOpen = raw.lastIndexOf('<think>');
  const lastClose = raw.lastIndexOf('</think>');
  if (lastOpen !== -1 && lastClose < lastOpen) {
    const tail = raw.slice(lastOpen + '<think>'.length);
    if (tail) out.push(tail);
  }
  return out.join('\n\n');
}

export interface CombineThinkingTextOptions {
  /** Explicit divider; when omitted the i18n key is resolved like before. */
  divider?: string;
}

/**
 * Combine reasoning_content deltas with inline <think> text for the
 * thinking panel snapshot. Returns whichever part exists, or both joined
 * by the divider when both exist.
 */
export function combineThinkingText(
  reasoning: unknown,
  full: unknown,
  options?: CombineThinkingTextOptions,
): string {
  const parts: string[] = [];
  if (reasoning) parts.push(String(reasoning));
  const thinkText = extractThinkText(full);
  if (thinkText) parts.push(thinkText);
  if (parts.length < 2) return parts.join('\n\n');
  let divider = options?.divider ?? INLINE_THINK_DIVIDER;
  if (options?.divider === undefined) {
    try {
      const w = (globalThis as { window?: { t?: unknown } }).window;
      if (typeof w !== 'undefined' && typeof w.t === 'function') {
        const d = (w.t as (key: string) => unknown)('think.inlineThinkDivider');
        if (d && d !== 'think.inlineThinkDivider') divider = String(d);
      }
    } catch {
      /* i18n lookup is best effort; keep the default divider. */
    }
  }
  return parts[0] + '\n\n' + divider + '\n\n' + parts[1];
}
