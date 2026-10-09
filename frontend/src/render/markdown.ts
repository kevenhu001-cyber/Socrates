/* ── Markdown + math + viz message renderers ──
   formatMsgProgressive — streaming markdown renderer (called per
     animation frame during streaming).
   formatMsg — final one-shot renderer (called when the message is
     complete or during typeTick animation).
   formatTickSlice — convenience wrapper for the type-tick slider.
   All three exported for use by main.js / doRender / streaming. */

import { esc, escAttr, escHTML, KATEX_MACROS, safeHljsLang } from './helpers.js';
import { renderMermaid, renderViz, renderVizLoading, renderPlot } from './vizStubs.js';
import { preprocessMarkdown, preprocessMarkdownForStreaming, type StreamingPreprocessOptions } from './preprocess.js';
import { stripChatArtifacts } from '../util/stripChatArtifacts.js';
import { sanitizeUrls } from '../util/safe.js';
import { sanitizeHtml } from './sanitizeHtml.js';
import { installCodeBlockCopy } from './markdownCodeCopy.js';
import {
  findStreamScaffold, renderStreamScaffoldPreview,
  streamScaffoldFallbackLabel, streamScaffoldFallbackText,
} from './markdownScaffolds.js';
export { clearStreamScaffolds, registerStreamScaffold } from './markdownScaffolds.js';
import {
  _looksLikeInlineMathTail, _looksLikeNumericMath, _stashInlineCode,
  getKatex, renderStreamMath, replaceInlineDollarMath,
} from './markdownMath.js';

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

  /* Nonce placeholders — a literal "XVIZBLOCK0X" in user text must never
     be replaced with viz HTML. The token is random per call so attacker
     text cannot guess it. */
  const nonce = Math.random().toString(36).slice(2, 10);
  const blockPrefix = '§SCRTB' + nonce;
  const vizPrefix = '§SCRTV' + nonce;
  const blockRe = new RegExp(blockPrefix + '(\\d+)§', 'g');
  const vizRe = new RegExp(vizPrefix + '(\\d+)§', 'g');
  const blocks: string[] = [];
  let pid = 0;
  function save(html: string): string {
    const id = pid++;
    blocks.push(html);
    return blockPrefix + id + '§';
  }
  const vizBlocks: string[] = [];
  let vizPid = 0;
  function saveViz(html: string): string {
    const id = vizPid++;
    vizBlocks.push(html);
    return vizPrefix + id + '§';
  }

  s = s.replace(/^```(?:viz|html|svg)\s*$/m, '```viz\n');

  /* P_chatgpt-parity — strip <think> blocks so thinking process does not
     clutter the chat bubble or persistent transcript; the live status line
     (TurnStatus) handles the transient thinking cue during streaming. */
  s = s.replace(/<think>[\s\S]*?<\/think>/gi, '');
  s = s.replace(/<think>[\s\S]*$/gi, '');

  function _streamScaffoldFallback(tag: string, content: string): string {
    const label = streamScaffoldFallbackLabel(tag);
    let txt = streamScaffoldFallbackText(content);
    txt = txt.replace(/\$\$([\s\S]*?)\$\$/g, function (_, math: string) {
      const html = renderStreamMath(math, true, false);
      return html === null ? _ : save(html);
    });
    txt = txt.replace(/\$(.+?)\$/g, function (_, math: string) {
      const html = renderStreamMath(math, false, false);
      return html === null ? _ : save(html);
    });
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
      } catch {
        /* Plugin threw — fall through to plain-text preview. */
      }
    }
    const preview = renderStreamScaffoldPreview(tag, content, attrs, formatMsgProgressive);
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
      if (opts?.complete) {
        const hljsLang = safeHljsLang(lang);
        const langAttr = hljsLang ? ' class="language-' + escAttr(hljsLang) + '"' : '';
        return save('<pre><code' + langAttr + '>' + escHTML(trimmed) + '</code></pre>');
      }
      return save(
        '<div class="stream-code-pending">' +
          '<div class="stream-code-pending-header">' +
            '<span class="stream-code-badge">' + escHTML(lang || 'code') + '</span>' +
            '<span class="stream-code-dots shimmer-text">…</span>' +
          '</div>' +
        '</div>'
      );
    }
    return save('<span style="color:hsl(var(--text-400));font-style:italic;font-size:0.9em">…</span>');
  });

  const katex = getKatex();
  const inlineCodeGuard = _stashInlineCode(s);
  s = inlineCodeGuard.text;

  if (typeof katex !== 'undefined') {
    /* Closed display math: $$...$$ and \[...\] */
    s = s.replace(/\$\$([\s\S]+?)\$\$/g, function (_, math: string) {
      const html = renderStreamMath(math, true, false);
      return html === null ? _ : save(html);
    });
    s = s.replace(/\\\[([\s\S]+?)\\\]/g, function (_, math: string) {
      const html = renderStreamMath(math, true, false);
      return html === null ? _ : save(html);
    });
    /* Display math still arriving: the closing `$$` or `\]` has not appeared.
       If incomplete, defer with a smooth height placeholder instead of flashing raw LaTeX code. */
    s = s.replace(/\$\$([\s\S]+)$/g, function (_, math: string) {
      const html = renderStreamMath(math, true, true);
      if (html !== null) return save(html);
      return opts?.complete ? _ : save('<div class="katex-display math-stream-placeholder" style="min-height:2em;opacity:0.5;"><span class="scaffold-stream-placeholder shimmer-text">…</span></div>');
    });
    s = s.replace(/\\\[([\s\S]+)$/g, function (_, math: string) {
      const html = renderStreamMath(math, true, true);
      if (html !== null) return save(html);
      return opts?.complete ? _ : save('<div class="katex-display math-stream-placeholder" style="min-height:2em;opacity:0.5;"><span class="scaffold-stream-placeholder shimmer-text">…</span></div>');
    });
  }

  if (typeof katex !== 'undefined') {
    /* Closed inline math: $...$ and \(...\) */
    s = replaceInlineDollarMath(s, false, function (math: string) {
      const html = renderStreamMath(math, false, false);
      return html === null ? null : save(html);
    });
    s = s.replace(/\\\((.+?)\\\)/g, function (m, math: string) {
      const html = renderStreamMath(math, false, false);
      return html === null ? m : save(html);
    });
    /* Inline math still arriving: closing `$` or `\)` has not appeared.
       Defer unclosed tail so incomplete raw syntax is never shown to the user. */
    s = s.replace(/\$([^\n$]+)$/g, function (m, math: string) {
      /* Text that cannot grow has no "still arriving" formula: the final
         renderer leaves an unpaired `$` literal, so this pass must too. */
      if (opts?.complete) return m;
      if (!_looksLikeInlineMathTail(math.trim())) return m;
      const html = renderStreamMath(math, false, true);
      if (html !== null) return save(html);
      return opts?.complete ? m : save('<span class="math-stream-placeholder shimmer-text" style="display:inline-block;width:1.2em;text-align:center;opacity:0.4;">…</span>');
    });
    s = s.replace(/\\\(([^\n\\]+)$/g, function (m, math: string) {
      const html = renderStreamMath(math, false, true);
      if (html !== null) return save(html);
      return opts?.complete ? m : save('<span class="math-stream-placeholder shimmer-text" style="display:inline-block;width:1.2em;text-align:center;opacity:0.4;">…</span>');
    });
  }

  s = inlineCodeGuard.restore(s);

  if (!opts?.complete) {
    s = s.replace(/(?:^|\n)((?:\|[^\n]+\|\s*\n?)+)$/, function () {
      return save('<div class="table-stream-placeholder shimmer-text"><span class="table-stream-icon">⊞</span> 正在生成表格…</div>');
    });
  }

  let html: string;
  const marked = getMarked();
  if (typeof marked !== 'undefined') {
    html = marked.parse(s, { breaks: true, gfm: true });
  } else {
    html = '<p>' + escHTML(s).replace(/\n\n/g, '</p><p>').replace(/\n/g, '<br>') + '</p>';
  }

  html = html.replace(blockRe, function (_, id: string) {
    return blocks[parseInt(id)];
  });

  const sanitized = sanitizeHtml(html);
  return sanitized.replace(vizRe, function (_, id: string) {
    return vizBlocks[parseInt(id)];
  });
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

function _formatMsg(t: string): string {
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
    raw = raw.replace(/```(viz|html|svg)\s*\n?([\s\S]*?)```/gi, function (_, lang: string, content: string) {
      const trimmed = content.trim();
      return trimmed ? saveFallbackViz(renderViz(trimmed, { stableId: _getStreamingVizId(lang, trimmed) })) : '';
    });
    raw = raw.replace(/```plot\s*\n?([\s\S]*?)```/gi, function (_, content: string) {
      const trimmed = content.trim();
      return trimmed ? saveFallbackViz(renderPlot(trimmed, { stableId: _getStreamingVizId('plot', trimmed) })) : '';
    });
    raw = raw.replace(/```(viz|html|svg|plot)\s*\n?([\s\S]*?)$/i, function (_, lang: string, body: string) {
      return saveFallbackViz(renderVizLoading({ streaming: true, stableId: _getStreamingVizId(lang, String(body || '').trim()) }));
    });
    const fallbackHtml = '<p>' + esc(raw).replace(/```(\w*)\r?\n?([\s\S]*?)```/g, function (_, _l: string, c: string) { return '<pre><code>' + esc(c.trim()) + '</code></pre>'; }).replace(/`([^`]+)`/g, '<code>$1</code>').replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>').replace(/\*(.+?)\*/g, '<em>$1</em>').replace(/\n\n/g, '</p><p>').replace(/\n/g, '<br>') + '</p>';
    return fallbackHtml.replace(/XVIZFALLBACK(\d+)X/g, function (_, id: string) { return fallbackViz[parseInt(id, 10)] || ''; });
  }
  const blocks: string[] = [];
  const msgNonce = Math.random().toString(36).slice(2, 10);
  const msgBlockPrefix = '§SCRTB' + msgNonce;
  const msgVizPrefix = '§SCRTV' + msgNonce;
  const msgBlockRe = new RegExp(msgBlockPrefix + '(\\d+)§', 'g');
  const msgVizRe = new RegExp(msgVizPrefix + '(\\d+)§', 'g');
  let pid = 0;
  function save(html: string): string {
    const id = pid++;
    blocks.push(html);
    return msgBlockPrefix + id + '§';
  }
  const vizBlocks: string[] = [];
  let vizPid = 0;
  function saveViz(html: string): string {
    const id = vizPid++;
    vizBlocks.push(html);
    return msgVizPrefix + id + '§';
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
        catch { return save('<pre>' + esc('$$' + math + '$$') + '</pre>'); }
      });
      txt = replaceInlineDollarMath(txt, false, function (math: string) {
        try { return save(katex.renderToString(math.trim(), { displayMode: false, throwOnError: false, macros: KATEX_MACROS })); }
        catch { return save('<code>' + esc('$' + math + '$') + '</code>'); }
      });
    }
    return save('<div class="scaffold-stream"><span class="scaffold-stream-label">' + label + '</span>' + esc(txt) + '</div>');
  });
  procT = procT.replace(/<(quiz|example|practice|definition|step|flashcard|proof|theorem|key-point|derivation)\b[^>]*>([\s\S]*?)$/gi, function (_, tag: string) {
    return save('<span class="scaffold-stream scaffold-stream-unclosed">…' + esc(tag) + '…</span>');
  });

  procT = procT.replace(/^```(?:viz|html|svg)\s*$/m, '```viz\n');

  /* P_chatgpt-parity — settled messages and reloaded history do not retain
     collapsible thinking blocks; user sees only the finished answer. */
  procT = procT.replace(/<think>[\s\S]*?<\/think>/gi, '');
  procT = procT.replace(/<think>[\s\S]*$/gi, '');

  procT = procT.replace(/```mermaid\s*\n?([\s\S]*?)```/g, function (_, code: string) {
    const trimmed = code.trim();
    /* Content-derived ids match the ids the streaming pass assigned, so a
       finish/history re-render reuses the same card element (see
       reclaimVizCards) instead of reloading the iframe/diagram. */
    return trimmed ? saveViz(renderMermaid(trimmed, { stableId: _getStreamingVizId('mermaid', trimmed) })) : '';
  });
  procT = procT.replace(/```mermaid\s*\n?([\s\S]*?)$/g, function (_, body: string) {
    return saveViz(renderVizLoading({ stableId: _getStreamingVizId('mermaid', String(body || '').trim()) }));
  });

  procT = procT.replace(/```(viz|html|svg)\s*\n?([\s\S]*?)```/g, function (_, lang: string, json: string) {
    const trimmed = json.trim();
    /* Same key derivation as the streaming pass (lang || 'html'). */
    return trimmed ? saveViz(renderViz(trimmed, { stableId: _getStreamingVizId(lang, trimmed) })) : '';
  });
  procT = procT.replace(/```(viz|html|svg)\s*\n?([\s\S]*?)$/g, function (_, lang: string, body: string) {
    return saveViz(renderVizLoading({ stableId: _getStreamingVizId(lang, String(body || '').trim()) }));
  });

  procT = procT.replace(/```plot\s*\n?([\s\S]*?)```/g, function (_, spec: string) {
    const trimmed = spec.trim();
    return trimmed ? saveViz(renderPlot(trimmed, { stableId: _getStreamingVizId('plot', trimmed) })) : '';
  });
  procT = procT.replace(/```plot\s*\n?([\s\S]*?)$/g, function (_, body: string) {
    return saveViz(renderVizLoading({ stableId: _getStreamingVizId('plot', String(body || '').trim()) }));
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
      return saveViz(renderViz(trimmed, { stableId: _getStreamingVizId(lang || 'html', trimmed) }));
    }
    const hljsLang = safeHljsLang(lang);
    const langAttr = hljsLang ? ' class="language-' + escAttr(hljsLang) + '"' : '';
    return save('<pre><code' + langAttr + '>' + escHTML(trimmed) + '</code></pre>');
  });

  const inlineCodeGuard = _stashInlineCode(procT);
  procT = inlineCodeGuard.text;

  if (typeof katex !== 'undefined') {
    procT = procT.replace(/\$\$([\s\S]+?)\$\$/g, function (_, math: string) {
      const html = renderStreamMath(math, true, false);
      return html === null ? _ : save(html);
    });
    procT = procT.replace(/\\\[([\s\S]+?)\\\]/g, function (_, math: string) {
      const html = renderStreamMath(math, true, false);
      return html === null ? _ : save(html);
    });
    /* Final pass on a message whose `$$` or `\]` never closed (truncated output,
       a Stop mid-formula). Auto-close open environments and neutralize
       parse-error spans so the stored answer shows calm partial math
       instead of a red KaTeX error block. */
    procT = procT.replace(/\$\$([\s\S]+?)$/g, function (_, math: string) {
      const html = renderStreamMath(math, true, true);
      return html === null ? _ : save(html);
    });
    procT = procT.replace(/\\\[([\s\S]+?)$/g, function (_, math: string) {
      const html = renderStreamMath(math, true, true);
      return html === null ? _ : save(html);
    });

    procT = replaceInlineDollarMath(procT, true, function (math: string) {
      const html = renderStreamMath(math, false, false);
      return html === null ? null : save(html);
    });
    procT = procT.replace(/\\\(([\s\S]+?)\\\)/g, function (m, math: string) {
      const html = renderStreamMath(math, false, false);
      return html === null ? m : save(html);
    });
  }

  procT = inlineCodeGuard.restore(procT);

  let html = marked.parse(procT, { breaks: true, gfm: true });
  html = sanitizeUrls(html);
  html = html.replace(msgBlockRe, function (_, id: string) {
    return blocks[parseInt(id)];
  });

  if (typeof window !== 'undefined' && typeof window.renderMathInElement === 'function'
     && typeof document !== 'undefined') {
    /* Sanitize BEFORE the detached host parses the markup. Setting
       innerHTML starts resource loads and fires their error handlers
       even when the node is not in the document, so an
       `<img onerror=…>` payload would run against the live page
       before the final sanitize pass. */
    const clean = sanitizeHtml(html);
    /* P_single-sanitize — the auto-render pass exists for math the regex
       passes above did not claim. With no delimiter left in the markup it
       cannot change anything, and `clean` is already the final sanitized
       output — so skip the detached re-parse and the second DOMPurify run,
       which together were ~half the cost of rendering a KaTeX-heavy answer.
       Any delimiter at all (a literal "$5" included) takes the full path. */
    if (!/\$|\\\(|\\\[/.test(clean)) {
      return clean.replace(msgVizRe, function (_, id: string) {
        return vizBlocks[parseInt(id)];
      });
    }
    try {
      const _arHost = document.createElement('div');
      /* The final sanitize below still runs (idempotent) to cover this
         pass's own output. */
      _arHost.innerHTML = clean;
      window.renderMathInElement(_arHost, {
        delimiters: [
          { left: '$$', right: '$$', display: true },
          { left: '$', right: '$', display: false },
          { left: '\\(', right: '\\)', display: false },
          { left: '\\[', right: '\\]', display: true },
        ],
        throwOnError: false,
        macros: KATEX_MACROS,
        /* `annotation` carries the raw TeX inside KaTeX's MathML and must
           never be re-scanned for delimiters. */
        ignoredTags: ['script', 'noscript', 'style', 'textarea', 'pre', 'code', 'annotation'],
      });
      html = _arHost.innerHTML;
    } catch (_arErr) {
      console.warn('[formatMsg] auto-render pass skipped:', _arErr && (_arErr as Error).message);
    }
  }

  const sanitized = sanitizeHtml(html);
  return sanitized.replace(msgVizRe, function (_, id: string) {
    return vizBlocks[parseInt(id)];
  });
}

/* Copy controls are wired after Markdown module initialization. */


export { sanitizeHtml };
export { installCodeBlockCopy };
export { _looksLikeNumericMath, replaceInlineDollarMath };
export { findLastUserMessage, stripMarkdown } from './markdownText.js';

if (typeof window !== 'undefined') {
  installCodeBlockCopy();
}
