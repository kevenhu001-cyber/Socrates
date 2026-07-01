/* ── HTML / attribute escaping shared by the markdown renderer ──
   These are deliberately separate from util/safe.js because they
   produce HTML-safe text intended for innerHTML (escapeHtml in
   safe.js also escapes single-quote, which is correct for JS strings
   but the renderer's helpers follow the existing calling conventions
   in the 600-line formatMsg function). */

export function esc(s){if(s==null)return"";return String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;")}

export function escAttr(s){return String(s||"").replace(/&/g,"&amp;").replace(/"/g,"&quot;").replace(/</g,"&lt;").replace(/>/g,"&gt;")}

export function escHTML(s){return String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;")}

/* ── KaTeX macros and config ──
   \div → \operatorname{div}   (divergence, not ÷)
   \curl → \operatorname{curl} (curl)
   \grad → \operatorname{grad} (gradient)
   \laplacian → \nabla^2
   \R/\N/\Z/\Q/\C → \mathbb{...} (number sets)
   Plus math-textbook shorthands: \norm, \inner, \abs, \set, \d, \e, \i,
   \O, \st, \iff, \Pr, \sd, etc. */
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
};

/* LaTeX command whitelist used by _autoWrapBareBracketMath to
   distinguish math content from markdown links, list checkboxes,
   citations, etc. Match any of these commands as a substring. */
export var LATEX_COMMANDS_RE = /\\(frac|int|sum|prod|partial|nabla|sqrt|mathcal|mathrm|mathbf|mathit|boldsymbol|text|textbf|textit|varepsilon|alpha|beta|gamma|delta|theta|lambda|mu|pi|sigma|phi|omega|tau|to|infty|cdot|times|div|pm|leq|geq|neq|approx|equiv|sim|propto|leftarrow|rightarrow|Leftarrow|Rightarrow|leftrightarrow|Leftrightarrow|in|notin|subset|supset|cup|cap|emptyset|mathbb|binom|over|underline|hat|bar|vec|tilde|dot|ddot)/;

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
