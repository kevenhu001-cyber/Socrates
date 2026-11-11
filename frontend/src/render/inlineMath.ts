/* render/inlineMath.ts — one line of plain text with `$…$` / `\(…\)` formulas
 * typeset by the same KaTeX the chat uses (same macros, same tolerant
 * `$` scanner). Prose is escaped; after escaping, a minimal mark pass
 * turns `**bold**` into <strong> and `` `code` `` into <code>. Nothing else
 * is parsed as markdown (no links, lists or raw HTML), so a mistake's stem,
 * an exam question or a follow-up stays a single line of text.
 *
 * Returns null when the text has neither a formula nor a mark (callers keep
 * the plain string). With a formula and no mark it also returns null while
 * KaTeX is not loaded yet: `getKatex` starts the lazy load and
 * `onKatexReady` tells the caller to paint again. With a mark it paints the
 * marks right away and leaves a not-yet-typeset formula as escaped source. */
import { KATEX_MACROS, esc } from './helpers.ts';
import { getKatex, hasMathDelimiters, replaceInlineDollarMath } from './markdownMath.ts';

const TOKEN = '\u0000';
/* A closed single-line code span; its content is literal (no math, no bold). */
const CODE_RE = /`([^`\n]+)`/g;
/* `**…**` whose content neither starts nor ends with a space and does not
   cross a line. Runs on escaped text, so the content is already safe. */
const BOLD_RE = /\*\*(?=[^\s*])([^\n]*?[^\s*])\*\*/g;

function hasInlineMarks(text: string): boolean {
  CODE_RE.lastIndex = 0;
  BOLD_RE.lastIndex = 0;
  return CODE_RE.test(text) || BOLD_RE.test(text);
}

export function renderInlineMathHtml(text: string, output: 'htmlAndMathml' | 'mathml' = 'htmlAndMathml'): string | null {
  const source = String(text ?? '');
  const hasMath = hasMathDelimiters(source);
  const hasMarks = hasInlineMarks(source);
  if (!hasMath && !hasMarks) return null;
  const katex = hasMath ? getKatex(source) : undefined;
  if (!katex && !hasMarks) return null;
  const bank: string[] = [];
  const stash = (html: string): string => {
    bank.push(html);
    return `${TOKEN}${bank.length - 1}${TOKEN}`;
  };
  /* Formulas are stashed before the bold pass so a `*` inside one is never
     read as a mark. Without KaTeX the formula keeps its escaped source. */
  let typesetCount = 0;
  const typeset = (math: string, raw: string): string => {
    if (!katex) return stash(esc(raw));
    typesetCount += 1;
    let html: string;
    try {
      html = katex.renderToString(math.trim(), { displayMode: false, output, throwOnError: false, macros: KATEX_MACROS });
    } catch {
      html = esc(math);
    }
    return stash(html);
  };
  let marked = source.replace(CODE_RE, (_match, code: string) => stash(`<code>${esc(code)}</code>`));
  // `$$…$$` stays on the line (inline mode) so a stem never grows a block.
  marked = marked.replace(/\$\$([\s\S]+?)\$\$/g, (match, math: string) => typeset(math, match));
  marked = replaceInlineDollarMath(marked, false, (math) => typeset(math, `$${math}$`));
  marked = marked.replace(/\\\((.+?)\\\)|\\\[([\s\S]+?)\\\]/g, (match, inline: string | undefined, block: string | undefined) => typeset(inline ?? block ?? '', match));
  if (!typesetCount && !hasMarks) return null;
  const tokenRe = new RegExp(`${TOKEN}(\\d+)${TOKEN}`, 'g');
  return esc(marked)
    .replace(BOLD_RE, (_match, bold: string) => `<strong>${bold}</strong>`)
    .replace(tokenRe, (_match, index: string) => bank[Number(index)] ?? '');
}
