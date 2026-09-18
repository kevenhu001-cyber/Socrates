/**
 * Syntax highlighting for fenced code blocks — the RN counterpart of the web
 * client, which lazy-loads vendored highlight.js and styles it with the fixed
 * One Dark CSS bundled into `styles.css` (`frontend/src/vendor/lazy.js`,
 * `frontend/src/render/markdown.ts` `safeHljsLang`).
 *
 * highlight.js is a pure-JS tokenizer, so it runs fine in Hermes; we use the
 * core build with a curated language set (js/ts/python/json/bash/css/html
 * plus their aliases) instead of the web's full vendored bundle to keep the
 * mobile app size down. The emitted HTML is parsed into flat `{text, scope}`
 * runs that `CodeBlock` maps to nested `<Text>` spans.
 *
 * Mobile's `codeBg` is theme-aware, so the palette flips: One Dark on dark
 * (matching the web exactly), Atom One Light on light.
 */
import hljs from 'highlight.js/lib/core';
import javascript from 'highlight.js/lib/languages/javascript';
import typescript from 'highlight.js/lib/languages/typescript';
import python from 'highlight.js/lib/languages/python';
import json from 'highlight.js/lib/languages/json';
import bash from 'highlight.js/lib/languages/bash';
import css from 'highlight.js/lib/languages/css';
import xml from 'highlight.js/lib/languages/xml';

hljs.registerLanguage('javascript', javascript);
hljs.registerLanguage('typescript', typescript);
hljs.registerLanguage('python', python);
hljs.registerLanguage('json', json);
hljs.registerLanguage('bash', bash);
hljs.registerLanguage('css', css);
hljs.registerLanguage('xml', xml);

/* Fence tag → registered grammar. Mirrors `safeHljsLang` in
 * `frontend/src/render/helpers.ts`: unknown tags return '' and the block
 * falls back to plain mono text. */
const LANG_ALIASES: Record<string, string> = {
  js: 'javascript',
  jsx: 'javascript',
  mjs: 'javascript',
  cjs: 'javascript',
  javascript: 'javascript',
  ts: 'typescript',
  tsx: 'typescript',
  mts: 'typescript',
  cts: 'typescript',
  typescript: 'typescript',
  py: 'python',
  python: 'python',
  python3: 'python',
  json: 'json',
  jsonc: 'json',
  json5: 'json',
  sh: 'bash',
  bash: 'bash',
  zsh: 'bash',
  shell: 'bash',
  console: 'bash',
  css: 'css',
  html: 'xml',
  xml: 'xml',
  vue: 'xml',
  svg: 'xml',
  xhtml: 'xml',
};

export function highlightLanguage(lang: string): string {
  const key = (lang || '').trim().toLowerCase();
  const resolved = LANG_ALIASES[key] || key;
  return hljs.getLanguage(resolved) ? resolved : '';
}

export interface HlToken {
  text: string;
  /** hljs scope without the `hljs-` prefix (e.g. `keyword`), null = plain. */
  scope: string | null;
}

function decodeEntity(entity: string): string {
  switch (entity) {
    case 'amp': return '&';
    case 'lt': return '<';
    case 'gt': return '>';
    case 'quot': return '"';
    case 'apos': return "'";
    default:
      if (entity.startsWith('#x')) return String.fromCodePoint(parseInt(entity.slice(2), 16));
      if (entity.startsWith('#')) return String.fromCodePoint(parseInt(entity.slice(1), 10));
      return `&${entity};`;
  }
}

const OPEN_TAG = /^<span class="([^"]+)">/;
const CLOSE_TAG = /^<\/span>/;
const TAG_OR_ENTITY = /[<&]/g;

/**
 * Parse `hljs.highlight(...).value` (escaped HTML with `<span class="hljs-*">`
 * markers) into flat text runs carrying their innermost scope. Nested spans —
 * e.g. `title` inside `class` — collapse to the leaf scope, which is what the
 * web CSS effectively targets via `hljs-title.class_` rules.
 */
export function parseHighlightedHtml(html: string): HlToken[] {
  const tokens: HlToken[] = [];
  const scopes: string[] = [];
  let pos = 0;
  const push = (raw: string) => {
    if (!raw) return;
    const scope = scopes.length ? scopes[scopes.length - 1] : null;
    const prev = tokens[tokens.length - 1];
    if (prev && prev.scope === scope) {
      prev.text += raw;
    } else {
      tokens.push({ text: raw, scope });
    }
  };
  while (pos < html.length) {
    TAG_OR_ENTITY.lastIndex = pos;
    const hit = TAG_OR_ENTITY.exec(html);
    const next = hit ? hit.index : html.length;
    if (next > pos) push(html.slice(pos, next));
    if (!hit) break;
    if (hit[0] === '&') {
      const end = html.indexOf(';', next + 1);
      if (end !== -1 && end - next < 12) {
        push(decodeEntity(html.slice(next + 1, end)));
        pos = end + 1;
      } else {
        push('&');
        pos = next + 1;
      }
      continue;
    }
    const rest = html.slice(next);
    const open = OPEN_TAG.exec(rest);
    if (open) {
      const classes = open[1].split(/\s+/);
      const cls = classes.find((c) => c.startsWith('hljs-') && c !== 'hljs');
      scopes.push(cls ? cls.slice(5) : classes.join(' ').replace(/^hljs-/, ''));
      pos = next + open[0].length;
      continue;
    }
    if (CLOSE_TAG.test(rest)) {
      scopes.pop();
      pos = next + 7;
      continue;
    }
    push('<');
    pos = next + 1;
  }
  return tokens;
}

export function highlightCode(code: string, lang: string): HlToken[] | null {
  const grammar = highlightLanguage(lang);
  if (!grammar) return null;
  try {
    const { value } = hljs.highlight(code, { language: grammar, ignoreIllegals: true });
    return parseHighlightedHtml(value);
  } catch {
    return null;
  }
}

export interface HlStyle {
  color?: string;
  fontStyle?: 'italic';
  fontWeight?: '700';
}

/* Scope → colour, matching the web's bundled One Dark stylesheet
 * (`frontend/dist/assets/style-*.css`, the `hljs-*` rules) and its Atom One
 * Light counterpart for the light theme's pale `codeBg`. `classTitle` is the
 * `.hljs-title.class_` compound — hljs emits it as scope `class_` nested
 * under `title`, which `parseHighlightedHtml` collapses to `class_`. */
const DARK: Record<string, string> = {
  comment: '#5c6370',
  quote: '#5c6370',
  doctag: '#c678dd',
  keyword: '#c678dd',
  'template-tag': '#c678dd',
  formula: '#c678dd',
  section: '#e06c75',
  name: '#e06c75',
  'selector-tag': '#e06c75',
  deletion: '#e06c75',
  subst: '#e06c75',
  literal: '#56b6c2',
  string: '#98c379',
  regexp: '#98c379',
  addition: '#98c379',
  attribute: '#98c379',
  'meta string': '#98c379',
  attr: '#d19a66',
  variable: '#d19a66',
  'template-variable': '#d19a66',
  type: '#d19a66',
  'selector-class': '#d19a66',
  'selector-attr': '#d19a66',
  'selector-pseudo': '#d19a66',
  number: '#d19a66',
  symbol: '#61aeee',
  bullet: '#61aeee',
  link: '#61aeee',
  meta: '#61aeee',
  'selector-id': '#61aeee',
  title: '#61aeee',
  built_in: '#e6c07b',
  class_: '#e6c07b',
  params: '#abb2bf',
};

const LIGHT: Record<string, string> = {
  comment: '#a0a1a7',
  quote: '#a0a1a7',
  doctag: '#a626a4',
  keyword: '#a626a4',
  'template-tag': '#a626a4',
  formula: '#a626a4',
  section: '#e45649',
  name: '#e45649',
  'selector-tag': '#e45649',
  deletion: '#e45649',
  subst: '#e45649',
  literal: '#0184bb',
  string: '#50a14f',
  regexp: '#50a14f',
  addition: '#50a14f',
  attribute: '#50a14f',
  'meta string': '#50a14f',
  attr: '#986801',
  variable: '#986801',
  'template-variable': '#986801',
  type: '#986801',
  'selector-class': '#986801',
  'selector-attr': '#986801',
  'selector-pseudo': '#986801',
  number: '#986801',
  symbol: '#4078f2',
  bullet: '#4078f2',
  link: '#4078f2',
  meta: '#4078f2',
  'selector-id': '#4078f2',
  title: '#4078f2',
  built_in: '#c18401',
  class_: '#c18401',
  params: '#383a42',
};

export function hlStyleFor(scope: string | null, isDark: boolean): HlStyle {
  if (!scope) return {};
  const palette = isDark ? DARK : LIGHT;
  const style: HlStyle = {};
  if (palette[scope]) style.color = palette[scope];
  if (scope === 'comment' || scope === 'quote' || scope === 'emphasis') style.fontStyle = 'italic';
  if (scope === 'strong') style.fontWeight = '700';
  return style;
}

/* Streaming-safe memo cache: messages re-render on every delta and code
 * blocks re-tokenize on each pass, so cache the parsed runs by code+lang.
 * Bounded — old entries are evicted rather than growing per-message. */
const CACHE_LIMIT = 120;
const cache = new Map<string, HlToken[] | null>();

export function highlightedTokens(code: string, lang: string): HlToken[] | null {
  const key = `${lang}${code}`;
  if (cache.has(key)) return cache.get(key) ?? null;
  const tokens = highlightCode(code, lang);
  cache.set(key, tokens);
  if (cache.size > CACHE_LIMIT) {
    const oldest = cache.keys().next();
    if (!oldest.done) cache.delete(oldest.value);
  }
  return tokens;
}
