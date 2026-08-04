/* ── Markdown + math + viz message renderers ──
   formatMsgProgressive — streaming markdown renderer (called per
     animation frame during streaming).
   formatMsg — final one-shot renderer (called when the message is
     complete or during typeTick animation).
   formatTickSlice — convenience wrapper for the type-tick slider.
   All three exported for use by main.js / doRender / streaming. */

import { decodeEntities, esc, escAttr, escHTML, KATEX_MACROS, safeHljsLang, stripTags } from './helpers.js';
import { renderMermaid, renderViz, renderVizLoading, renderPlot } from './viz.js';
import { preprocessMarkdown, preprocessMarkdownForStreaming } from './preprocess.js';
import { stripChatArtifacts } from '../util/stripChatArtifacts.js';
import { sanitizeUrls } from '../util/safe.js';
/* M4 — bundled DOMPurify fallback. The CDN <script> in index.html is
   still preferred (shared global, SRI-pinned), but if it fails to load
   (offline, blocked CDN, flaky network) sanitisation used to silently
   degrade to sanitizeUrls — which only rewrites URLs and lets
   <img onerror=…>-style XSS through. The npm copy (same 3.2.4 version)
   guarantees a real sanitiser is always present. */
import bundledDomPurify from 'dompurify';

/* ── DOMPurify configuration ──────────────────────────────────────
   Used by both formatMsg and formatMsgProgressive to sanitise the
   rendered HTML before it reaches the DOM. See git history for the
   full rationale — kept identical to the JS source. */
const PURIFY_CONFIG: {
  ADD_TAGS: string[];
  ADD_ATTR: string[];
  ALLOWED_URI_REGEXP: RegExp;
  KEEP_CONTENT: boolean;
  RETURN_DOM_FRAGMENT: boolean;
  RETURN_DOM: boolean;
  FORBID_TAGS: string[];
  FORBID_ATTR: string[];
} = {
  ADD_TAGS: ['theorem', 'proof', 'key-point', 'derivation'],
  ADD_ATTR: ['target', 'rel'],
  ALLOWED_URI_REGEXP: /^(?:(?:https?|mailto):|[^a-z]|[a-z+.\-]+(?:[^a-z+.\-:]|$))/i,
  KEEP_CONTENT: true,
  RETURN_DOM_FRAGMENT: false,
  RETURN_DOM: false,
  FORBID_TAGS: ['script', 'style', 'iframe', 'object', 'embed', 'form',
                'meta', 'link', 'base', 'frame', 'frameset', 'noframes',
                'noscript', 'html', 'head', 'body'],
  FORBID_ATTR: ['onerror', 'onclick', 'onload', 'onmouseover', 'onfocus',
                'onblur', 'onchange', 'onsubmit', 'onkeydown', 'onkeyup',
                'onkeypress', 'onmousedown', 'onmouseup', 'onmousemove',
                'onmouseout', 'onmouseenter', 'onmouseleave', 'oninput',
                'onpointerdown', 'onpointerup', 'onanimationend',
                'onanimationstart', 'ontransitionend'],
};

interface DomPurifyLike {
  sanitize: (html: string, config?: unknown) => string;
}

/* Apply DOMPurify (CDN global first, bundled copy as fallback); only
   if both are unusable fall back to sanitizeUrls. */
function sanitizeHtml(html: string): string {
  const dp = (globalThis as { DOMPurify?: DomPurifyLike }).DOMPurify
    ?? (bundledDomPurify as unknown as DomPurifyLike);
  if (typeof dp !== 'undefined' && typeof dp.sanitize === 'function') {
    try {
      return dp.sanitize(html, PURIFY_CONFIG);
    } catch (e) {
      console.warn('[sanitizeHtml] DOMPurify failed, falling back:', e && (e as Error).message);
      return sanitizeUrls(html);
    }
  }
  return sanitizeUrls(html);
}

/* Stream-time scaffold plugins. */
interface StreamScaffoldPlugin {
  name: string;
  parse: (inner: string) => unknown;
  render: (parsed: unknown) => string | null;
}
let STREAM_SCAFFOLD_PLUGINS: StreamScaffoldPlugin[] = [];

const STREAM_SCAFFOLD_FALLBACK: Record<string, string> = {
  quiz: '[Quick Check]',
  example: '[Example]',
  practice: '[Practice]',
  definition: '[Definition]',
  step: '[Step]',
  flashcard: '[Flashcard]',
  proof: '[Proof]',
  theorem: '[Theorem]',
  'key-point': '[Key Point]',
  derivation: '[Derivation]',
};

export function registerStreamScaffold(
  name: string,
  parse: (inner: string) => unknown,
  render: (parsed: unknown) => string | null,
): void {
  STREAM_SCAFFOLD_PLUGINS = STREAM_SCAFFOLD_PLUGINS.filter(function (p) {
    return p.name !== name;
  });
  STREAM_SCAFFOLD_PLUGINS.push({ name, parse, render });
}

export function clearStreamScaffolds(): void {
  STREAM_SCAFFOLD_PLUGINS = [];
}

function findStreamScaffold(name: string): StreamScaffoldPlugin | null {
  for (let i = 0; i < STREAM_SCAFFOLD_PLUGINS.length; i++) {
    if (STREAM_SCAFFOLD_PLUGINS[i].name === name) return STREAM_SCAFFOLD_PLUGINS[i];
  }
  return null;
}

/* ------------------------------------------------------------------
 * Built-in scaffold previews
 *
 * The stream renderer used to replace every scaffold with a small text
 * badge until the final pass. That made a perfectly valid <key-point>
 * look like plain prose while it was arriving, and the React handoff
 * could preserve that temporary DOM forever. Keep the extension registry
 * above for custom tools, but give the Tutor scaffolds a tolerant,
 * incremental renderer here. It accepts both complete fields and fields
 * whose closing tag has not arrived yet.
 * ------------------------------------------------------------------ */

const STREAM_SCAFFOLD_CLASSES: Record<string, string> = {
  quiz: 'inline-quiz',
  example: 'inline-example',
  practice: 'inline-practice',
  definition: 'inline-definition',
  step: 'scaffold-stream',
  flashcard: 'inline-flashcard',
  proof: 'inline-proof',
  theorem: 'inline-theorem',
  'key-point': 'inline-key-point',
  derivation: 'inline-derivation',
};

function streamField(inner: string, name: string): string {
  const escapedName = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = String(inner || '').match(
    new RegExp('<' + escapedName + '\\b[^>]*>([\\s\\S]*?)(?:</' + escapedName + '>|$)', 'i'),
  );
  return match ? decodeEntities(match[1].trim()) : '';
}

function streamAttr(attrs: string, name: string): string {
  const attrRe = /([a-z][\w-]*)\s*=\s*(?:"([^"]*)"|'([^']*)')/gi;
  let match: RegExpExecArray | null;
  while ((match = attrRe.exec(String(attrs || ''))) !== null) {
    if (match[1].toLowerCase() === name.toLowerCase()) {
      return decodeEntities(match[2] ?? match[3] ?? '');
    }
  }
  return '';
}

function streamLeaf(inner: string): string {
  return decodeEntities(String(inner || '').trim());
}

function streamPlainPreview(inner: string): string {
  const text = stripTags(streamLeaf(inner));
  return text.length > 300 ? text.slice(0, 300) + '…' : text;
}

function renderStreamMarkdown(value: string, empty = '…'): string {
  const text = String(value || '').trim();
  if (!text) return '<span class="scaffold-stream-placeholder shimmer-text">' + escHTML(empty) + '</span>';
  try {
    return formatMsgProgressive(text);
  } catch (_) {
    return escHTML(text);
  }
}

function streamCard(tag: string, content: string): string {
  const cls = STREAM_SCAFFOLD_CLASSES[tag] || 'scaffold-stream';
  const label = STREAM_SCAFFOLD_FALLBACK[tag] || '[' + tag + ']';
  /* The interactive scaffolds (quiz / example / practice) render WITHOUT a
   * badge in the final mounted widget. Skipping the badge here keeps the
   * streaming preview pixel-compatible with the final render, so the
   * finish() swap is imperceptible instead of "a labelled card losing its
   * label". Static scaffolds (key-point, theorem, …) keep the badge —
   * their final widgets carry an equivalent label element. */
  const badge = (tag === 'quiz' || tag === 'example' || tag === 'practice')
    ? ''
    : '<span class="scaffold-stream-label">' + escHTML(label) + '</span>';
  return '<div class="' + cls + ' scaffold-stream-live" data-scaffold-live="' + escAttr(tag) + '">' +
    badge + content + '</div>';
}

function renderStreamScaffoldPreview(tag: string, inner: string, attrs = ''): string | null {
  if (!STREAM_SCAFFOLD_CLASSES[tag]) return null;

  if (tag === 'key-point') {
    return streamCard(tag,
      '<div class="inline-key-point-body">' + renderStreamMarkdown(streamLeaf(inner)) + '</div>');
  }

  if (tag === 'definition') {
    const term = streamField(inner, 'term');
    const body = streamField(inner, 'body');
    return streamCard(tag,
      '<div class="inline-definition-term">' + renderStreamMarkdown(term, 'Term') + '</div>' +
      '<div class="inline-definition-body">' + renderStreamMarkdown(body, 'Definition') + '</div>');
  }

  if (tag === 'example') {
    const title = streamField(inner, 'title') || 'Example';
    const problem = streamField(inner, 'problem');
    const solution = streamField(inner, 'solution');
    return streamCard(tag,
      '<div class="inline-example-title">' + renderStreamMarkdown(title) + '</div>' +
      '<div class="inline-example-problem">' + renderStreamMarkdown(problem, 'Problem') + '</div>' +
      (solution
        ? '<button type="button" class="inline-example-reveal" aria-disabled="true" tabindex="-1">Show solution</button>' +
          '<div class="inline-example-solution" hidden>' + renderStreamMarkdown(solution) + '</div>'
        : ''));
  }

  if (tag === 'practice') {
    const problem = streamField(inner, 'problem');
    const hint = streamField(inner, 'hint');
    return streamCard(tag,
      '<div class="inline-practice-problem">' + renderStreamMarkdown(problem, 'Problem') + '</div>' +
      (hint
        ? '<button type="button" class="inline-practice-hint-toggle" aria-disabled="true" tabindex="-1">Show hint</button>' +
          '<div class="inline-practice-hint" hidden>' + renderStreamMarkdown(hint) + '</div>'
        : '') +
      '<form class="inline-practice-form">' +
        '<textarea class="inline-practice-textarea" rows="3" placeholder="Type your answer…" aria-disabled="true" tabindex="-1"></textarea>' +
        '<div class="inline-practice-actions"><button type="button" class="inline-practice-submit" aria-disabled="true" tabindex="-1">Submit</button></div>' +
        '<div class="inline-practice-feedback"></div>' +
      '</form>');
  }

  if (tag === 'flashcard') {
    const front = streamField(inner, 'front');
    const back = streamField(inner, 'back');
    return streamCard(tag,
      '<div class="inline-flashcard-front">' + renderStreamMarkdown(front, 'Front') + '</div>' +
      (back ? '<div class="inline-flashcard-back">' + renderStreamMarkdown(back) + '</div>' : ''));
  }

  if (tag === 'theorem') {
    const title = streamField(inner, 'title');
    const statement = streamField(inner, 'statement');
    return streamCard(tag,
      (title ? '<div class="inline-theorem-title">' + renderStreamMarkdown(title) + '</div>' : '') +
      '<div class="inline-theorem-statement">' + renderStreamMarkdown(statement, 'Statement') + '</div>');
  }

  if (tag === 'proof') {
    const title = streamField(inner, 'title');
    const body = streamField(inner, 'body');
    return streamCard(tag,
      (title ? '<div class="inline-proof-title">' + renderStreamMarkdown(title) + '</div>' : '') +
      '<div class="inline-proof-body">' + renderStreamMarkdown(body, 'Proof') + '</div>');
  }

  if (tag === 'derivation') {
    const title = streamField(inner, 'title');
    const body = streamField(inner, 'body');
    return streamCard(tag,
      (title ? '<div class="inline-derivation-title">' + renderStreamMarkdown(title) + '</div>' : '') +
      '<div class="inline-derivation-body">' + renderStreamMarkdown(body, 'Derivation') + '</div>');
  }

  if (tag === 'step') {
    const n = streamAttr(attrs, 'n');
    const body = streamPlainPreview(inner);
    return streamCard(tag,
      '<span class="scaffold-stream-step-number">' + escHTML(n || '·') + '</span>' +
      (body ? escHTML(body) : '<span class="scaffold-stream-placeholder shimmer-text">…</span>'));
  }

  if (tag === 'quiz') {
    const q = streamField(inner, 'q');
    const options: string[] = [];
    const optionRe = /<o\s+letter=["']([A-Da-d])["'][^>]*>([\s\S]*?)(?:<\/o>|$)/gi;
    let match: RegExpExecArray | null;
    while ((match = optionRe.exec(inner)) !== null) {
      options.push('<button type="button" class="inline-quiz-opt" aria-disabled="true" tabindex="-1">' +
        '<span class="inline-quiz-opt-letter">' + escHTML(match[1].toUpperCase()) + '.</span>' +
        '<span class="inline-quiz-opt-text">' + renderStreamMarkdown(decodeEntities(match[2].trim())) + '</span></button>');
    }
    return streamCard(tag,
      '<div class="inline-quiz-q">' + renderStreamMarkdown(q, 'Question') + '</div>' +
      (options.length ? '<div class="inline-quiz-opts">' + options.join('') + '</div>' : '') +
      /* Final mounted quiz has an empty feedback div — mirror it exactly so
       * the live preview and the final widget are structurally identical. */
      '<div class="inline-quiz-feedback"></div>');
  }

  return streamCard(tag, escHTML(streamPlainPreview(inner)));
}

/* Think-block builder — shared by the streaming and final renderers. */

function _thinkUnitCount(s: string): number {
  if (!s) return 0;
  const cjkMatch = s.match(/[㐀-鿿豈-﫿]/g);
  const cjk = cjkMatch ? cjkMatch.length : 0;
  const rest = s.replace(/[㐀-鿿豈-﫿]/g, ' ').trim();
  const words = rest ? rest.split(/\s+/).filter(Boolean).length : 0;
  return cjk + words;
}

function _formatThinkMeta(n: number): string {
  if (!n) return '';
  const key = n === 1 ? 'think.wordCountOne' : 'think.wordCount';
  const w = (typeof window !== 'undefined') ? window : undefined;
  const tmpl = (w && typeof w.t === 'function') ? w.t(key) : '';
  if (tmpl && tmpl.indexOf('{n}') !== -1) return tmpl.replace('{n}', String(n));
  return (n === 1 ? '1 word' : n + ' words');
}

interface ThinkOpts {
  streaming: boolean;
  count: number;
}

function _thinkSummary(opts: ThinkOpts): string {
  const w = (typeof window !== 'undefined') ? window : undefined;
  const tFn = (w && typeof w.t === 'function') ? w.t : (_k: string) => '';
  const label = opts.streaming
    ? (tFn('think.thinking') || 'Thinking…')
    : (tFn('think.title') || 'Thought');
  const meta = (!opts.streaming && opts.count > 0)
    ? '<span class="think-summary-meta">' + esc(_formatThinkMeta(opts.count)) + '</span>'
    : '';
  const labelCls = opts.streaming ? 'think-summary-label shimmer-text' : 'think-summary-label';
  return '<summary class="think-summary">' +
    '<span class="' + labelCls + '">' + esc(label) + '</span>' +
    meta +
    '<span class="think-summary-chevron" aria-hidden="true"></span>' +
  '</summary>';
}

function _thinkDetails(inner: string, opts: ThinkOpts): string {
  const cls = 'think-block' + (opts.streaming ? ' think-block-streaming' : '');
  const openAttr = opts.streaming ? ' open' : '';
  return '<details class="' + cls + '"' + openAttr + '>' +
    _thinkSummary(opts) +
    '<div class="think-content">' + inner + '</div>' +
  '</details>';
}

export function formatTickSlice(full: string, len: number): string {
  return formatMsgProgressive(full.slice(0, len));
}

const _streamingVizIds = new Map<string, string>();
function _streamingFingerprint(lang: string, content: string): string {
  return (lang || '') + '\x00' + String(content || '').slice(0, 50);
}
function _getStreamingVizId(lang: string, content: string): string {
  const key = _streamingFingerprint(lang, content);
  let id = _streamingVizIds.get(key);
  if (!id) {
    id = 'viz-card-stream-' + key.replace(/[^\w]/g, '_');
    _streamingVizIds.set(key, id);
  }
  return id;
}

interface KatexLike {
  renderToString: (
    math: string,
    opts: { displayMode: boolean; throwOnError: boolean; macros?: Record<string, string> },
  ) => string;
}

function getKatex(): KatexLike | undefined {
  return (globalThis as { katex?: KatexLike }).katex;
}

interface MarkedLike {
  parse: (md: string, opts: { breaks: boolean; gfm: boolean }) => string;
}

function getMarked(): MarkedLike | undefined {
  return (globalThis as { marked?: MarkedLike }).marked;
}

interface RenderMathInElementOpts {
  delimiters: Array<{ left: string; right: string; display: boolean }>;
  throwOnError: boolean;
  macros?: Record<string, string>;
  ignoredTags?: string[];
}

declare global {
  interface Window {
    renderMathInElement?: (el: Element, opts: RenderMathInElementOpts) => void;
  }
}

export function formatMsgProgressive(t: string | null | undefined): string {
  if (!t) return '';
  let s = preprocessMarkdownForStreaming(String(t));
  if (s.charCodeAt(s.length - 1) === 10) { s = s.slice(0, -1); }
  if (!s) return '';

  const blocks: string[] = [];
  let pid = 0;
  function save(html: string): string {
    const id = pid++;
    blocks.push(html);
    return 'XBLOCK' + id + 'X';
  }
  const vizBlocks: string[] = [];
  let vizPid = 0;
  function saveViz(html: string): string {
    const id = vizPid++;
    vizBlocks.push(html);
    return 'XVIZBLOCK' + id + 'X';
  }

  s = s.replace(/^```(?:viz|html|svg)\s*$/m, '```viz\n');

  s = s.replace(/<think>([\s\S]*?)<\/think>/g, function (_, content: string) {
    let inner: string;
    try {
      inner = formatMsgProgressive(content.trim().replace(/<\/?think>/g, ''));
    } catch (_e) {
      inner = escHTML(content.trim());
    }
    return save(_thinkDetails(inner, { streaming: false, count: _thinkUnitCount(content.trim().replace(/<\/?think>/g, '')) }));
  });
  s = s.replace(/<think>([\s\S]*)$/g, function (_, content: string) {
    let inner = '';
    try {
      const c = content.trim().replace(/<\/?think>/g, '');
      inner = c ? formatMsgProgressive(c) : '<span class="shimmer-text">Thinking…</span>';
    } catch (_e) {
      inner = escHTML(content.trim());
    }
    return save(_thinkDetails(inner, { streaming: true, count: _thinkUnitCount(content.trim().replace(/<\/?think>/g, '')) }));
  });

  function _scaffoldText(inner: string): string {
    const text = inner.replace(/<[^>]+>/g, '').trim();
    return text.length > 200 ? text.slice(0, 200) + '…' : text;
  }
  function _streamScaffoldFallback(tag: string, content: string): string {
    const label = STREAM_SCAFFOLD_FALLBACK[tag] || '[' + tag + ']';
    let txt = _scaffoldText(content);
    const katex = getKatex();
    if (typeof katex !== 'undefined') {
      txt = txt.replace(/\$\$([\s\S]*?)\$\$/g, function (_, math: string) {
        try { return save(katex.renderToString(math.trim(), { displayMode: true, throwOnError: false, macros: KATEX_MACROS })); }
        catch (e) { return save('<pre>$$' + escHTML(math) + '$$</pre>'); }
      });
      txt = txt.replace(/\$(.+?)\$/g, function (_, math: string) {
        try { return save(katex.renderToString(math.trim(), { displayMode: false, throwOnError: false, macros: KATEX_MACROS })); }
        catch (e) { return save('<code>$' + escHTML(math) + '$</code>'); }
      });
    }
    return save('<div class="scaffold-stream"><span class="scaffold-stream-label">'
                + label + '</span> ' + escHTML(txt) + '</div>');
  }
  function _streamScaffold(tag: string, content: string, attrs = ''): string {
    const plugin = findStreamScaffold(tag);
    if (plugin) {
      try {
        const parsed = plugin.parse(content);
        if (parsed) {
          const html = plugin.render(parsed);
          if (html) return save(html);
        }
      } catch (e) {
        /* Plugin threw — fall through to plain-text preview. */
      }
    }
    const preview = renderStreamScaffoldPreview(tag, content, attrs);
    if (preview) return save(preview);
    return _streamScaffoldFallback(tag, content);
  }
  s = s.replace(/<(quiz|example|practice|definition|step|flashcard|proof|theorem|key-point|derivation)\b([^>]*)>([\s\S]*?)<\/\1>/gi, function (_, tag: string, attrs: string, content: string) {
    return _streamScaffold(tag, content, attrs);
  });
  s = s.replace(/<(quiz|example|practice|definition|step|flashcard|proof|theorem|key-point|derivation)\b([^>]*)>([\s\S]*?)$/gi, function (_, tag: string, attrs: string, content: string) {
    return _streamScaffold(tag, content, attrs);
  });

  s = s.replace(/```mermaid\s*\n?([\s\S]*?)```/g, function (_, code: string) {
    const trimmed = code.trim();
    return trimmed ? saveViz(renderMermaid(trimmed, { stableId: _getStreamingVizId('mermaid', trimmed) })) : '';
  });
  s = s.replace(/```mermaid\s*\n?([\s\S]*?)$/g, function (_, body: string) {
    const trimmed = body.trim();
    return saveViz(renderVizLoading({ streaming: true, stableId: _getStreamingVizId('mermaid', trimmed) }));
  });

  s = s.replace(/```plot\s*\n?([\s\S]*?)```/g, function (_, spec: string) {
    const trimmed = spec.trim();
    return trimmed ? saveViz(renderPlot(trimmed, { stableId: _getStreamingVizId('plot', trimmed) })) : '';
  });
  s = s.replace(/```plot\s*\n?([\s\S]*?)$/g, function (_, body: string) {
    const trimmed = body.trim();
    return saveViz(renderVizLoading({ streaming: true, stableId: _getStreamingVizId('plot', trimmed) }));
  });

  s = s.replace(/```(\w*)\n?([\s\S]*?)```/g, function (_, lang: string, code: string) {
    const trimmed = code.trim();
    const isHtmlLang = lang === 'html' || lang === 'viz' || lang === 'svg';
    const hasSvgTag = /<svg[\s>]/i.test(trimmed);
    const looksLikeHtml = isHtmlLang || hasSvgTag || (
      trimmed.length > 30 &&
      /<\/(style|script|canvas|svg|div|table)>|<style[\s>]/i.test(trimmed)
    );
    if (isHtmlLang || (looksLikeHtml && (trimmed.length > 20 || hasSvgTag))) {
      return saveViz(renderViz(trimmed, { stableId: _getStreamingVizId(lang || 'html', trimmed) }));
    }
    const hljsLang = safeHljsLang(lang);
    const langAttr = hljsLang ? ' class="language-' + escAttr(hljsLang) + '"' : '';
    return save('<pre><code' + langAttr + '>' + escHTML(trimmed) + '</code></pre>');
  });

  s = s.replace(/```(\w*)\n?([\s\S]*)$/g, function (_, lang: string, body: string) {
    const trimmed = body.trim();
    if (trimmed) {
      const isHtmlLang = lang === 'html' || lang === 'viz' || lang === 'svg';
      if (isHtmlLang) {
        return saveViz(renderVizLoading({ streaming: true, stableId: _getStreamingVizId(lang || 'html', trimmed) }));
      }
      const hljsLang = safeHljsLang(lang);
      const langAttr = hljsLang ? ' class="language-' + escAttr(hljsLang) + '"' : '';
      return save('<pre><code' + langAttr + '>' + escHTML(trimmed) + '</code></pre>');
    }
    return save('<span style="color:hsl(var(--text-400));font-style:italic;font-size:0.9em">…</span>');
  });

  const katex = getKatex();

  if (typeof katex !== 'undefined') {
    s = s.replace(/\$\$([\s\S]+?)\$\$/g, function (_, math: string) {
      try {
        return save(katex.renderToString(math.trim(), { displayMode: true, throwOnError: false, macros: KATEX_MACROS }));
      } catch (e) {
        return save('<pre>' + escHTML('$$' + math + '$$') + '</pre>');
      }
    });
    s = s.replace(/\$\$([\s\S]+)$/g, function (_, math: string) {
      try {
        return save(katex.renderToString(math.trim(), { displayMode: true, throwOnError: false, macros: KATEX_MACROS }));
      } catch (e) {
        return save('<span class="math-partial" style="color:hsl(var(--text-400));font-style:italic;font-size:0.9em">…</span>');
      }
    });
  }

  if (typeof katex !== 'undefined') {
    s = s.replace(/\$(.+?)\$/g, function (_, math: string) {
      try {
        return save(katex.renderToString(math.trim(), { displayMode: false, throwOnError: false, macros: KATEX_MACROS }));
      } catch (e) {
        return save('<code>' + escHTML('$' + math + '$') + '</code>');
      }
    });
  }

  let html: string;
  const marked = getMarked();
  if (typeof marked !== 'undefined') {
    html = marked.parse(s, { breaks: true, gfm: true });
  } else {
    html = '<p>' + escHTML(s).replace(/\n\n/g, '</p><p>').replace(/\n/g, '<br>') + '</p>';
  }

  html = html.replace(/XBLOCK(\d+)X/g, function (_, id: string) {
    return blocks[parseInt(id)];
  });

  const sanitized = sanitizeHtml(html);
  return sanitized.replace(/XVIZBLOCK(\d+)X/g, function (_, id: string) {
    return vizBlocks[parseInt(id)];
  });
}

export function formatMsg(t: string | null | undefined): string {
  const marked = getMarked();
  const katex = getKatex();
  /* Markdown and math are independent capabilities. If KaTeX is missing
     because its optional CDN script failed, we must still run marked so
     structural Markdown such as `---` remains a horizontal rule instead of
     falling back to escaped plain text. Math delimiters can remain literal
     until KaTeX becomes available. */
  if (typeof marked === 'undefined') {
    const fallbackViz: string[] = [];
    function saveFallbackViz(html: string): string {
      const id = fallbackViz.length;
      fallbackViz.push(html);
      return 'XVIZFALLBACK' + id + 'X';
    }
    let raw = preprocessMarkdown(t);
    raw = raw.replace(/```(?:viz|html|svg)\s*\n?([\s\S]*?)```/gi, function (_, content: string) {
      const trimmed = content.trim();
      return trimmed ? saveFallbackViz(renderViz(trimmed)) : '';
    });
    raw = raw.replace(/```plot\s*\n?([\s\S]*?)```/gi, function (_, content: string) {
      const trimmed = content.trim();
      return trimmed ? saveFallbackViz(renderPlot(trimmed)) : '';
    });
    raw = raw.replace(/```(?:viz|html|svg|plot)\s*\n?([\s\S]*?)$/i, function (_, content: string) {
      return saveFallbackViz(renderVizLoading({ streaming: true }));
    });
    const fallbackHtml = '<p>' + esc(raw).replace(/```(\w*)\r?\n?([\s\S]*?)```/g, function (_, _l: string, c: string) { return '<pre><code>' + esc(c.trim()) + '</code></pre>'; }).replace(/`([^`]+)`/g, '<code>$1</code>').replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>').replace(/\*(.+?)\*/g, '<em>$1</em>').replace(/\n\n/g, '</p><p>').replace(/\n/g, '<br>') + '</p>';
    return fallbackHtml.replace(/XVIZFALLBACK(\d+)X/g, function (_, id: string) { return fallbackViz[parseInt(id, 10)] || ''; });
  }
  const blocks: string[] = [];
  let pid = 0;
  function save(html: string): string {
    const id = pid++;
    blocks.push(html);
    return 'XBLOCK' + id + 'X';
  }
  const vizBlocks: string[] = [];
  let vizPid = 0;
  function saveViz(html: string): string {
    const id = vizPid++;
    vizBlocks.push(html);
    return 'XVIZBLOCK' + id + 'X';
  }

  let procT = String(t ?? '');
  procT = procT.replace(/&lt;think&gt;/g, '<think>').replace(/&lt;\/think&gt;/g, '</think>');
  procT = stripChatArtifacts(procT);
  procT = preprocessMarkdown(procT);

  procT = procT.replace(/<(quiz|example|practice|definition|flashcard)\b[^>]*>([\s\S]*?)<\/\1>/gi, function (_, tag: string, content: string) {
    const label = '[' + (tag === 'quiz' ? 'Quiz' : tag === 'example' ? 'Example' : tag === 'practice' ? 'Practice' : tag === 'definition' ? 'Definition' : 'Flashcard') + ']';
    let txt = content.replace(/<[^>]+>/g, '').trim();
    if (txt.length > 300) txt = txt.slice(0, 300) + '…';
    return save('<div class="scaffold-stream"><span class="scaffold-stream-label">' + label + '</span>' + esc(txt) + '</div>');
  });
  procT = procT.replace(/<step\b[^>]*>([\s\S]*?)<\/step>/gi, function (_, content: string) {
    let txt = content.replace(/<[^>]+>/g, '').trim();
    if (txt.length > 300) txt = txt.slice(0, 300) + '…';
    return save('<div class="scaffold-stream"><span class="scaffold-stream-label">[Step]</span>' + esc(txt) + '</div>');
  });
  procT = procT.replace(/<(proof|theorem|key-point|derivation)\b[^>]*>([\s\S]*?)<\/\1>/gi, function (_, tag: string, content: string) {
    const label = '[' + (tag === 'proof' ? 'Proof' : tag === 'theorem' ? 'Theorem' : tag === 'key-point' ? 'Key Point' : 'Derivation') + ']';
    let txt = content.replace(/<[^>]+>/g, '').trim();
    if (txt.length > 300) txt = txt.slice(0, 300) + '…';
    if (typeof katex !== 'undefined') {
      txt = txt.replace(/\$\$([\s\S]*?)\$\$/g, function (_, math: string) {
        try { return save(katex.renderToString(math.trim(), { displayMode: true, throwOnError: false, macros: KATEX_MACROS })); }
        catch (e) { return save('<pre>' + esc('$$' + math + '$$') + '</pre>'); }
      });
      txt = txt.replace(/\$(.+?)\$/g, function (_, math: string) {
        try { return save(katex.renderToString(math.trim(), { displayMode: false, throwOnError: false, macros: KATEX_MACROS })); }
        catch (e) { return save('<code>' + esc('$' + math + '$') + '</code>'); }
      });
    }
    return save('<div class="scaffold-stream"><span class="scaffold-stream-label">' + label + '</span>' + esc(txt) + '</div>');
  });
  procT = procT.replace(/<(quiz|example|practice|definition|step|flashcard|proof|theorem|key-point|derivation)\b[^>]*>([\s\S]*?)$/gi, function (_, tag: string) {
    return save('<span class="scaffold-stream scaffold-stream-unclosed">…' + esc(tag) + '…</span>');
  });

  procT = procT.replace(/^```(?:viz|html|svg)\s*$/m, '```viz\n');

  procT = procT.replace(/<think>([\s\S]*?)<\/think>/g, function (_, content: string) {
    let inner: string;
    try {
      inner = formatMsg(content.trim().replace(/<\/?think>/g, ''));
    } catch (_) {
      inner = esc(content.trim());
    }
    return save(_thinkDetails(inner, { streaming: false, count: _thinkUnitCount(content.trim().replace(/<\/?think>/g, '')) }));
  });
  procT = procT.replace(/<think>([\s\S]*)$/g, function (_, content: string) {
    let inner = '';
    try {
      const c = content.trim().replace(/<\/?think>/g, '');
      inner = c ? formatMsg(c) : '<span class="shimmer-text">Thinking…</span>';
    } catch (_) {
      inner = esc(content.trim());
    }
    return save(_thinkDetails(inner, { streaming: true, count: _thinkUnitCount(content.trim().replace(/<\/?think>/g, '')) }));
  });

  procT = procT.replace(/```mermaid\s*\n?([\s\S]*?)```/g, function (_, code: string) {
    const trimmed = code.trim();
    return trimmed ? saveViz(renderMermaid(trimmed)) : '';
  });
  procT = procT.replace(/```mermaid\s*\n?([\s\S]*?)$/g, function () {
    return saveViz(renderVizLoading());
  });

  procT = procT.replace(/```(?:viz|html|svg)\s*\n?([\s\S]*?)```/g, function (_, json: string) {
    const trimmed = json.trim();
    return trimmed ? saveViz(renderViz(trimmed)) : '';
  });
  procT = procT.replace(/```(?:viz|html|svg)\s*\n?([\s\S]*?)$/g, function () {
    return saveViz(renderVizLoading());
  });

  procT = procT.replace(/```plot\s*\n?([\s\S]*?)```/g, function (_, spec: string) {
    const trimmed = spec.trim();
    return trimmed ? saveViz(renderPlot(trimmed)) : '';
  });
  procT = procT.replace(/```plot\s*\n?([\s\S]*?)$/g, function () {
    return saveViz(renderVizLoading());
  });

  procT = procT.replace(/```(\w*)\n?([\s\S]*?)```/g, function (_, lang: string, code: string) {
    const trimmed = code.trim();
    const isHtmlLang = lang === 'html' || lang === 'viz' || lang === 'svg';
    const hasSvgTag = /<svg[\s>]/i.test(trimmed);
    const looksLikeHtml = isHtmlLang || hasSvgTag || (
      trimmed.length > 30 &&
      /<\/(style|script|canvas|svg|div|table)>|<style[\s>]/i.test(trimmed)
    );
    if (isHtmlLang || (looksLikeHtml && (trimmed.length > 20 || hasSvgTag))) {
      return saveViz(renderViz(trimmed));
    }
    const hljsLang = safeHljsLang(lang);
    const langAttr = hljsLang ? ' class="language-' + escAttr(hljsLang) + '"' : '';
    return save('<pre><code' + langAttr + '>' + escHTML(trimmed) + '</code></pre>');
  });

  if (typeof katex !== 'undefined') {
    procT = procT.replace(/\$\$([\s\S]+?)\$\$/g, function (_, math: string) {
      try {
        return save(katex.renderToString(math.trim(), { displayMode: true, throwOnError: false, macros: KATEX_MACROS }));
      } catch (e) {
        return save('<pre>' + esc('$$' + math + '$$') + '</pre>');
      }
    });
    procT = procT.replace(/\$\$([\s\S]+?)$/g, function (_, math: string) {
      const src = math.trim();
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
      try {
        return save(katex.renderToString(closed, { displayMode: true, throwOnError: false, macros: KATEX_MACROS }));
      } catch (e) {
        return save('<span class="math-partial" style="color:hsl(var(--text-400));font-style:italic;font-size:0.9em">…</span>');
      }
    });

    procT = procT.replace(/\$([\s\S]+?)\$/g, function (_, math: string) {
      try {
        return save(katex.renderToString(math.trim(), { displayMode: false, throwOnError: false, macros: KATEX_MACROS }));
      } catch (e) {
        return save('<code>' + esc('$' + math + '$') + '</code>');
      }
    });
  }

  let html = marked.parse(procT, { breaks: true, gfm: true });
  html = sanitizeUrls(html);
  html = html.replace(/XBLOCK(\d+)X/g, function (_, id: string) {
    return blocks[parseInt(id)];
  });

  if (typeof window !== 'undefined' && typeof window.renderMathInElement === 'function'
     && typeof document !== 'undefined') {
    try {
      const _arHost = document.createElement('div');
      _arHost.innerHTML = html;
      window.renderMathInElement(_arHost, {
        delimiters: [
          { left: '$$', right: '$$', display: true },
          { left: '$', right: '$', display: false },
          { left: '\\(', right: '\\)', display: false },
          { left: '\\[', right: '\\]', display: true },
        ],
        throwOnError: false,
        macros: KATEX_MACROS,
        ignoredTags: ['script', 'noscript', 'style', 'textarea', 'pre', 'code'],
      });
      html = _arHost.innerHTML;
    } catch (_arErr) {
      console.warn('[formatMsg] auto-render pass skipped:', _arErr && (_arErr as Error).message);
    }
  }

  const sanitized = sanitizeHtml(html);
  return sanitized.replace(/XVIZBLOCK(\d+)X/g, function (_, id: string) {
    return vizBlocks[parseInt(id)];
  });
}

/* ── Plain-text helpers (used by message-editing flows) ──────────── */

export function stripMarkdown(s: string | null | undefined): string {
  if (!s) return '';
  return String(s)
    .replace(/<\/?[a-zA-Z][^>]*>/g, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<!\[CDATA\[[\s\S]*?\]\]>/g, '')
    .replace(/```[\s\S]*?```/g, '')
    .replace(/~~~[\s\S]*?~~~/g, '')
    .replace(/\$\$[^$]*\$\$/g, '')
    .replace(/\$[^$]*\$/g, '')
    .replace(/`[^`]*`/g, '')
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\*\*([^*]*)\*\*/g, '$1')
    .replace(/__([^_]*)__/g, '$1')
    .replace(/\*([^*]*)\*/g, '$1')
    .replace(/_([^_]*)_/g, '$1')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/^>\s+/gm, '')
    .replace(/^[-*_]{3,}\s*$/gm, '')
    .replace(/^[-*+]\s+/gm, '')
    .replace(/^\d+\.\s+/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/* Returns the most recent user message with markdown stripped, or null.
   Used by the `↑` (empty input) shortcut to pop the previous prompt
   back into the input for editing. */
export function findLastUserMessage(): string | null {
  const stateAny = window.state as unknown as { session?: { messages?: Array<{ role?: string; rawText?: string }> } } | undefined;
  const list = stateAny?.session?.messages || [];
  for (let i = list.length - 1; i >= 0; i--) {
    if (list[i].role === 'user' && list[i].rawText) return stripMarkdown(list[i].rawText);
  }
  return null;
}
