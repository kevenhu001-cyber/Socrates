/* ── Markdown + math + viz message renderers ──
   formatMsgProgressive — streaming markdown renderer (called per
     animation frame during streaming).
   formatMsg — final one-shot renderer (called when the message is
     complete or during typeTick animation).
   formatTickSlice — convenience wrapper for the type-tick slider.
   All three exported for use by main.js / doRender / streaming. */

import { esc, escAttr, escHTML, KATEX_MACROS, safeHljsLang } from './helpers.ts';
import { renderMermaid, renderViz, renderVizLoading, renderPlot } from './vizStubs.js';
import { preprocessMarkdown, preprocessMarkdownForStreaming, type StreamingPreprocessOptions } from './preprocess.ts';
import { stripChatArtifacts } from '../util/stripChatArtifacts.ts';
import { sanitizeUrls } from '../util/safe.ts';
import { sanitizeHtml } from './sanitizeHtml.ts';
import { stripHtmlTags } from '../util/stripHtml.ts';
import { installCodeBlockCopy } from './markdownCodeCopy.ts';
import {
  findStreamScaffold, renderStreamScaffoldPreview,
  streamScaffoldFallbackLabel, streamScaffoldFallbackText,
} from './markdownScaffolds.ts';
export { clearStreamScaffolds, registerStreamScaffold } from './markdownScaffolds.ts';
import {
  _looksLikeInlineMathTail, _looksLikeNumericMath, _stashInlineCode,
  getKatex, renderStreamMath, replaceInlineDollarMath,
} from './markdownMath.ts';

export function formatTickSlice(full: string, len: number): string {
  return formatMsgProgressive(full.slice(0, len));
}

const _streamingVizIds = new Map<string, string>();
const MAX_STREAMING_VIZ_IDS = 200;
function _hashContent(content: string): string {
  let h = 5381;
  for (let i = 0; i < content.length; i += 1) {
    h = ((h << 5) + h + content.charCodeAt(i)) | 0;
  }
  return (h >>> 0).toString(36);
}
function _streamingFingerprint(lang: string, content: string): string {
  const c = String(content || '');
  return (lang || '') + '\x00' + c.length + '\x00' + _hashContent(c);
}
function _getStreamingVizId(lang: string, content: string): string {
  const key = _streamingFingerprint(lang, content);
  let id = _streamingVizIds.get(key);
  if (!id) {
    id = 'viz-card-stream-' + key.replace(/[^\w]/g, '_');
    // Bound the map: long sessions with many unique code prefixes
    // must not grow it without limit. Map preserves insertion order.
    if (_streamingVizIds.size >= MAX_STREAMING_VIZ_IDS) {
      const oldest = _streamingVizIds.keys().next().value;
      if (oldest !== undefined) _streamingVizIds.delete(oldest);
    }
    _streamingVizIds.set(key, id);
  }
  return id;
}

interface MarkedLike {
  parse: (md: string, opts: { breaks: boolean; gfm: boolean }) => string;
}

function getMarked(): MarkedLike | undefined {
  return (globalThis as { marked?: MarkedLike }).marked;
}

interface PlaceholderBank {
  blocks: string[];
  vizBlocks: string[];
  save(html: string): string;
  saveViz(html: string): string;
  restoreBlocks(html: string): string;
  restoreViz(html: string): string;
}

function createPlaceholderBank(): PlaceholderBank {
  /* Random tokens prevent user text from impersonating a trusted HTML slot. */
  const nonce = Math.random().toString(36).slice(2, 10);
  const blockPrefix = '§SCRTB' + nonce;
  const vizPrefix = '§SCRTV' + nonce;
  const blockRe = new RegExp(blockPrefix + '(\\d+)§', 'g');
  const vizRe = new RegExp(vizPrefix + '(\\d+)§', 'g');
  const blocks: string[] = [];
  const vizBlocks: string[] = [];
  return {
    blocks,
    vizBlocks,
    save(html) {
      const id = blocks.push(html) - 1;
      return blockPrefix + id + '§';
    },
    saveViz(html) {
      const id = vizBlocks.push(html) - 1;
      return vizPrefix + id + '§';
    },
    restoreBlocks(html) {
      return html.replace(blockRe, (_match, id: string) => blocks[parseInt(id)]);
    },
    restoreViz(html) {
      return html.replace(vizRe, (_match, id: string) => vizBlocks[parseInt(id)]);
    },
  };
}

function renderProgressiveScaffold(
  tag: string,
  content: string,
  attrs: string,
  bank: PlaceholderBank,
): string {
  const plugin = findStreamScaffold(tag);
  if (plugin) {
    try {
      const parsed = plugin.parse(content);
      if (parsed) {
        const html = plugin.render(parsed);
        if (html) return bank.save(html);
      }
    } catch {
      /* Plugin threw — fall through to preview and plain text. */
    }
  }
  const preview = renderStreamScaffoldPreview(tag, content, attrs, formatMsgProgressive);
  if (preview) return bank.save(preview);

  const label = streamScaffoldFallbackLabel(tag);
  let text = streamScaffoldFallbackText(content);
  text = text.replace(/\$\$([\s\S]*?)\$\$/g, (match, math: string) => {
    const html = renderStreamMath(math, true, false);
    return html === null ? match : bank.save(html);
  });
  text = text.replace(/\$(.+?)\$/g, (match, math: string) => {
    const html = renderStreamMath(math, false, false);
    return html === null ? match : bank.save(html);
  });
  return bank.save('<div class="scaffold-stream"><span class="scaffold-stream-label">'
    + label + '</span> ' + escHTML(text) + '</div>');
}

function replaceProgressiveScaffolds(source: string, bank: PlaceholderBank): string {
  source = source.replace(/^```(?:viz|html|svg)\s*$/m, '```viz\n');
  /* Thinking text is shown in the live status line, not in the transcript. */
  source = source.replace(/<think>[\s\S]*?<\/think>/gi, '');
  source = source.replace(/<think>[\s\S]*$/gi, '');
  source = source.replace(/<(quiz|example|practice|definition|step|flashcard|proof|theorem|key-point|derivation)\b([^>]*)>([\s\S]*?)<\/\1>/gi,
    (_match, tag: string, attrs: string, content: string) => renderProgressiveScaffold(tag, content, attrs, bank));
  return source.replace(/<(quiz|example|practice|definition|step|flashcard|proof|theorem|key-point|derivation)\b([^>]*)>([\s\S]*?)$/gi,
    (_match, tag: string, attrs: string, content: string) => renderProgressiveScaffold(tag, content, attrs, bank));
}

function replaceProgressiveCodeBlocks(
  source: string,
  complete: boolean,
  bank: PlaceholderBank,
): string {
  source = source.replace(/```mermaid\s*\n?([\s\S]*?)```/g, (_match, code: string) => {
    const trimmed = code.trim();
    return trimmed ? bank.saveViz(renderMermaid(trimmed, { stableId: _getStreamingVizId('mermaid', trimmed) })) : '';
  });
  source = source.replace(/```mermaid\s*\n?([\s\S]*?)$/g, (_match, body: string) => {
    const trimmed = body.trim();
    return bank.saveViz(renderVizLoading({ streaming: true, stableId: _getStreamingVizId('mermaid', trimmed) }));
  });
  source = source.replace(/```plot\s*\n?([\s\S]*?)```/g, (_match, spec: string) => {
    const trimmed = spec.trim();
    return trimmed ? bank.saveViz(renderPlot(trimmed, { stableId: _getStreamingVizId('plot', trimmed) })) : '';
  });
  source = source.replace(/```plot\s*\n?([\s\S]*?)$/g, (_match, body: string) => {
    const trimmed = body.trim();
    return bank.saveViz(renderVizLoading({ streaming: true, stableId: _getStreamingVizId('plot', trimmed) }));
  });
  source = source.replace(/```(\w*)\n?([\s\S]*?)```/g, (_match, lang: string, code: string) => {
    const trimmed = code.trim();
    const isHtmlLang = lang === 'html' || lang === 'viz' || lang === 'svg';
    const hasSvgTag = /<svg[\s>]/i.test(trimmed);
    const looksLikeHtml = isHtmlLang || hasSvgTag || (
      trimmed.length > 30 && /<\/(style|script|canvas|svg|div|table)>|<style[\s>]/i.test(trimmed)
    );
    if (isHtmlLang || (looksLikeHtml && (trimmed.length > 20 || hasSvgTag))) {
      return bank.saveViz(renderViz(trimmed, { stableId: _getStreamingVizId(lang || 'html', trimmed) }));
    }
    const hljsLang = safeHljsLang(lang);
    const langAttr = hljsLang ? ' class="language-' + escAttr(hljsLang) + '"' : '';
    return bank.save('<pre><code' + langAttr + '>' + escHTML(trimmed) + '</code></pre>');
  });
  return source.replace(/```(\w*)\n?([\s\S]*)$/g, (_match, lang: string, body: string) => {
    const trimmed = body.trim();
    if (!trimmed) return bank.save('<span style="color:hsl(var(--text-400));font-style:italic;font-size:0.9em">…</span>');
    const isHtmlLang = lang === 'html' || lang === 'viz' || lang === 'svg';
    if (isHtmlLang) {
      return bank.saveViz(renderVizLoading({ streaming: true, stableId: _getStreamingVizId(lang || 'html', trimmed) }));
    }
    if (complete) {
      const hljsLang = safeHljsLang(lang);
      const langAttr = hljsLang ? ' class="language-' + escAttr(hljsLang) + '"' : '';
      return bank.save('<pre><code' + langAttr + '>' + escHTML(trimmed) + '</code></pre>');
    }
    return bank.save('<div class="stream-code-pending"><div class="stream-code-pending-header">'
      + '<span class="stream-code-badge">' + escHTML(lang || 'code') + '</span>'
      + '<span class="stream-code-dots shimmer-text">…</span></div></div>');
  });
}

function replaceProgressiveDisplayMath(source: string, complete: boolean, bank: PlaceholderBank): string {
  const replaceClosed = (match: string, math: string) => {
    const html = renderStreamMath(math, true, false);
    return html === null ? match : bank.save(html);
  };
  const replaceOpen = (match: string, math: string) => {
    const html = renderStreamMath(math, true, true);
    if (html !== null) return bank.save(html);
    return complete ? match : bank.save('<div class="katex-display math-stream-placeholder" style="min-height:2em;opacity:0.5;"><span class="scaffold-stream-placeholder shimmer-text">…</span></div>');
  };
  source = source.replace(/\$\$([\s\S]+?)\$\$/g, replaceClosed);
  source = source.replace(/\\\[([\s\S]+?)\\\]/g, replaceClosed);
  source = source.replace(/\$\$([\s\S]+)$/g, replaceOpen);
  return source.replace(/\\\[([\s\S]+)$/g, replaceOpen);
}

function replaceProgressiveInlineMath(source: string, complete: boolean, bank: PlaceholderBank): string {
  source = replaceInlineDollarMath(source, false, (math: string) => {
    const html = renderStreamMath(math, false, false);
    return html === null ? null : bank.save(html);
  });
  source = source.replace(/\\\((.+?)\\\)/g, (match, math: string) => {
    const html = renderStreamMath(math, false, false);
    return html === null ? match : bank.save(html);
  });
  source = source.replace(/\$([^\n$]+)$/g, (match, math: string) => {
    if (complete || !_looksLikeInlineMathTail(math.trim())) return match;
    const html = renderStreamMath(math, false, true);
    if (html !== null) return bank.save(html);
    return bank.save('<span class="math-stream-placeholder shimmer-text" style="display:inline-block;width:1.2em;text-align:center;opacity:0.4;">…</span>');
  });
  return source.replace(/\\\(([^\n\\]+)$/g, (match, math: string) => {
    const html = renderStreamMath(math, false, true);
    if (html !== null) return bank.save(html);
    return complete ? match : bank.save('<span class="math-stream-placeholder shimmer-text" style="display:inline-block;width:1.2em;text-align:center;opacity:0.4;">…</span>');
  });
}

function renderProgressiveMarkdown(source: string, bank: PlaceholderBank): string {
  const marked = getMarked();
  const html = marked
    ? marked.parse(source, { breaks: true, gfm: true })
    : '<p>' + escHTML(source).replace(/\n\n/g, '</p><p>').replace(/\n/g, '<br>') + '</p>';
  return bank.restoreViz(sanitizeHtml(bank.restoreBlocks(html), { chineseProse: true }));
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

/* Recursion guard — scaffolds and <think> blocks re-enter the renderer
   with their inner content, and weak models can nest those arbitrarily.
   Past the cap the payload degrades to escaped text instead of blowing
   the stack. The counter is synchronous and try/finally-balanced, so it
   cannot leak across calls. */
const MAX_RENDER_DEPTH = 8;
let _renderDepth = 0;

/**
 * Streaming-safe renderer. Pass `{ complete: true }` when the text can no
 * longer grow (a settled block, a segment closed off by a tool row): the
 * end-of-input rules that are unsafe on a still-typing tail then run too, so
 * the output matches what formatMsg paints for the same text at finish.
 */
export function formatMsgProgressive(
  t: string | null | undefined,
  opts?: StreamingPreprocessOptions,
): string {
  if (!t) return '';
  if (_renderDepth >= MAX_RENDER_DEPTH) return '<p>' + escHTML(String(t)) + '</p>';
  _renderDepth += 1;
  try {
    return _formatMsgProgressive(String(t), opts);
  } finally {
    _renderDepth -= 1;
  }
}

function _formatMsgProgressive(t: string, opts?: StreamingPreprocessOptions): string {
  let s = preprocessMarkdownForStreaming(t, opts);
  if (s.charCodeAt(s.length - 1) === 10) { s = s.slice(0, -1); }
  if (!s) return '';

  const bank = createPlaceholderBank();

  s = replaceProgressiveScaffolds(s, bank);

  s = replaceProgressiveCodeBlocks(s, !!opts?.complete, bank);

  const katex = getKatex(s);
  const inlineCodeGuard = _stashInlineCode(s);
  s = inlineCodeGuard.text;

  if (typeof katex !== 'undefined') {
    s = replaceProgressiveDisplayMath(s, !!opts?.complete, bank);
    s = replaceProgressiveInlineMath(s, !!opts?.complete, bank);
  }

  s = inlineCodeGuard.restore(s);

  if (!opts?.complete) {
    s = s.replace(/(?:^|\n)((?:\|[^\n]+\|\s*\n?)+)$/, function () {
      return bank.save('<div class="table-stream-placeholder shimmer-text"><span class="table-stream-icon">⊞</span> 正在生成表格…</div>');
    });
  }
  return renderProgressiveMarkdown(s, bank);
}

export function formatMsg(t: string | null | undefined): string {
  if (!t) return '';
  if (_renderDepth >= MAX_RENDER_DEPTH) return '<p>' + escHTML(String(t)) + '</p>';
  _renderDepth += 1;
  try {
    return _formatMsg(String(t));
  } finally {
    _renderDepth -= 1;
  }
}

function formatWithoutMarked(t: string): string {
  const fallbackViz: string[] = [];
  const saveFallbackViz = (html: string): string => {
    const id = fallbackViz.push(html) - 1;
    return 'XVIZFALLBACK' + id + 'X';
  };
  let raw = preprocessMarkdown(t);
  raw = raw.replace(/```(viz|html|svg)\s*\n?([\s\S]*?)```/gi, (_match, lang: string, content: string) => {
    const trimmed = content.trim();
    return trimmed ? saveFallbackViz(renderViz(trimmed, { stableId: _getStreamingVizId(lang, trimmed) })) : '';
  });
  raw = raw.replace(/```plot\s*\n?([\s\S]*?)```/gi, (_match, content: string) => {
    const trimmed = content.trim();
    return trimmed ? saveFallbackViz(renderPlot(trimmed, { stableId: _getStreamingVizId('plot', trimmed) })) : '';
  });
  raw = raw.replace(/```(viz|html|svg|plot)\s*\n?([\s\S]*?)$/i, (_match, lang: string, body: string) => (
    saveFallbackViz(renderVizLoading({ streaming: true, stableId: _getStreamingVizId(lang, String(body || '').trim()) }))
  ));
  const escaped = esc(raw).replace(/```(\w*)\r?\n?([\s\S]*?)```/g,
    (_match, _lang: string, code: string) => '<pre><code>' + esc(code.trim()) + '</code></pre>');
  const fallbackHtml = '<p>' + escaped
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/\n\n/g, '</p><p>')
    .replace(/\n/g, '<br>') + '</p>';
  return sanitizeHtml(fallbackHtml, { chineseProse: true }).replace(/XVIZFALLBACK(\d+)X/g,
    (_match, id: string) => fallbackViz[parseInt(id, 10)] || '');
}

function boundedScaffoldText(content: string): string {
  const text = stripHtmlTags(content).trim();
  return text.length > 300 ? text.slice(0, 300) + '…' : text;
}

function replaceSettledScaffolds(
  source: string,
  katex: ReturnType<typeof getKatex>,
  bank: PlaceholderBank,
): string {
  source = source.replace(/<(quiz|example|practice|definition|flashcard)\b[^>]*>([\s\S]*?)<\/\1>/gi,
    (_match, tag: string, content: string) => {
      const labels: Record<string, string> = {
        quiz: 'Quiz', example: 'Example', practice: 'Practice',
        definition: 'Definition', flashcard: 'Flashcard',
      };
      const label = '[' + (labels[tag] || 'Flashcard') + ']';
      return bank.save('<div class="scaffold-stream"><span class="scaffold-stream-label">'
        + label + '</span>' + esc(boundedScaffoldText(content)) + '</div>');
    });
  source = source.replace(/<step\b[^>]*>([\s\S]*?)<\/step>/gi, (_match, content: string) => (
    bank.save('<div class="scaffold-stream"><span class="scaffold-stream-label">[Step]</span>'
      + esc(boundedScaffoldText(content)) + '</div>')
  ));
  source = source.replace(/<(proof|theorem|key-point|derivation)\b[^>]*>([\s\S]*?)<\/\1>/gi,
    (_match, tag: string, content: string) => {
      const labels: Record<string, string> = {
        proof: 'Proof', theorem: 'Theorem', 'key-point': 'Key Point', derivation: 'Derivation',
      };
      let text = boundedScaffoldText(content);
      if (typeof katex !== 'undefined') {
        text = text.replace(/\$\$([\s\S]*?)\$\$/g, (_mathMatch, math: string) => {
          try {
            return bank.save(katex.renderToString(math.trim(), {
              displayMode: true, throwOnError: false, macros: KATEX_MACROS,
            }));
          } catch {
            return bank.save('<pre>' + esc('$$' + math + '$$') + '</pre>');
          }
        });
        text = replaceInlineDollarMath(text, false, (math: string) => {
          try {
            return bank.save(katex.renderToString(math.trim(), {
              displayMode: false, throwOnError: false, macros: KATEX_MACROS,
            }));
          } catch {
            return bank.save('<code>' + esc('$' + math + '$') + '</code>');
          }
        });
      }
      return bank.save('<div class="scaffold-stream"><span class="scaffold-stream-label">['
        + (labels[tag] || 'Derivation') + ']</span>' + esc(text) + '</div>');
    });
  return source.replace(/<(quiz|example|practice|definition|step|flashcard|proof|theorem|key-point|derivation)\b[^>]*>([\s\S]*?)$/gi,
    (_match, tag: string) => bank.save('<span class="scaffold-stream scaffold-stream-unclosed">…' + esc(tag) + '…</span>'));
}

function replaceSettledCodeBlocks(source: string, bank: PlaceholderBank): string {
  source = source.replace(/^```(?:viz|html|svg)\s*$/m, '```viz\n');
  /* Settled messages and reloaded history omit collapsible thinking blocks. */
  source = source.replace(/<think>[\s\S]*?<\/think>/gi, '');
  source = source.replace(/<think>[\s\S]*$/gi, '');
  source = source.replace(/```mermaid\s*\n?([\s\S]*?)```/g, (_match, code: string) => {
    const trimmed = code.trim();
    return trimmed ? bank.saveViz(renderMermaid(trimmed, { stableId: _getStreamingVizId('mermaid', trimmed) })) : '';
  });
  source = source.replace(/```mermaid\s*\n?([\s\S]*?)$/g, (_match, body: string) => (
    bank.saveViz(renderVizLoading({ stableId: _getStreamingVizId('mermaid', String(body || '').trim()) }))
  ));
  source = source.replace(/```(viz|html|svg)\s*\n?([\s\S]*?)```/g, (_match, lang: string, content: string) => {
    const trimmed = content.trim();
    return trimmed ? bank.saveViz(renderViz(trimmed, { stableId: _getStreamingVizId(lang, trimmed) })) : '';
  });
  source = source.replace(/```(viz|html|svg)\s*\n?([\s\S]*?)$/g, (_match, lang: string, body: string) => (
    bank.saveViz(renderVizLoading({ stableId: _getStreamingVizId(lang, String(body || '').trim()) }))
  ));
  source = source.replace(/```plot\s*\n?([\s\S]*?)```/g, (_match, spec: string) => {
    const trimmed = spec.trim();
    return trimmed ? bank.saveViz(renderPlot(trimmed, { stableId: _getStreamingVizId('plot', trimmed) })) : '';
  });
  source = source.replace(/```plot\s*\n?([\s\S]*?)$/g, (_match, body: string) => (
    bank.saveViz(renderVizLoading({ stableId: _getStreamingVizId('plot', String(body || '').trim()) }))
  ));
  return source.replace(/```(\w*)\n?([\s\S]*?)```/g, (_match, lang: string, code: string) => {
    const trimmed = code.trim();
    const isHtmlLang = lang === 'html' || lang === 'viz' || lang === 'svg';
    const hasSvgTag = /<svg[\s>]/i.test(trimmed);
    const looksLikeHtml = isHtmlLang || hasSvgTag || (
      trimmed.length > 30 && /<\/(style|script|canvas|svg|div|table)>|<style[\s>]/i.test(trimmed)
    );
    if (isHtmlLang || (looksLikeHtml && (trimmed.length > 20 || hasSvgTag))) {
      return bank.saveViz(renderViz(trimmed, { stableId: _getStreamingVizId(lang || 'html', trimmed) }));
    }
    const hljsLang = safeHljsLang(lang);
    const langAttr = hljsLang ? ' class="language-' + escAttr(hljsLang) + '"' : '';
    return bank.save('<pre><code' + langAttr + '>' + escHTML(trimmed) + '</code></pre>');
  });
}

function replaceSettledMath(
  source: string,
  katex: ReturnType<typeof getKatex>,
  bank: PlaceholderBank,
): string {
  if (typeof katex === 'undefined') return source;
  source = source.replace(/\$\$([\s\S]+?)\$\$/g, (match, math: string) => {
    const html = renderStreamMath(math, true, false);
    return html === null ? match : bank.save(html);
  });
  source = source.replace(/\\\[([\s\S]+?)\\\]/g, (match, math: string) => {
    const html = renderStreamMath(math, true, false);
    return html === null ? match : bank.save(html);
  });
  source = source.replace(/\$\$([\s\S]+?)$/g, (match, math: string) => {
    const html = renderStreamMath(math, true, true);
    return html === null ? match : bank.save(html);
  });
  source = source.replace(/\\\[([\s\S]+?)$/g, (match, math: string) => {
    const html = renderStreamMath(math, true, true);
    return html === null ? match : bank.save(html);
  });
  source = replaceInlineDollarMath(source, true, (math: string) => {
    const html = renderStreamMath(math, false, false);
    return html === null ? null : bank.save(html);
  });
  return source.replace(/\\\(([\s\S]+?)\\\)/g, (match, math: string) => {
    const html = renderStreamMath(math, false, false);
    return html === null ? match : bank.save(html);
  });
}

function applyAutoRenderedMath(html: string, bank: PlaceholderBank): string {
  if (typeof window === 'undefined' || typeof window.renderMathInElement !== 'function'
      || typeof document === 'undefined') return bank.restoreViz(sanitizeHtml(html, { chineseProse: true }));

  /* Sanitize before detached parsing so hostile markup cannot start resource loads. */
  const clean = sanitizeHtml(html, { chineseProse: true });
  if (!/\$|\\\(|\\\[/.test(clean)) return bank.restoreViz(clean);
  try {
    const host = document.createElement('div');
    host.innerHTML = clean;
    window.renderMathInElement(host, {
      delimiters: [
        { left: '$$', right: '$$', display: true },
        { left: '$', right: '$', display: false },
        { left: '\\(', right: '\\)', display: false },
        { left: '\\[', right: '\\]', display: true },
      ],
      throwOnError: false,
      macros: KATEX_MACROS,
      ignoredTags: ['script', 'noscript', 'style', 'textarea', 'pre', 'code', 'annotation'],
    });
    html = host.innerHTML;
  } catch (error) {
    console.warn('[formatMsg] auto-render pass skipped:', error && (error as Error).message);
  }
  return bank.restoreViz(sanitizeHtml(html, { chineseProse: true }));
}

function finishMarkedMessage(source: string, bank: PlaceholderBank): string {
  const marked = getMarked();
  if (!marked) return '';
  const html = bank.restoreBlocks(sanitizeUrls(marked.parse(source, { breaks: true, gfm: true })));
  return applyAutoRenderedMath(html, bank);
}

function _formatMsg(t: string): string {
  const marked = getMarked();
  const katex = getKatex(t);
  /* Markdown and math are independent capabilities. If KaTeX is missing
     because its optional CDN script failed, we must still run marked so
     structural Markdown such as `---` remains a horizontal rule instead of
     falling back to escaped plain text. Math delimiters can remain literal
     until KaTeX becomes available. */
  if (typeof marked === 'undefined') return formatWithoutMarked(t);
  const bank = createPlaceholderBank();

  let procT = String(t ?? '');
  procT = procT.replace(/&lt;think&gt;/g, '<think>').replace(/&lt;\/think&gt;/g, '</think>');
  procT = stripChatArtifacts(procT);
  procT = preprocessMarkdown(procT);

  procT = replaceSettledScaffolds(procT, katex, bank);

  procT = replaceSettledCodeBlocks(procT, bank);

  const inlineCodeGuard = _stashInlineCode(procT);
  procT = inlineCodeGuard.text;
  procT = replaceSettledMath(procT, katex, bank);

  procT = inlineCodeGuard.restore(procT);
  return finishMarkedMessage(procT, bank);
}

/* Copy controls are wired after Markdown module initialization. */


export { sanitizeHtml };
export { installCodeBlockCopy };
export { _looksLikeNumericMath, replaceInlineDollarMath };
export { findLastUserMessage, stripMarkdown } from './markdownText.ts';

if (typeof window !== 'undefined') {
  installCodeBlockCopy();
}
