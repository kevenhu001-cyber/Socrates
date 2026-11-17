/**
 * Repairs for model-emitted Markdown that CommonMark rejects.
 */
/* Weak models frequently omit the space after an ATX heading marker
   (`##标题`, `##**标题**`, `###一、…`). CommonMark requires that space,
   so marked renders the line as literal prose and the heading markers
   leak into the answer. Re-insert the space. Fenced code is skipped so
   `#include`-style lines and shell comments are never touched; a digit
   directly after a 1–2 `#` run also bails (`#1`, `#2`) because those
   read as prose enumerations far more often than as headings. 3+ `#`
   followed by a digit (e.g. `###1. 方法`, `###1、特征方程法`) is almost
   always a heading with a missing space — `###1` as a reference is
   vanishingly rare — so the space is inserted there too. Idempotent,
   so it is safe to run on every streaming frame.

   The marker may also sit behind container prefixes — `> #标题` inside a
   blockquote and `- #标题` inside a list item are headings in CommonMark
   and need the same space. `＃` (fullwidth, common in Chinese-model
   output) normalizes to ASCII. A run of 7+ `#` is not a valid ATX marker
   at all, so it is capped at `######` (h6) — the model plainly meant a
   heading. A bare run on its own line (`#`, `##`) would parse as an
   EMPTY heading — an invisible h1–h6 whose margins read as a stray gap —
   so the hashes are escaped to literal text instead. Lines inside
   `$$…$$` / `\[…\]` display math are left alone: `#` there is a KaTeX
   parse error, not a heading. `#include`/`#!`-style unfenced code lines
   bail out via a small directive guard — a real heading virtually never
   reads `#include`. The container prefix takes one `>` per repeat rather
   than a `+` group of them: with the group form a `>\t>\t…` run had two
   ways to place each gap of whitespace and backtracked exponentially on
   every streaming frame. */
const HEADING_RUN_RE = /^([ \t]{0,3}(?:>[ \t]*|(?:[-*+]|\d{1,9}[.)])[ \t]+)*)([#＃]+)/;

/* heading shapes CommonMark rejects that models emit:

   • Invisible or non-ASCII lead-in: a zero-width space, BOM, word joiner,
     NBSP or fullwidth space (U+3000) before the marker. CommonMark only
     allows ASCII spaces there, so `<U+3000>## 标题` renders as prose.
   • Over-indented: a tab or 4+ spaces before the marker makes it an
     indented CODE block (`<pre>## 标题</pre>`). Models never use indented
     code (they fence it), so the line is dedented, unless the previous
     non-blank line is a list item or itself indented (the heading then
     legitimately nests, or it really is part of an indented code block).
   • Glued: the model dropped the newline before the heading, so it trails
     the previous sentence (`上文结束。## 标题`). A 2–6 `#` run right after
     sentence-ending punctuation, a closing formula dollar (`$F=ma$## 标题`,
     ubiquitous in physics derivations), a `》` / `]` close, or a CJK
     comma (`，`/`、`) is split onto its own line behind a blank line.
     The terminal class stays deliberately narrow — letters and digits
     never split, so prose like `a ## b` (macro token-pasting) and
     `见上文。##3 条` keep their text. A single `#` (`C# 语言`) and a
     run preceded by a letter/digit (`issue##3`) are left alone. */
/* Alternation, not a character class: ZWJ inside a class reads as a joined
   emoji sequence to eslint (no-misleading-character-class). */
const LEAD_INVISIBLE = '(?:\\u200b|\\u200c|\\u200d|\\u2060|\\ufeff|\\u00a0|\\u3000)';
const HEADING_LEAD_JUNK_RE = new RegExp(
  '^(?:' +
    LEAD_INVISIBLE +
    '|[ \\t])*' +
    LEAD_INVISIBLE +
    '(?:' +
    LEAD_INVISIBLE +
    '|[ \\t])*(?=[#＃])',
);
const HEADING_OVERINDENT_RE = /^(?:\t|[ ]{4,}|[ ]{0,3}\t)[ \t]*(?=[#＃]{1,6}[ \t]+\S)/;
const LIST_OR_INDENTED_RE = /^(?:[ \t]*(?:[-*+]|\d{1,9}[.)])[ \t]|\t|[ ]{4})/;
const BOLD_WRAPPED_HEADING_RE =
  /^([ \t]{0,3})(\*\*|__)[ \t]*(#{1,6}|＃{1,6})[ \t]*(\S.*?)[ \t]*\2[ \t]*$/;
/* `##4. 标题` / `##4、标题` — a numbered section title. `##3 条` stays prose. */
const NUMBERED_TITLE_RE = /^\d{1,3}[.．、)）]\s*\S/;
const GLUED_HEADING_RE =
  /^(.*?[。！？；：.!?;:…）)】」』”"*`~$》\]，、])[ \t]*((?:#{2,6}|＃{2,6})(?![#＃])[ \t]*[^\s#＃].*)$/;
const HEADING_DIRECTIVE_RE =
  /^(?:include|define|pragma|ifdef|ifndef|elif|else|endif|error|warning|line|undef|import|using|region|endregion|!)/;

interface HeadingScanState {
  inFence: boolean;
  fenceChar: string;
  inMath: boolean;
}

function consumeFenceLine(line: string, state: HeadingScanState): boolean {
  const fence = line.match(/^[ \t]{0,3}(`{3,}|~{3,})/);
  if (!fence) return false;
  const char = fence[1].charAt(0);
  if (!state.inFence) {
    state.inFence = true;
    state.fenceChar = char;
  } else if (char === state.fenceChar) {
    state.inFence = false;
    state.fenceChar = '';
  }
  return true;
}

function startsInsideMath(line: string, state: HeadingScanState): boolean {
  const dollarRun = (line.match(/\$\$/g) || []).length;
  const bracketDelta = (line.match(/\\\[/g) || []).length - (line.match(/\\\]/g) || []).length;
  const wasMath = state.inMath;
  if (dollarRun % 2 === 1 || bracketDelta !== 0) state.inMath = !state.inMath;
  return wasMath;
}

function repairWrappedHeading(lines: string[], index: number): boolean {
  const wrapped = lines[index].match(BOLD_WRAPPED_HEADING_RE);
  if (!wrapped) return false;
  lines[index] = wrapped[1] + wrapped[3] + ' ' + wrapped[4];
  return true;
}

function splitGluedHeading(lines: string[], index: number): boolean {
  const line = lines[index];
  if (/^[ \t]*\|/.test(line)) return false;
  const glued = line.match(GLUED_HEADING_RE);
  if (!glued || /^[ \t]*[#＃]/.test(line) || !/[^*_`~\s]/.test(glued[1])) return false;
  if (glued[2].charAt(2) !== ' ' && /^#{2}\d/.test(glued[2])) return false;
  lines.splice(index, 1, glued[1], '', glued[2]);
  return true;
}

function repairHeadingIndentation(lines: string[], index: number): void {
  if (HEADING_LEAD_JUNK_RE.test(lines[index])) {
    lines[index] = lines[index].replace(HEADING_LEAD_JUNK_RE, '');
    return;
  }
  if (!HEADING_OVERINDENT_RE.test(lines[index])) return;
  let previous = index - 1;
  while (previous >= 0 && !/\S/.test(lines[previous])) previous--;
  if (previous < 0 || !LIST_OR_INDENTED_RE.test(lines[previous])) {
    lines[index] = lines[index].replace(HEADING_OVERINDENT_RE, '');
  }
}

function repairHeadingRun(lines: string[], index: number): void {
  const match = lines[index].match(HEADING_RUN_RE);
  if (!match) return;
  const prefix = match[1];
  let run = match[2];
  const rest = lines[index].slice(match[0].length);
  /* Fullwidth `＃` normalizes even when the space is already present.
     Keep character-for-character parity for over-long, invalid runs. */
  if (run.indexOf('＃') !== -1) {
    run = run.replace(/＃/g, '#');
    lines[index] = prefix + run + rest;
  }
  if (!/\S/.test(rest)) {
    lines[index] = prefix + run.replace(/\\/g, '\\\\').replace(/#/g, '\\#');
    return;
  }
  if (/^[ \t]/.test(rest)) return;
  if (run.length <= 2 && /\d/.test(rest.charAt(0)) && !NUMBERED_TITLE_RE.test(rest)) return;
  if (HEADING_DIRECTIVE_RE.test(rest)) return;
  lines[index] = prefix + '#'.repeat(Math.min(run.length, 6)) + ' ' + rest;
}

function repairHeadingLine(lines: string[], index: number): boolean {
  const wrapped = repairWrappedHeading(lines, index);
  if (!wrapped && splitGluedHeading(lines, index)) return true;
  repairHeadingIndentation(lines, index);
  repairHeadingRun(lines, index);
  return false;
}

export function fixHeadingMarkers(s: string): string {
  const lines = String(s).split('\n');
  const state: HeadingScanState = { inFence: false, fenceChar: '', inMath: false };
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (consumeFenceLine(line, state) || state.inFence) continue;
    /* Display-math tracking: an odd `$$` count or an unbalanced `\[`
       toggles the region. Only lines that START inside the region are
       skipped — a `#标题 $$…` opener line is still prose up to the
       delimiter, so it keeps its heading repair. */
    if (startsInsideMath(line, state)) continue;
    /* A glued title inserts two lines; advance over the inserted blank so
       the same pass can repair the title line immediately. */
    if (repairHeadingLine(lines, i)) i++;
  }
  return lines.join('\n');
}

/* Weak models frequently emit bold the way Chinese IMEs type it:
    (`＊＊标题＊＊`, `＿＿标题＿＿`) or with a stray ASCII space just
    inside the markers (`** 标题**`, `**标题 **`, `__ 标题 __`).
    CommonMark parses none of those — the run leaks into the answer as
    literal `**` / `＿＿`, which reads as "加粗没有被渲染" on phrases
    like `**基尔霍夫电流定律（KCL）**`. Normalize the fullwidth runs to
    ASCII and trim the inner spaces so marked sees a valid emphasis
    pair. Fenced code and `inline code` are skipped so shell globs and
    `**` samples never change; only CLOSED pairs are touched, so a live
    tail with an unclosed `**` keeps waiting for its closer instead of
    flashing bold for one frame. Idempotent, so it is safe to run on
    every streaming frame. Single fullwidth `＊` (e.g. `2＊3` typed as
    multiplication) is left alone — only runs of 2+ can be bold. */
export function fixEmphasisMarkers(s: string): string {
  const stash: string[] = [];
  const keep = (m: string): string => {
    const id = stash.length;
    stash.push(m);
    return '\uE000SOCRATES_EM_' + id + '\uE001';
  };
  const lines = String(s ?? '')
    .replace(/`[^`\n]+`/g, keep)
    .split('\n');
  let inFence = false;
  let fenceChar = '';
  let inMath = false;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const fence = line.match(/^[ \t]{0,3}(`{3,}|~{3,})/);
    if (fence) {
      const ch = fence[1].charAt(0);
      if (!inFence) {
        inFence = true;
        fenceChar = ch;
      } else if (ch === fenceChar) {
        inFence = false;
        fenceChar = '';
      }
      continue;
    }
    if (inFence) continue;
    /* Same display-math tracking as fixHeadingMarkers: only lines that
       START inside the region are skipped. */
    const dollarRun = (line.match(/\$\$/g) || []).length;
    const bracketDelta = (line.match(/\\\[/g) || []).length - (line.match(/\\\]/g) || []).length;
    const wasMath = inMath;
    if (dollarRun % 2 === 1 || bracketDelta !== 0) inMath = !inMath;
    if (wasMath) continue;

    let out = line;
    out = out.replace(/＊{2,}/g, (m) => '*'.repeat(m.length));
    out = out.replace(/＿{2,}/g, (m) => '_'.repeat(m.length));
    /* No lookbehind (older WebViews lack it): the (^|[^*]) prefix keeps
       `***` triples out and is re-emitted verbatim. */
    out = out.replace(
      /(^|[^*])\*\*(?!\*)([^*\n]*?\S[^*\n]*?)\*\*(?!\*)/g,
      (m, pre: string, inner: string) => {
        const trimmed = inner.replace(/^[ \t]+/, '').replace(/[ \t]+$/, '');
        if (!trimmed || trimmed === inner) return m;
        return pre + '**' + trimmed + '**';
      },
    );
    out = out.replace(
      /(^|[^_])__(?!_)([^_\n]*?\S[^_\n]*?)__(?!_)/g,
      (m, pre: string, inner: string) => {
        const trimmed = inner.replace(/^[ \t]+/, '').replace(/[ \t]+$/, '');
        if (!trimmed || trimmed === inner) return m;
        return pre + '__' + trimmed + '__';
      },
    );
    lines[i] = out;
  }
  return lines
    .join('\n')
    .replace(/\uE000SOCRATES_EM_(\d+)\uE001/g, (_m, id: string) => stash[Number(id)]);
}

/* Detect and fix a GFM table separator row.
   See the comment in preprocessMarkdown for the full description.
   Idempotent. */
export function fixMarkdownTableSeparators(s: string): string {
  const lines = s.split('\n');
  for (let i = 1; i < lines.length; i++) {
    const prev = lines[i - 1];
    const cur = lines[i];
    if (!/\|/.test(prev)) continue;
    if (!/^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)*\|?\s*$/.test(cur)) continue;
    const headerCells = prev
      .replace(/^\s*\|/, '')
      .replace(/\|\s*$/, '')
      .split('|').length;
    const sepCells = cur
      .replace(/^\s*\|/, '')
      .replace(/\|\s*$/, '')
      .split('|');
    if (sepCells.length === headerCells) {
      if (!/\|/.test(cur.replace(/^\s*\|/, '').slice(-1)) || !/\|\s*$/.test(cur)) {
        lines[i] = cur.replace(/\s*$/, '') + ' |';
      }
      continue;
    }
    if (sepCells.length < headerCells) {
      while (sepCells.length < headerCells) sepCells.push(' --- ');
      lines[i] = '| ' + sepCells.join(' | ').trim() + ' |';
      continue;
    }
    if (sepCells.length > headerCells) {
      lines[i] = '| ' + sepCells.slice(0, headerCells).join(' | ').trim() + ' |';
    }
  }
  return lines.join('\n');
}
