/* ── HTML / attribute escaping shared by the markdown renderer ──
   These are deliberately separate from util/safe.js because they
   produce HTML-safe text intended for innerHTML (escapeHtml in
   safe.js also escapes single-quote, which is correct for JS strings
   but the renderer's helpers follow the existing calling conventions
   in the 600-line formatMsg function). */

export function esc(s){if(s==null)return"";return String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;")}

export function escAttr(s){return String(s||"").replace(/&/g,"&amp;").replace(/"/g,"&quot;").replace(/</g,"&lt;").replace(/>/g,"&gt;")}

export function escHTML(s){return String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;")}

export function decodeEntities(s){
  return s.replace(/&lt;/g,"<").replace(/&gt;/g,">").replace(/&quot;/g,'"').replace(/&apos;/g,"'").replace(/&amp;/g,"&");
}
export function stripTags(s){return s.replace(/<[^>]+>/g,"")}

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
export function safeHljsLang(lang) {
  var l = (lang || '').toLowerCase().trim();
  if (!l) return '';
  try {
    if (typeof hljs !== 'undefined' && typeof hljs.getLanguage === 'function') {
      if (!hljs.getLanguage(l)) return '';
    }
  } catch (_) { /* hljs missing or threw — fall through and keep the lang */ }
  return l;
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
export var KATEX_MACROS={
  /* divergence / grad / curl / set operators */
  "\\div":"\\operatorname{div}",
  "\\curl":"\\operatorname{curl}",
  "\\grad":"\\operatorname{grad}",
  "\\laplacian":"\\nabla^2",
  /* number sets */
  "\\R":"\\mathbb{R}",
  "\\N":"\\mathbb{N}",
  "\\Z":"\\mathbb{Z}",
  "\\Q":"\\mathbb{Q}",
  "\\C":"\\mathbb{C}",
  /* differential / calculus glyphs */
  "\\eps":"\\varepsilon",
  "\\ve":"\\varepsilon",
  "\\dd":"\\operatorname{d}",
  "\\d":"\\operatorname{d}",
  "\\e":"\\mathrm{e}",
  "\\i":"\\mathrm{i}",
  "\\pd":"\\partial",
  /* matrix / tensor algebra */
  "\\T":"\\top",
  "\\tr":"\\operatorname{tr}",
  "\\Tr":"\\operatorname{Tr}",
  "\\rank":"\\operatorname{rank}",
  "\\im":"\\operatorname{im}",
  "\\re":"\\operatorname{Re}",
  /* statistics */
  "\\Var":"\\operatorname{Var}",
  "\\Cov":"\\operatorname{Cov}",
  "\\sd":"\\operatorname{sd}",
  "\\Pr":"\\operatorname{Pr}",
  "\\E":"\\operatorname{\\mathbb{E}}",
  /* optimization / set notation */
  "\\argmin":"\\operatorname{argmin}",
  "\\argmax":"\\operatorname{argmax}",
  "\\sgn":"\\operatorname{sgn}",
  "\\supp":"\\operatorname{supp}",
  "\\Span":"\\operatorname{span}",
  "\\diag":"\\operatorname{diag}",
  "\\proj":"\\operatorname{proj}",
  "\\per":"\\perp",
   "\\U":"\\cup",
   "\\union":"\\cup",
   "\\intersection":"\\cap",
  /* math-textbook shorthands added for Tutor mode */
  "\\norm":"\\lVert #1 \\rVert",
  "\\inner":"\\langle #1, #2 \\rangle",
  "\\abs":"\\lvert #1 \\rvert",
  "\\set":"\\{ #1 \\}",
  "\\seq":"(#1)_{#2}",
  "\\st":"\\text{ s.t. }",
  "\\suchthat":"\\text{ s.t. }",
  "\\iff":"\\Leftrightarrow",
  "\\mapsfrom":"\\mapsfrom",
  "\\O":"\\mathcal{O}",
  "\\bigO":"\\mathcal{O}",
  "\\land":"\\wedge",
  "\\lor":"\\vee",
  /* common log / trig operators (text form so they read consistently) */
  "\\exp":"\\operatorname{exp}",
  "\\ln":"\\operatorname{ln}",
  "\\log":"\\operatorname{log}",
  /* ── Dirac / linear-algebra shorthands ──
     Quantum mechanics and group/representation-theory students ask
     for these constantly; defining them locally avoids a fork of
     the physics package. */
  "\\ket":"\\lvert #1 \\rangle",
  "\\bra":"\\langle #1 \\rvert",
  "\\braket":"\\langle #1 \\rvert #2 \\rangle",
  "\\mel":"\\langle #1 \\rvert #2 \\rvert #3 \\rangle",
  "\\op":"\\operatorname{#1}",
  "\\id":"\\operatorname{id}",
  "\\Ad":"\\operatorname{Ad}",
  "\\GL":"\\operatorname{GL}",
  "\\SL":"\\operatorname{SL}",
  "\\SO":"\\operatorname{SO}",
  "\\SU":"\\operatorname{SU}",
  "\\End":"\\operatorname{End}",
  "\\Hom":"\\operatorname{Hom}",
  "\\adj":"\\operatorname{adj}",
  "\\col":"\\operatorname{col}",
  "\\row":"\\operatorname{row}",
  "\\nul":"\\operatorname{null}",
  /* \Span and \im already defined above (lines 47, 61) — don't
     redefine to avoid duplicate-key warnings in strict linters. */
  /* ── Calculus / PDE shorthands ──
     \dv{f}{x}    df/dx
     \pdv{f}{x}   ∂f/∂x
     \ddv{f}{x}   d²f/dx²
     \ppdv{f}{x}  ∂²f/∂x²
     \fdv{f}{x}   δf/δx (functional derivative)
     Each takes 2 args (#1 numerator, #2 denominator). */
  "\\dv":"\\frac{\\mathrm{d} #1}{\\mathrm{d} #2}",
  "\\pdv":"\\frac{\\partial #1}{\\partial #2}",
  "\\ddv":"\\frac{\\mathrm{d}^{2} #1}{\\mathrm{d} #2^{2}}",
  "\\ppdv":"\\frac{\\partial^{2} #1}{\\partial #2^{2}}",
  "\\fdv":"\\frac{\\delta #1}{\\delta #2}",
  /* ── Order / commutator shorthands ──
     \order{n}    O(n)
     \comm{A}{B}  [A,B]
     \acomm{A}{B} {A,B} (anticommutator) */
  "\\order":"\\mathcal{O}\\left(#1\\right)",
  "\\comm":"\\left[#1, #2\\right]",
  "\\acomm":"\\left\\{#1, #2\\right\\}",
  /* ── Bracket-shortcut macros (left/right auto-paired) ──
     \lbr{x}    (x)
     \lcr{x}    {x}
     \labs{x}   |x|
     \lnorm{x}  ‖x‖
     \lavg{x}   ⟨x⟩
     These save typing \left( \right) when no auto-sizing is needed. */
  "\\lbr":"\\left( #1 \\right)",
  "\\lcr":"\\left\\{ #1 \\right\\}",
  "\\labs":"\\left\\lvert #1 \\right\\rvert",
  "\\lnorm":"\\left\\lVert #1 \\right\\rVert",
  "\\lavg":"\\left\\langle #1 \\right\\rangle",
  /* ── Strikethrough workaround (\cancel) ──
     KaTeX 0.16 dropped the contrib/cancel extension. The naive
     `\overset{\text{\sout{\,}}}{x}` only strikes through a `\,`
     thin-space, not the real width of `x`, which looks broken and
     confuses readers. We keep only `\cancelto` (a clean overset
     that always rendered correctly) and leave the diagonal/horiz
     strikes to the user: `\not{x}` produces a small slash that
     reads as "negated/canceled" for most symbols, and KaTeX
     native `\sout{...}` is available for the rare case that
     really needs a horizontal line through text. The whitelist
     below no longer matches `cancel|xcancel|bcancel` since they
     no longer expand to anything. */
  "\\cancelto":"\\overset{#1}{#2}",
};

/* LaTeX command whitelist used by _autoWrapBareBracketMath to
   distinguish math content from markdown links, list checkboxes,
   citations, etc. Match any of these commands as a substring.
   Expanded in 2026-07 to cover the accent set, stretchy accents,
   matrices, arrow macros, and box/color commands that KaTeX ships
   out of the box — so the heuristic stops misclassifying bare
   bracket/paren math from weak models. */
export var LATEX_COMMANDS_RE = /\\(frac|int|sum|prod|partial|nabla|sqrt|mathcal|mathrm|mathbf|mathit|boldsymbol|text|textbf|textit|varepsilon|alpha|beta|gamma|delta|theta|lambda|mu|pi|sigma|phi|omega|tau|to|infty|cdotp|cdot|times|div|pm|leq|geq|neq|approx|equiv|sim|propto|leftarrow|rightarrow|Leftarrow|Rightarrow|leftrightarrow|Leftrightarrow|in|notin|subset|supset|cup|cap|emptyset|mathbb|binom|over|underline|hat|bar|vec|tilde|dot|ddot|acute|grave|breve|check|mathring|widehat|widetilde|overrightarrow|overleftarrow|Overrightarrow|overleftrightarrow|widecheck|overbrace|underbrace|overline|fbox|boxed|textcolor|color|cancelto|xrightarrow|xleftarrow|stackrel|overset|underset|matrix|pmatrix|bmatrix|Bmatrix|vmatrix|Vmatrix|cases|begin|end|small|large|left|right|big|Big|bigg|Bigg|displaystyle|textstyle|scriptstyle|scriptscriptstyle)/;

/* Heuristic: a block of text looks like LaTeX if it contains (a) any
   LaTeX command, OR (b) at least one math operator (=, +, −, ×,
   etc.) AND at least one letter. The second branch catches simple
   expressions like "x = 1" that have no LaTeX commands but are
   clearly math. */
export var MATH_OPERATOR_RE = /[=+\-×÷≤≥≠→←⇒⇔∫∑∏∂√∞∈∉⊂⊃±∓]/;
export var HAS_LETTER_RE = /[a-zA-Z\\]/;

export function _looksLikeLatex(s) {
  if (LATEX_COMMANDS_RE.test(s)) return true;
  if (MATH_OPERATOR_RE.test(s) && HAS_LETTER_RE.test(s)) return true;
  return false;
}

/* Detect bare `[ ... ]` and `( ... )` math lines that weak models
   frequently emit. See the comment in preprocessMarkdown for the full
   description. Idempotent. */
export function _autoWrapBareBracketMath(s) {
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

/* Detect and fix a GFM table separator row.
   See the comment in preprocessMarkdown for the full description.
   Idempotent. */
export function fixMarkdownTableSeparators(s) {
  var lines = s.split('\n');
  for (var i = 1; i < lines.length; i++) {
    var prev = lines[i - 1];
    var cur = lines[i];
    if (!/\|/.test(prev)) continue;
    if (!/^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)*\|?\s*$/.test(cur)) continue;
    var headerCells = prev.replace(/^\s*\|/, '').replace(/\|\s*$/, '').split('|').length;
    var sepCells = cur.replace(/^\s*\|/, '').replace(/\|\s*$/, '').split('|');
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
