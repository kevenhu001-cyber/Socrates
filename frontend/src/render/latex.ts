/**
 * KaTeX macros and the bare-bracket math heuristic.
 */
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
