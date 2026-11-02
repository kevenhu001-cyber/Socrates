/* render/inlineMath.ts — one line of plain text with `$…$` / `\(…\)` formulas
 * typeset by the same KaTeX the chat uses (same macros, same tolerant
 * `$` scanner). Prose is escaped; nothing else is parsed as markdown, so a
 * mistake's stem or a follow-up question stays a single line of text.
 *
 * Returns null when the text has no formula (callers keep the plain
 * string) or when KaTeX is not loaded yet: `getKatex` starts the lazy load
 * and `onKatexReady` tells the caller to paint again. */
import { KATEX_MACROS, esc } from './helpers.ts';
import { getKatex, hasMathDelimiters, replaceInlineDollarMath } from './markdownMath.ts';

const TOKEN = '\u0000';

export function renderInlineMathHtml(text: string): string | null {
  const source = String(text ?? '');
  if (!hasMathDelimiters(source)) return null;
  const katex = getKatex(source);
  if (!katex) return null;
  const bank: string[] = [];
  const typeset = (math: string): string => {
    let html: string;
    try {
      html = katex.renderToString(math.trim(), { displayMode: false, throwOnError: false, macros: KATEX_MACROS });
    } catch {
      html = esc(math);
    }
    bank.push(html);
    return `${TOKEN}${bank.length - 1}${TOKEN}`;
  };
  // `$$…$$` stays on the line (inline mode) so a stem never grows a block.
  let marked = source.replace(/\$\$([\s\S]+?)\$\$/g, (_match, math: string) => typeset(math));
  marked = replaceInlineDollarMath(marked, false, typeset);
  marked = marked.replace(/\\\((.+?)\\\)|\\\[([\s\S]+?)\\\]/g, (_match, inline: string | undefined, block: string | undefined) => typeset(inline ?? block ?? ''));
  if (!bank.length) return null;
  const tokenRe = new RegExp(`${TOKEN}(\\d+)${TOKEN}`, 'g');
  return esc(marked).replace(tokenRe, (_match, index: string) => bank[Number(index)] ?? '');
}
