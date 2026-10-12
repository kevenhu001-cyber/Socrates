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

/* Normalize common model-produced LaTeX that KaTeX does not accept as-is.
   Keep this deliberately narrow: it repairs syntax, not mathematical content. */
export function normalizeMathSource(math: string, displayMode: boolean): string {
  let source = String(math).trim();
  source = source
    .replace(/\\begin\{eqnarray\*?\}/g, '\\begin{aligned}')
    .replace(/\\end\{eqnarray\*?\}/g, '\\end{aligned}')
    .replace(/\\begin\{alignedat\}(?!\{)/g, '\\begin{alignedat}{2}')
    .replace(/\\label\{[^}]*\}/g, '');
  if (!displayMode) source = source.replace(/\\tag\*?\{[^}]*\}/g, '');
  return source;
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

const COMPACT_MATH_RE = /^[\w\\{}^_()[\],.'"+\-*/|=<>!:;，；：、]+$/;
const SPACED_MATH_CHARS_RE = /^[A-Za-z0-9\s\\{}^_()[\],.'"+\-*/|=<>!:;，；：、]+$/;
const SPACED_CALL_RE = /^[A-Za-z][A-Za-z0-9]{0,3}\(/;
const MATH_SEPARATOR_RE = /[,;，；：、:]$/;
const MATH_OPERATOR_WORD_RE = /^[=+\-*/|<>]+$/;

function _isSpacedMathList(trimmed: string): boolean {
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
  if (/[^A-Za-z]/.test(trimmed)) return true;
  if (trimmed.length === 1 || /^[A-Z]+$/.test(trimmed)) return true;
  return /^[A-Z]/.test(trimmed) && /[a-z]/.test(trimmed);
}

export function _looksLikeInlineMath(s: string): boolean {
  if (_looksLikeLatex(s)) return true;
  const trimmed = String(s).trim();
  if (!trimmed) return false;
  if (/[\\^_{}[\]]/.test(trimmed)) return true;
  if (!/[A-Za-z]/.test(trimmed)) return false;
  if (!/\s/.test(trimmed)) return _isCompactMathToken(trimmed);
  return _isSpacedMathList(trimmed)
    || (SPACED_CALL_RE.test(trimmed)
      && SPACED_MATH_CHARS_RE.test(trimmed)
      && trimmed.indexOf(')') > 0);
}

const NUMERIC_MATH_CHARS_RE = /^[0-9\s.,+\-*/^_=<>()[\]{}|!%:×÷±∓≤≥≠≈∞√°′″·\u2212]+$/;
const NUMERIC_MATH_BAD_EDGE_RE = /^[*/^_=<>,:+]|[+\-*/^_=<>,:\u2212]$/;

export function _looksLikeNumericMath(raw: string, next: string): boolean {
  if (!raw || /^\s|\s$/.test(raw)) return false;
  if (/[0-9]/.test(next || '')) return false;
  if (!NUMERIC_MATH_CHARS_RE.test(raw) || !/[0-9]/.test(raw)) return false;
  return !NUMERIC_MATH_BAD_EDGE_RE.test(raw);
}

function _acceptInlineMath(raw: string, next: string): boolean {
  return _looksLikeInlineMath(String(raw).trim()) || _looksLikeNumericMath(raw, next);
}

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

const TAIL_PROSE_WORD_RE = /(?:^|[^\\A-Za-z])[a-z]{3,}(?![A-Za-z(])/;

export function _looksLikeInlineMathTail(s: string): boolean {
  const trimmed = String(s).trim();
  if (!trimmed) return false;
  if (/\s/.test(trimmed) && !/\\/.test(trimmed) && TAIL_PROSE_WORD_RE.test(trimmed)) return false;
  if (_looksLikeLatex(s)) return true;
  if (/[\\^_{}[\]]/.test(trimmed)) return true;
  if (/\s/.test(trimmed)) {
    return _isSpacedMathList(trimmed)
      || (SPACED_CALL_RE.test(trimmed) && SPACED_MATH_CHARS_RE.test(trimmed));
  }
  if (!/[A-Za-z]/.test(trimmed)) {
    return /[/^=]/.test(trimmed) && _looksLikeNumericMath(trimmed, '');
  }
  if (!COMPACT_MATH_RE.test(trimmed)) return false;
  if (/[^A-Za-z]/.test(trimmed) || trimmed.length === 1) return true;
  return /^[A-Z]/.test(trimmed) && /[a-z]/.test(trimmed);
}

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

const _mathHtmlCache = new Map<string, string>();
const MATH_HTML_CACHE_MAX = 200;

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

  let source = normalizeMathSource(math, displayMode);
  try {
    return render(source, false);
  } catch (_) { /* incomplete or malformed — tolerant passes below */ }

  /* Environment closure is useful even when the surrounding $$/\\[ delimiter
     has already closed: models often finish the Markdown delimiter but omit
     the final \\end{...}. Only retry when closure actually changes the source. */
  const closed = closeUnclosedEnvironments(source);
  if (closed !== source) {
    try {
      return render(closed, false);
    } catch (_) { /* still structurally incomplete */ }
    source = closed;
  } else if (unclosed) {
    source = closed;
  }

  try {
    return neutralizeKatexErrors(render(source, true));
  } catch (_) {
    return null;
  }
}
