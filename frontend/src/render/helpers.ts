/* ── HTML / attribute escaping shared by the markdown renderer ──
   These are deliberately separate from util/safe.js because they
   produce HTML-safe text intended for innerHTML (escapeHtml in
   safe.js also escapes single-quote, which is correct for JS strings
   but the renderer's helpers follow the existing calling conventions
   in the 600-line formatMsg function). */

export function esc(s: unknown): string {
  if (s == null) return '';
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export function escAttr(s: unknown): string {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export function escHTML(s: unknown): string {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export function decodeEntities(s: string): string {
  return s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');
}

export function stripTags(s: string): string {
  return s.replace(/<[^>]+>/g, '');
}

/* P_strip-citations — remove [1] / [2,3] / [1][2][3] / 【1】 style web-search
   citation markers from assistant prose.
 *
 * The system prompt forbids these markers, but models add them anyway, and
 * the reader sees raw "[1]" noise in the answer body. Sources stay visible
 * in the search tool card, so the markers carry no information we need.
 *
 * Protected content (never stripped):
 *   • fenced code blocks and `inline code` — stashed first;
 *   • \(..\), \[..\] and $..$ math — a[1] indexing must survive.
 *
 * Also left intact:
 *   • markdown links `[1](https://…)` and reference definitions `[1]: url`
 *     (negative lookahead on `(` / `:`);
 *   • `[`-prefixed runs like `[[1]]`.
 *
 * Idempotent: stripping an already-stripped string is a no-op, so both the
 * streaming preprocessor and the final pass can call it every frame.
 */
export function stripCitationMarkers(s: string): string {
  let t = String(s ?? '');
  if (t.indexOf('[') === -1 && t.indexOf('【') === -1) return t;
  const stash: string[] = [];
  const keep = (html: string): string => {
    const id = stash.length;
    stash.push(html);
    return '\x01CITE' + id + '\x01';
  };
  /* Protect code and math spans before touching brackets. */
  t = t.replace(/```[\w-]*\n?[\s\S]*?```/g, keep);
  t = t.replace(/`[^`\n]+`/g, keep);
  t = t.replace(/\\\[[\s\S]+?\\\]/g, keep);
  t = t.replace(/\\\([\s\S]+?\\\)/g, keep);
  t = t.replace(/\$[^$\n]+\$/g, keep);
  /* The marker itself: one number, or 2–4 numbers joined by , ， - – ~.
     A `+` run consumes adjacent markers like "[1][2][3]" in one match —
     scanning per-marker would stop after the first because the preceding
     character of "[2]" is the "]" of "[1]", which the previous match
     already consumed. Up to one space before the run is consumed with it,
     so "with [1]." becomes "with." not "with .". A following "(" or ":"
     cancels the strip so markdown links "[1](url)" and reference
     definitions "[1]: url" survive. */
  t = t.replace(/[ \t]?((?:[\[【]\d{1,3}(?:\s*[,，\-–~]\s*\d{1,3}){0,3}[\]】])+)(?!\s*[(（:\[])/g,
    (m, run: string) => {
      // Every group must pair the same bracket style; a stray "[1】" or
      // mixed "[1】【2]" run stays as-is.
      const ok = /^(?:\[\d{1,3}(?:\s*[,，\-–~]\s*\d{1,3}){0,3}\]|【\d{1,3}(?:\s*[,，\-–~]\s*\d{1,3}){0,3}】)+$/.test(String(run));
      return ok ? '' : m;
    });
  return t.replace(/\x01CITE(\d+)\x01/g, (_m, id: string) => stash[Number(id)]);
}

/* P_hljs-unknown-lang — validate a code-fence language tag against
   the highlight.js instance on the page. Returns the lowercase tag
   when hljs.getLanguage(name) recognises it; returns '' otherwise
   so the caller emits `<pre><code>` without a `language-*` class and
   hljs falls back to no-highlight silently. Used by:
     • render/markdown.js — when parsing ``` fences in the markdown
       renderer, drops unknown tags before they reach the DOM.
     • main.js — a monkey-patch around hljs.highlightElement that
       strips `language-*` classes from already-rendered DOM, so the
       same safety net covers raw HTML the model emits without going
       through the markdown renderer. */
export function safeHljsLang(lang: string): string {
  const l = (lang || '').toLowerCase().trim();
  if (!l) return '';
  try {
    const hljs = (globalThis as { hljs?: { getLanguage?: (name: string) => unknown } }).hljs;
    if (hljs && typeof hljs.getLanguage === 'function') {
      if (!hljs.getLanguage(l)) return '';
    }
  } catch (_) { /* hljs missing or threw — fall through and keep the lang */ }
  return l;
}

/* P_viz-font-ready — wait for the document fonts (Inter, Noto Sans SC,
   KaTeX…) to actually load before a renderer measures text. Without
   this, ECharts/Plotly/Mermaid/sandboxed iframes compute their first
   layout with the fallback font, so CJK characters render at the
   wrong width and titles clip on the very first paint. When `family`
   is given, force-load that face so the resolved Promise guarantees
   it is usable (otherwise the browser can keep it unloaded). */
export function whenFontsReady(family?: string): Promise<void> {
  const fonts = (document as Document & { fonts?: FontFaceSet }).fonts;
  if (!fonts || typeof fonts.ready !== 'object') return Promise.resolve();
  let ready: Promise<unknown> = fonts.ready;
  if (family) {
    try {
      const force: Promise<unknown> = fonts.load(`12px "${family}"`);
      ready = Promise.all([ready, force]).then(() => undefined);
    } catch (_) { /* family unknown to the platform — fall through */ }
  }
  return ready.then(() => undefined, () => undefined);
}

/* ── KaTeX macros and config ──
   \div → \operatorname{div}   (divergence, not ÷)
   \curl → \operatorname{curl} (curl)
   \grad → \operatorname{grad} (gradient)
   \laplacian → \nabla^2
   \R/\N/\Z/\Q/\C → \mathbb{...} (number sets)
   Plus math-textbook shorthands: \norm, \inner, \abs, \set, \d, \e, \i,
   \O, \st, \iff, \Pr, \sd, etc.
   Plus Dirac / linear-algebra / calculus shorthands for Tutor mode. */
export const KATEX_MACROS: Record<string, string> = {
  /* divergence / grad / curl / set operators */
  '\\div': '\\operatorname{div}',
  '\\curl': '\\operatorname{curl}',
  '\\grad': '\\operatorname{grad}',
  '\\laplacian': '\\nabla^2',
  /* number sets */
  '\\R': '\\mathbb{R}',
  '\\N': '\\mathbb{N}',
  '\\Z': '\\mathbb{Z}',
  '\\Q': '\\mathbb{Q}',
  '\\C': '\\mathbb{C}',
  /* differential / calculus glyphs */
  '\\eps': '\\varepsilon',
  '\\ve': '\\varepsilon',
  '\\dd': '\\operatorname{d}',
  '\\d': '\\operatorname{d}',
  '\\e': '\\mathrm{e}',
  '\\i': '\\mathrm{i}',
  '\\pd': '\\partial',
  /* matrix / tensor algebra */
  '\\T': '\\top',
  '\\tr': '\\operatorname{tr}',
  '\\Tr': '\\operatorname{Tr}',
  '\\rank': '\\operatorname{rank}',
  '\\im': '\\operatorname{im}',
  '\\re': '\\operatorname{Re}',
  /* statistics */
  '\\Var': '\\operatorname{Var}',
  '\\Cov': '\\operatorname{Cov}',
  '\\sd': '\\operatorname{sd}',
  '\\Pr': '\\operatorname{Pr}',
  '\\E': '\\operatorname{\\mathbb{E}}',
  /* optimization / set notation */
  '\\argmin': '\\operatorname{argmin}',
  '\\argmax': '\\operatorname{argmax}',
  '\\sgn': '\\operatorname{sgn}',
  '\\supp': '\\operatorname{supp}',
  '\\Span': '\\operatorname{span}',
  '\\diag': '\\operatorname{diag}',
  '\\proj': '\\operatorname{proj}',
  '\\per': '\\perp',
  '\\U': '\\cup',
  '\\union': '\\cup',
  '\\intersection': '\\cap',
  /* math-textbook shorthands added for Tutor mode */
  '\\norm': '\\lVert #1 \\rVert',
  '\\inner': '\\langle #1, #2 \\rangle',
  '\\abs': '\\lvert #1 \\rvert',
  '\\set': '\\{ #1 \\}',
  '\\seq': '(#1)_{#2}',
  '\\st': '\\text{ s.t. }',
  '\\suchthat': '\\text{ s.t. }',
  '\\iff': '\\Leftrightarrow',
  '\\mapsfrom': '\\mapsfrom',
  '\\O': '\\mathcal{O}',
  '\\bigO': '\\mathcal{O}',
  '\\land': '\\wedge',
  '\\lor': '\\vee',
  /* common log / trig operators (text form so they read consistently) */
  '\\exp': '\\operatorname{exp}',
  '\\ln': '\\operatorname{ln}',
  '\\log': '\\operatorname{log}',
  /* ── Dirac / linear-algebra shorthands ──
     Quantum mechanics and group/representation-theory students ask
     for these constantly; defining them locally avoids a fork of
     the physics package. */
  '\\ket': '\\lvert #1 \\rangle',
  '\\bra': '\\langle #1 \\rvert',
  '\\braket': '\\langle #1 \\rvert #2 \\rangle',
  '\\mel': '\\langle #1 \\rvert #2 \\rvert #3 \\rangle',
  '\\op': '\\operatorname{#1}',
  '\\id': '\\operatorname{id}',
  '\\Ad': '\\operatorname{Ad}',
  '\\GL': '\\operatorname{GL}',
  '\\SL': '\\operatorname{SL}',
  '\\SO': '\\operatorname{SO}',
  '\\SU': '\\operatorname{SU}',
  '\\End': '\\operatorname{End}',
  '\\Hom': '\\operatorname{Hom}',
  '\\adj': '\\operatorname{adj}',
  '\\col': '\\operatorname{col}',
  '\\row': '\\operatorname{row}',
  '\\nul': '\\operatorname{null}',
  /* \Span and \im already defined above — don't redefine to avoid
     duplicate-key warnings in strict linters. */
  /* ── Calculus / PDE shorthands ──
     \dv{f}{x}    df/dx
     \pdv{f}{x}   ∂f/∂x
     \ddv{f}{x}   d²f/dx²
     \ppdv{f}{x}  ∂²f/∂x²
     \fdv{f}{x}   δf/δx (functional derivative)
     Each takes 2 args (#1 numerator, #2 denominator). */
  '\\dv': '\\frac{\\mathrm{d} #1}{\\mathrm{d} #2}',
  '\\pdv': '\\frac{\\partial #1}{\\partial #2}',
  '\\ddv': '\\frac{\\mathrm{d}^{2} #1}{\\mathrm{d} #2^{2}}',
  '\\ppdv': '\\frac{\\partial^{2} #1}{\\partial #2^{2}}',
  '\\fdv': '\\frac{\\delta #1}{\\delta #2}',
  /* ── Order / commutator shorthands ──
     \order{n}    O(n)
     \comm{A}{B}  [A,B]
     \acomm{A}{B} {A,B} (anticommutator) */
  '\\order': '\\mathcal{O}\\left(#1\\right)',
  '\\comm': '\\left[#1, #2\\right]',
  '\\acomm': '\\left\\{#1, #2\\right\\}',
  /* ── Bracket-shortcut macros (left/right auto-paired) ──
     \lbr{x}    (x)
     \lcr{x}    {x}
     \labs{x}   |x|
     \lnorm{x}  ‖x‖
     \lavg{x}   ⟨x⟩
     These save typing \left( \right) when no auto-sizing is needed. */
  '\\lbr': '\\left( #1 \\right)',
  '\\lcr': '\\left\\{ #1 \\right\\}',
  '\\labs': '\\left\\lvert #1 \\right\\rvert',
  '\\lnorm': '\\left\\lVert #1 \\right\\rVert',
  '\\lavg': '\\left\\langle #1 \\right\\rangle',
  /* ── Strikethrough workaround (\cancel) ──
     KaTeX 0.16 dropped the contrib/cancel extension. The naive
     `\overset{\text{\sout{\,}}}{x}` only strikes through a `\,`
     thin-space, not the real width of `x`, which looks broken and
     confuses readers. We keep only `\cancelto` (a clean overset
     that always rendered correctly) and leave the diagonal/horiz
     strikes to the user: `\not{x}` produces a small slash that
     reads as "negated/canceled" for most symbols, and KaTeX
     native `\sout{...}` is available for the rare case that
     really needs a horizontal line through text. */
  '\\cancelto': '\\overset{#1}{#2}',
};

/* LaTeX command whitelist used by _autoWrapBareBracketMath to
   distinguish math content from markdown links, list checkboxes,
   citations, etc. Match any of these commands as a substring.
   Expanded in 2026-07 to cover the accent set, stretchy accents,
   matrices, arrow macros, and box/color commands that KaTeX ships
   out of the box — so the heuristic stops misclassifying bare
   bracket/paren math from weak models. */
export const LATEX_COMMANDS_RE =
  /\\(frac|int|sum|prod|partial|nabla|sqrt|mathcal|mathrm|mathbf|mathit|boldsymbol|text|textbf|textit|varepsilon|alpha|beta|gamma|delta|theta|lambda|mu|pi|sigma|phi|omega|tau|to|infty|cdotp|cdot|times|div|pm|leq|geq|neq|approx|equiv|sim|propto|leftarrow|rightarrow|Leftarrow|Rightarrow|leftrightarrow|Leftrightarrow|in|notin|subset|supset|cup|cap|emptyset|mathbb|binom|over|underline|hat|bar|vec|tilde|dot|ddot|acute|grave|breve|check|mathring|widehat|widetilde|overrightarrow|overleftarrow|Overrightarrow|overleftrightarrow|widecheck|overbrace|underbrace|overline|fbox|boxed|textcolor|color|cancelto|xrightarrow|xleftarrow|stackrel|overset|underset|matrix|pmatrix|bmatrix|Bmatrix|vmatrix|Vmatrix|cases|begin|end|small|large|left|right|big|Big|bigg|Bigg|displaystyle|textstyle|scriptstyle|scriptscriptstyle)/;

/* Heuristic: a block of text looks like LaTeX if it contains (a) any
   LaTeX command, OR (b) at least one math operator (=, +, −, ×,
   etc.) AND at least one letter. The second branch catches simple
   expressions like "x = 1" that have no LaTeX commands but are
   clearly math. */
export const MATH_OPERATOR_RE = /[=+\-×÷≤≥≠→←⇒⇔∫∑∏∂√∞∈∉⊂⊃±∓]/;
export const HAS_LETTER_RE = /[a-zA-Z\\]/;

export function _looksLikeLatex(s: string): boolean {
  if (LATEX_COMMANDS_RE.test(s)) return true;
  if (MATH_OPERATOR_RE.test(s) && HAS_LETTER_RE.test(s)) return true;
  return false;
}

/* Detect bare `[ ... ]` and `( ... )` math lines that weak models
   frequently emit. See the comment in preprocessMarkdown for the full
   description. Idempotent. */
export function _autoWrapBareBracketMath(s: string): string {
  s = s.replace(/(^|\n)\[([\s\S]+?)\](?=\n|$)/g, function (m, lead, inner) {
    if (!_looksLikeLatex(inner)) return m;
    return lead + '\\[' + inner.trim() + '\\]';
  });
  s = s.replace(/(^|\n)\(([^()\n]+)\)(?=\n|$)/g, function (m, lead, inner) {
    if (!_looksLikeLatex(inner)) return m;
    return lead + '\\(' + inner.trim() + '\\)';
  });
  return s;
}

/* Weak models frequently omit the space after an ATX heading marker
   (`##标题`, `##**标题**`, `###一、…`). CommonMark requires that space,
   so marked renders the line as literal prose and the heading markers
   leak into the answer. Re-insert the space. Fenced code is skipped so
   `#include`-style lines and shell comments are never touched; a digit
   directly after the run also bails (`#1`, `#2`) because those read as
   prose enumerations far more often than as headings. Idempotent, so it
   is safe to run on every streaming frame. */
export function fixHeadingMarkers(s: string): string {
  const lines = String(s).split('\n');
  let inFence = false;
  let fenceChar = '';
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const fence = line.match(/^[ \t]{0,3}(`{3,}|~{3,})/);
    if (fence) {
      const ch = fence[1].charAt(0);
      if (!inFence) { inFence = true; fenceChar = ch; }
      else if (ch === fenceChar) { inFence = false; fenceChar = ''; }
      continue;
    }
    if (inFence) continue;
    lines[i] = line.replace(/^([ \t]{0,3})(#{1,6})(?=[^\s#\d])/, '$1$2 ');
  }
  return lines.join('\n');
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
    const headerCells = prev.replace(/^\s*\|/, '').replace(/\|\s*$/, '').split('|').length;
    const sepCells = cur.replace(/^\s*\|/, '').replace(/\|\s*$/, '').split('|');
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
