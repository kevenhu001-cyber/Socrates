/* math — DOM-free math segmentation plus citation/footnote cleanup
 * for assistant prose. Ports the delimiter contract of the web baseline
 * (`renderMathInElement` with `$$..$$` display + `$..$` inline, plus the
 * `\(..\)` / `\[..\]` forms the citation stripper already protects):
 *
 * - code (fenced + inline) is matched first in a single left-to-right
 *   scan, so `a[i]` indexing, `$5` prices and `$(cmd)` shell snippets
 *   never become formulas;
 * - `$..$` additionally requires a TeX-ish inner (a letter, backslash or
 *   symbol) so `$5` / `$5.99` stay literal, and the closer may not follow
 *   whitespace so `$5 and $10` survives;
 * - explicit delimiters (`$$`, `\(`, `\[`) trust author intent and only
 *   require non-empty content.
 *
 * Citations: `stripCitationMarkers` ports `frontend/src/render/helpers.ts`
 * (assistant bubbles never show `[1]`/`【1】` noise — sources live in the
 * search tool card). Footnote definitions (`[^id]: text`) are lifted into
 * a Notes section; inline refs become `[n]` so the number still points at
 * the note. All functions are pure string transforms. */

export type ContentSegment =
  | { kind: 'prose'; text: string }
  | { kind: 'math'; tex: string; display: boolean };

export interface Footnote {
  id: string;
  text: string;
}

/* Inline `$..$` is only math when the inner carries TeX content: a letter,
 * a backslash command, or a formula symbol. Pure numbers/punctuation
 * (`$5`, `$5.99`, `$...$`) stay literal prose. */
const TEX_INNER_RE = /[a-zA-Z\\^_{}=+\-*/()[\]|<>&]/;

function isInlineMath(inner: string): boolean {
  const trimmed = inner.trim();
  if (!trimmed) return false;
  // The closer may not follow whitespace (`$5 and $10` stays literal).
  if (/\s$/.test(inner)) return false;
  return TEX_INNER_RE.test(trimmed);
}

/* One left-to-right pass: code alternatives come first so fenced blocks
 * and inline code are copied into the prose buffer verbatim and their
 * `$` characters never reach the math matchers. Display `$$..$$` may span
 * lines; inline forms may not. */
const SEGMENT_RE = /(```[\s\S]*?(?:```|$))|(`[^`\n]+`)|(\$\$([\s\S]+?)\$\$)|(\\\[([\s\S]+?)\\\])|(\\\(([\s\S]+?)\\\))|(\$([^$\n]+?)\$)/g;

/** Split text into prose/math segments. Code spans are never math. */
export function splitMathSegments(input: string): ContentSegment[] {
  const source = String(input ?? '');
  if (!source) return [];
  const segments: ContentSegment[] = [];
  let prose = '';
  const flushProse = () => {
    if (prose !== '') segments.push({ kind: 'prose', text: prose });
    prose = '';
  };
  SEGMENT_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  let last = 0;
  while ((match = SEGMENT_RE.exec(source)) !== null) {
    const [full, fence, inlineCode, displayDollar, displayTex, displayBracket, bracketTex, inlineParen, parenTex, inlineDollar, dollarTex] = match;
    const at = match.index;
    const copyThrough = () => { prose += source.slice(last, at + full.length); last = at + full.length; };
    if (fence !== undefined || inlineCode !== undefined) {
      copyThrough();
      continue;
    }
    const tex = (displayTex ?? bracketTex ?? parenTex ?? dollarTex ?? '').trim();
    const display = displayTex !== undefined || displayBracket !== undefined;
    if (!tex) {
      copyThrough();
      continue;
    }
    if (inlineDollar !== undefined) {
      // Adjacent `$$` belongs to display math; a lone closer never opens.
      if (full.startsWith('$$') || source[at + full.length] === '$') {
        copyThrough();
        continue;
      }
      if (!isInlineMath(dollarTex ?? '')) {
        copyThrough();
        continue;
      }
    }
    prose += source.slice(last, at);
    last = at + full.length;
    flushProse();
    segments.push({ kind: 'math', tex, display });
  }
  prose += source.slice(last);
  flushProse();
  return segments;
}

/* P_strip-citations — port of frontend/src/render/helpers.ts. Removes
 * [1] / [2,3] / [1][2][3] / 【1】 web-search markers from assistant prose.
 * One left-to-right pass: code and math alternatives come first, so they
 * are copied through verbatim and their brackets never reach the citation
 * matcher. Markdown links `[1](url)`, reference definitions `[1]: url`
 * and `[[1]]` runs survive. Idempotent. */
const CITE_RE = /(```[\w-]*\n?[\s\S]*?```)|(`[^`\n]+`)|(\\\[[\s\S]+?\\\])|(\\\([\s\S]+?\\\))|(\$[^$\n]+\$)|([ \t]?((?:[【\[]\d{1,3}(?:\s*[,，\-–~]\s*\d{1,3}){0,3}[】\]])+)(?!\s*[(（:\[]))/g;

// Every group in a run must pair the same bracket style; a stray "[1】"
// or mixed "[1】【2]" stays as-is.
const CITE_RUN_RE = /^(?:\[\d{1,3}(?:\s*[,，\-–~]\s*\d{1,3}){0,3}\]|【\d{1,3}(?:\s*[,，\-–~]\s*\d{1,3}){0,3}】)+$/;

export function stripCitationMarkers(input: string): string {
  const source = String(input ?? '');
  if (source.indexOf('[') === -1 && source.indexOf('【') === -1) return source;
  CITE_RE.lastIndex = 0;
  let out = '';
  let last = 0;
  let match: RegExpExecArray | null;
  while ((match = CITE_RE.exec(source)) !== null) {
    const run = match[7];
    if (run === undefined) continue;
    out += source.slice(last, match.index);
    last = match.index + match[0].length;
    out += CITE_RUN_RE.test(run) ? '' : match[0];
  }
  return out + source.slice(last);
}

const FOOTNOTE_DEF_RE = /^\[\^([^\]]+)\]:[ \t]*(.+)$/gm;

/** Lift `[^id]: text` definitions out of the body; inline `[^id]` refs
 * become `[n]` pointing at the Notes section. Unknown refs are untouched. */
export function extractFootnoteDefinitions(input: string): { body: string; notes: Footnote[] } {
  const source = String(input ?? '');
  const notes: Footnote[] = [];
  const seen = new Map<string, number>();
  const body = source
    .replace(FOOTNOTE_DEF_RE, (_m, id: string, text: string) => {
      const key = id.trim();
      if (!seen.has(key)) {
        seen.set(key, notes.length + 1);
        notes.push({ id: key, text: text.trim() });
      }
      return '';
    })
    .replace(/\[\^([^\]]+)\]/g, (m, id: string) => {
      const n = seen.get(id.trim());
      return n === undefined ? m : `[${n}]`;
    })
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  return { body, notes };
}
