/* KaTeX heuristics and tolerant render helpers shared by Markdown passes. */
import { KATEX_MACROS, _looksLikeLatex } from './helpers.js';
import { ensureKatex, onKatexReady } from '../vendor/lazy.js';

interface KatexLike {
  renderToString: (
    math: string,
    opts: {
      displayMode: boolean;
      throwOnError: boolean;
      macros?: Record<string, string>;
      strict?: 'ignore' | 'warn' | 'error';
    },
  ) => string;
}

let _katexRerenderArmed = false;

export function getKatex(): KatexLike | undefined {
  const katex = (globalThis as { katex?: KatexLike }).katex;
  if (!katex) {
    /* P_perf-lazy-katex — KaTeX ships after first paint; when a renderer
       hits math before it arrives, arm a one-shot re-render so the same
       message repaints with real formulas once the module loads. */
    try { ensureKatex(); } catch (_) { /* ignore */ }
    if (!_katexRerenderArmed) {
      _katexRerenderArmed = true;
      try {
        onKatexReady(() => {
          if (typeof window === 'undefined') return;
          const rerender = (window as unknown as { __socratesRerenderMath?: () => void }).__socratesRerenderMath;
          if (typeof rerender === 'function') {
            try { rerender(); } catch (_) { /* ignore */ }
          }
        });
      } catch (_) { /* ignore */ }
    }
  }
  return katex;
}

/* ── Streaming-safe math ──────────────────────────────────────────
   KaTeX is an all-or-nothing parser: a formula that is still arriving
   (`\frac{1}{`, an unclosed `\begin{aligned}`…) either throws or
   renders its broken tail as red `.katex-error` spans. On a stream
   frame both are wrong:
     • a throw makes the live bubble fall back to raw LaTeX source,
     • red error spans make a half-typed formula look like a crash.
   The helpers below turn "incomplete" into a calm, stable state and
   make the completed render a seamless continuation of it:
     • closeUnclosedEnvironments appends the missing `\end{…}` so an
       aligned / matrix block renders the rows typed so far, live;
     • neutralizeKatexErrors strips the red class/style from the
       remaining parse-error spans — their raw source text stays
       visible, dimmed by the .math-stream-pending CSS rule;
     • renderStreamMath renders strict-first (a complete formula comes
       out in one pass) and degrades to the tolerant preview only on
       the frames where the formula is genuinely unfinished. */

function closeUnclosedEnvironments(src: string): string {
  const begins = src.match(/\\begin\{([^}]+)\}/g) || [];
  const ends = src.match(/\\end\{([^}]+)\}/g) || [];
  const openNames: string[] = [];
  begins.forEach(function (b) { openNames.push(b.slice(7, -1)); });
  ends.forEach(function (e) {
    const name = e.slice(5, -1);
    for (let k = openNames.length - 1; k >= 0; k--) {
      if (openNames[k] === name) { openNames.splice(k, 1); break; }
    }
  });
  let closed = src;
  for (let i = openNames.length - 1; i >= 0; i--) {
    closed += '\n\\end{' + openNames[i] + '}';
  }
  return closed;
}

function neutralizeKatexErrors(html: string): string {
  if (html.indexOf('katex-error') === -1) return html;
  return html.replace(/<span class="katex-error"([^>]*)>([\s\S]*?)<\/span>/g,
    function (_m, attrs: string, inner: string) {
      return '<span class="math-stream-pending"' +
        String(attrs)
          .replace(/\s+style="[^"]*"/g, '')
          .replace(/\s+title="[^"]*"/g, '') +
        '>' + inner + '</span>';
    });
}

/* Inline math is often written with no explicit operator: `x^2`,
   `a_i`, `\alpha`, or a bare symbol like `D`. The shared _looksLikeLatex
   heuristic only fires on commands or operator+letter pairs, which left
   simple formulas such as `$D$`, `$x$` or `$P(x,y)$` as raw text.
   Broaden the check for the inline cases:
     • explicit LaTeX syntax (`^`, `_`, braces, brackets) still counts;
     • a compact, whitespace-free token counts once it carries an ASCII
       letter. Bare alphabetic runs must be a single symbol (`D`, `x`),
       ALL CAPS (`AB`, `ABC` — point/segment labels), or a capital-led
       identifier (`Oxyz`, `Ox` — coordinate-system labels; `Abc` —
       point labels). All-lowercase words (`only`, `home`) stay literal,
       so currency amounts (`$5`, `$1,000`) and prose fragments (`$5 and`)
       keep their text.
       Known cosmetic trade-off: a capitalized English word deliberately
       wrapped in dollars (`$Only$`, `$Note$`) now renders as math —
       LLMs essentially never emit that shape except as a math
       identifier, while coordinate labels like `$Oxyz$` are ubiquitous
       in Chinese math output. Uppercase acronyms (`$US$`, `$OK$`)
       and punctuated tokens (`$N/A$`, `$P(x,y)$`) render as math.
       The fullwidth `，；：、` sit in the class so Chinese-model output
       like `$x，y$` parses the same way `$x,y$` does. */
const COMPACT_MATH_RE = /^[\w\\{}^_()[\],.'"+\-*/|=<>!:;，；：、]+$/;

/* Function calls are the common inline formula that carries internal
   whitespace (`u(x, y)`, `f(x, y, z)`, `sin(x, y)`). The callee must
   be attached to the opening paren and at most four ASCII letters long,
   so prose inside dollars (`$5 (approx)`, `paid in $USD (about`) stays
   literal. Whitespace inside the argument list is fine. */
const SPACED_MATH_CHARS_RE = /^[A-Za-z0-9\s\\{}^_()[\],.'"+\-*/|=<>!:;，；：、]+$/;
const SPACED_CALL_RE = /^[A-Za-z][A-Za-z0-9]{0,3}\(/;

/* Whitespace inside `$…$` also appears in symbol lists that are not
   calls: `x, y`, `a_1, a_2, …`, `f(x), g(y)`, `x； y`. Every
   space-separated word must itself be a compact math token AND at
   least one non-final word must END with a comma-like separator —
   a connector floating inside a word (`$USD (about` — the `(` of a
   prose aside) does not make a list, so spaced prose (`$5 USD$`,
   `$note see above$`) keeps its literal text. */
const MATH_SEPARATOR_RE = /[,;，；：、:]$/;
/* A standalone operator word (`x | y`, `a => b`) is list evidence too;
   a connector embedded inside a word (`(about`) is not. */
const MATH_OPERATOR_WORD_RE = /^[=+\-*/|<>]+$/;

function _isSpacedMathList(trimmed: string): boolean {
  /* A letter is required so a spaced currency amount (`$5, 000`) stays
     literal on BOTH the live tail and the closed pass — a tail that
     rendered live but reverted at the closing `$` would flash. */
  if (!/[A-Za-z]/.test(trimmed)) return false;
  const words = trimmed.split(/\s+/);
  let hasSeparator = false;
  for (let i = 0; i < words.length; i++) {
    if (!_isCompactMathToken(words[i])) return false;
    if ((i < words.length - 1 && MATH_SEPARATOR_RE.test(words[i]))
        || MATH_OPERATOR_WORD_RE.test(words[i])) {
      hasSeparator = true;
    }
  }
  return hasSeparator;
}

function _isCompactMathToken(trimmed: string): boolean {
  if (!COMPACT_MATH_RE.test(trimmed)) return false;
  /* Non-letter characters (digits, parens, operators) mark real math. */
  if (/[^A-Za-z]/.test(trimmed)) return true;
  if (trimmed.length === 1 || /^[A-Z]+$/.test(trimmed)) return true;
  /* Capital-led identifiers (`Oxyz`, `Ox`, `Abc`): coordinate-system and
     point labels. Both guards above already ran, so reaching here means
     an all-letter token of length 2+ that is neither single nor ALL
     CAPS — it renders only when it starts with a capital AND carries a
     lowercase letter, keeping all-lowercase prose (`only`, `tax`) and
     lowercase-led camelCase (`xMax`) literal. */
  return /^[A-Z]/.test(trimmed) && /[a-z]/.test(trimmed);
}

export function _looksLikeInlineMath(s: string): boolean {
  if (_looksLikeLatex(s)) return true;
  const trimmed = String(s).trim();
  if (!trimmed) return false;
  if (/[\\^_{}[\]]/.test(trimmed)) return true;
  if (!/[A-Za-z]/.test(trimmed)) return false;
  if (!/\s/.test(trimmed)) return _isCompactMathToken(trimmed);
  /* `x, y`-style symbol lists and spaced calls (`u(x, y)`) both count. */
  return _isSpacedMathList(trimmed)
    || (SPACED_CALL_RE.test(trimmed)
      && SPACED_MATH_CHARS_RE.test(trimmed)
      && trimmed.indexOf(')') > 0);
}

/* P_numeric-math — letter-free formulas: `$1/2$`, `$3+4=7$`, `$2^{10}$`,
   `$-1$`, `$0.5$`, `$5$`. The letter-based heuristics above reject them all,
   yet Chinese-model output writes plain numbers and fractions in dollars
   constantly. Currency is the risk (`$5 到 $10`, `$5-$10`, `$1,000`), so this
   follows pandoc's tex_math_dollars rule, which separates the two by
   position rather than by content:
     • the opening `$` is followed, and the closing `$` preceded, by a
       non-space character (`$5 到 $` fails);
     • the closing `$` is not followed by a digit (`$5-$10` fails);
   plus: only digits, whitespace and math punctuation inside (any CJK or
   prose word fails), at least one digit, and no dangling binary operator at
   either end (`5-`, `/2`). */
const NUMERIC_MATH_CHARS_RE = /^[0-9\s.,+\-*/^_=<>()[\]{}|!%:×÷±∓≤≥≠≈∞√°′″·\u2212]+$/;
const NUMERIC_MATH_BAD_EDGE_RE = /^[*/^_=<>,:+]|[+\-*/^_=<>,:\u2212]$/;

export function _looksLikeNumericMath(raw: string, next: string): boolean {
  if (!raw || /^\s|\s$/.test(raw)) return false;
  if (/[0-9]/.test(next || '')) return false;
  if (!NUMERIC_MATH_CHARS_RE.test(raw) || !/[0-9]/.test(raw)) return false;
  return !NUMERIC_MATH_BAD_EDGE_RE.test(raw);
}

/* Closed `$…$` acceptance shared by the streaming and final passes. `next`
   is the character right after the closing `$`. */
function _acceptInlineMath(raw: string, next: string): boolean {
  return _looksLikeInlineMath(String(raw).trim()) || _looksLikeNumericMath(raw, next);
}

/* Closed inline `$…$` replacement, shared by the streaming and final passes.

   A lazy `/\$(.+?)\$/` pairs dollars strictly left to right and consumes
   BOTH delimiters even when the candidate is rejected, so one currency
   amount swallowed the next formula's opening `$` (`花了 $5，概率 $1/2$`
   paired `$5，概率 $` and left `1/2$` as text). This scanner hands back only
   the opening `$` on a rejection and retries from the next character.
   `$$` runs are display-math delimiters and never open or close inline
   math; an escaped `\$` never opens. `multiline` (the final pass) lets a
   formula wrap a single newline but never cross a blank line. */
export function replaceInlineDollarMath(
  s: string,
  multiline: boolean,
  render: (math: string) => string | null,
): string {
  let out = '';
  let i = 0;
  const isEscaped = (k: number): boolean => {
    let bs = 0;
    for (let j = k - 1; j >= 0 && s.charAt(j) === '\\'; j--) bs++;
    return bs % 2 === 1;
  };
  for (let open = s.indexOf('$', i); open !== -1; open = s.indexOf('$', i)) {
    if (s.charAt(open + 1) === '$') {
      /* Skip the whole `$$…` run. */
      let k = open;
      while (s.charAt(k) === '$') k++;
      out += s.slice(i, k);
      i = k;
      continue;
    }
    if (isEscaped(open)) {
      out += s.slice(i, open + 1);
      i = open + 1;
      continue;
    }
    let close = -1;
    for (let j = open + 1; j < s.length; j++) {
      const c = s.charAt(j);
      if (c === '\\') { j++; continue; }
      if (c === '\n' && (!multiline || s.charAt(j + 1) === '\n')) break;
      if (c === '$') {
        if (s.charAt(j + 1) !== '$') close = j;
        break;
      }
    }
    if (close > open + 1) {
      const math = s.slice(open + 1, close);
      const html = _acceptInlineMath(math, s.charAt(close + 1)) ? render(math) : null;
      if (html !== null) {
        out += s.slice(i, open) + html;
        i = close + 1;
        continue;
      }
    }
    out += s.slice(i, open + 1);
    i = open + 1;
  }
  return out + s.slice(i);
}

/* A formula whose closing `$` has not arrived yet. Multi-letter words
   after a stray `$` are almost always prose (`paid in $USD`), so only
   single symbols, punctuation-carrying tokens and capital-led
   identifiers (`$Oxyz`) render live; `$AB` waits one token for its
   closing `$` and then renders through the closed pass. An open function
   call (`$u(x, y`) renders live because the attached callee+paren is
   already unambiguous. */
/* A plain lowercase word (3+ letters, not a `\command`) in a spaced tail is
   prose after a currency amount (`$5+ tax`, `$10 and`), not a formula. */
const TAIL_PROSE_WORD_RE = /(?:^|[^\\A-Za-z])[a-z]{3,}(?![A-Za-z(])/;

export function _looksLikeInlineMathTail(s: string): boolean {
  const trimmed = String(s).trim();
  if (!trimmed) return false;
  if (/\s/.test(trimmed) && !/\\/.test(trimmed) && TAIL_PROSE_WORD_RE.test(trimmed)) return false;
  if (_looksLikeLatex(s)) return true;
  if (/[\\^_{}[\]]/.test(trimmed)) return true;
  if (/\s/.test(trimmed)) {
    /* Same widening as the closed pass: `$x, y` renders live while a
       spaced prose tail (`$5 USD`) still waits for its closing `$`. */
    return _isSpacedMathList(trimmed)
      || (SPACED_CALL_RE.test(trimmed) && SPACED_MATH_CHARS_RE.test(trimmed));
  }
  /* P_numeric-math — an unclosed letter-free formula renders live only when a
     fraction / power / equation operator already marks it (`$1/2`, `$3+4=7`);
     a bare amount (`$5`, `$1,000`) waits for its closing `$`, so currency on
     the live tail never flashes as math. */
  if (!/[A-Za-z]/.test(trimmed)) {
    return /[/^=]/.test(trimmed) && _looksLikeNumericMath(trimmed, '');
  }
  if (!COMPACT_MATH_RE.test(trimmed)) return false;
  if (/[^A-Za-z]/.test(trimmed) || trimmed.length === 1) return true;
  /* Mirror the closed pass for capital-led identifiers (`$Oxyz` renders
     while it streams, so the closing `$` never pops a formula in).
     ALL CAPS still waits for its closing `$`: an unclosed `$USD` is far
     more likely the start of `$USD (about …` prose than a point label,
     and a tail that rendered live but reverted at the close would flash. */
  return /^[A-Z]/.test(trimmed) && /[a-z]/.test(trimmed);
}

/* Inline code spans are opaque: a `$D$` or `\alpha` behind backticks is
   literal code, not a formula. preprocessMarkdown restores the spans
   before returning, so stash them across the KaTeX passes and put them
   back before marked parses (restoring later would leave the backticks
   as visible text instead of letting marked build <code>). */
export function _stashInlineCode(source: string): { text: string; restore: (s: string) => string } {
  const stash: string[] = [];
  const text = source.replace(/`[^`\n]+`/g, function (m) {
    const id = stash.length;
    stash.push(m);
    return '\x01CODE' + id + '\x01';
  });
  return {
    text,
    restore: (s: string) => s.replace(/\x01CODE(\d+)\x01/g, function (_m, id: string) {
      return stash[Number(id)];
    }),
  };
}

/* PERF — KaTeX memo. A formula sitting in the live tail is re-rendered on
   every paint frame, and renderToString output is deterministic in
   (source, displayMode, unclosed). A small insertion-ordered map turns
   repeat frames into hits; misses are NOT cached so a formula rendered
   before KaTeX loads still produces real math on the next frame. */
const _mathHtmlCache = new Map<string, string>();
const MATH_HTML_CACHE_MAX = 200;

/* Render math for a possibly-unfinished stream frame. Returns the KaTeX
   HTML, or null when KaTeX is not available yet (the caller keeps the
   raw source so the one-shot re-render can fix it up later). */
export function renderStreamMath(math: string, displayMode: boolean, unclosed: boolean): string | null {
  const cacheKey = (displayMode ? 'D' : 'i') + (unclosed ? 'U' : 'C') + '\x00' + String(math).trim();
  const hit = _mathHtmlCache.get(cacheKey);
  if (hit !== undefined) return hit;
  const html = _renderStreamMath(math, displayMode, unclosed);
  if (html !== null) {
    if (_mathHtmlCache.size >= MATH_HTML_CACHE_MAX) {
      const oldest = _mathHtmlCache.keys().next();
      if (!oldest.done) _mathHtmlCache.delete(oldest.value);
    }
    _mathHtmlCache.set(cacheKey, html);
  }
  return html;
}

function _renderStreamMath(math: string, displayMode: boolean, unclosed: boolean): string | null {
  const katex = getKatex();
  if (typeof katex === 'undefined') return null;
  const opts = {
    displayMode,
    throwOnError: true,
    macros: KATEX_MACROS,
    strict: 'ignore' as const,
  };
  const render = (source: string, tolerant: boolean): string =>
    katex.renderToString(source, tolerant ? { ...opts, throwOnError: false } : opts);

  let source = String(math).trim();
  /* Complete, valid math — the common case — renders in one pass. */
  try {
    return render(source, false);
  } catch (_) { /* incomplete or malformed — tolerant passes below */ }

  if (unclosed) {
    /* Auto-close `\begin{aligned} …` so the rows typed so far render
       live instead of hiding behind the missing `\end{aligned}`. */
    const closed = closeUnclosedEnvironments(source);
    try {
      return render(closed, false);
    } catch (_) { /* still structurally incomplete */ }
    source = closed;
  }

  /* Tolerant pass: KaTeX recovers by marking the broken tail with
     .katex-error spans; neutralize them so the frame reads as calm,
     dimmed live math instead of a red error message. */
  try {
    return neutralizeKatexErrors(render(source, true));
  } catch (_) {
    return null;
  }
}

