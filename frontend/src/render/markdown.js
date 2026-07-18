/* ── Markdown + math + viz message renderers ──
   formatMsgProgressive — streaming markdown renderer (called per
     animation frame during streaming).
   formatMsg — final one-shot renderer (called when the message is
     complete or during typeTick animation).
   formatTickSlice — convenience wrapper for the type-tick slider.
   All three exported for use by main.js / doRender / streaming. */

import { esc, escAttr, escHTML, KATEX_MACROS, safeHljsLang } from './helpers.js';
import { renderMermaid, renderViz, renderVizLoading, renderVizError, renderPlot } from './viz.js';
import { preprocessMarkdown, preprocessMarkdownForStreaming } from './preprocess.js';
import { stripChatArtifacts } from '../util/stripChatArtifacts.js';
import { sanitizeUrls } from '../util/safe.js';

/* ── DOMPurify configuration ──────────────────────────────────────
   Used by both formatMsg and formatMsgProgressive to sanitise the
   rendered HTML before it reaches the DOM.

   marked.parse() passes raw HTML through by default; the previous
   build relied on sanitizeUrls() alone, which only filtered URL
   schemes (javascript:, data:text/html, …). It did NOT block
   inline event handlers (onerror, onclick, onload, …) or other
   vectors like <form action>, <base href>, <meta http-equiv>.

   DOMPurify closes that gap with a defense-in-depth pass:

   Allowed tags
   ------------
   - Standard markdown output (p, h1-h6, ul/ol/li, pre/code, …)
   - Think-block widgets (details/summary) for reasoning models
   - KaTeX output (math, semantics, mrow, mfrac, …, span with
     inline styles)
   - Mermaid SVG output (svg, g, path, rect, line, polygon, …)
   - Custom scaffold tags (theorem, proof, key-point, derivation)

   Forbidden by default
   --------------------
   - <script>, <style>, <iframe>, <form>, <object>, <embed>
   - All on* event handlers (onclick, onerror, onload, onmouseover, …)
   - javascript:, vbscript:, data:text/html in href/src

   KaTeX legitimately uses the `style` attribute for math layout
   (margin-right, vertical-align, etc.); allowing it here is a
   necessary trade-off. The risk is limited: CSS itself can't
   execute JavaScript, and KaTeX styles are static strings emitted
   by a vetted library, not user-controlled input.

   The ALLOWED_URI_REGEXP permits http(s), mailto, relative URLs,
   and data: only on image sources (the second regexp below). */
var PURIFY_CONFIG = {
  ADD_TAGS: ['theorem', 'proof', 'key-point', 'derivation'],
  ADD_ATTR: ['target', 'rel'],
  ALLOWED_URI_REGEXP: /^(?:(?:https?|mailto):|[^a-z]|[a-z+.\-]+(?:[^a-z+.\-:]|$))/i,
  /* Keep the entire tree intact (don't drop tags but keep content). */
  KEEP_CONTENT: true,
  /* Don't return a DocumentFragment — return a string for innerHTML. */
  RETURN_DOM_FRAGMENT: false,
  RETURN_DOM: false,
  /* Forbid dangerous tags even if marked somehow lets them through. */
  FORBID_TAGS: ['script', 'style', 'iframe', 'object', 'embed', 'form',
                'meta', 'link', 'base', 'frame', 'frameset', 'noframes',
                'noscript', 'html', 'head', 'body'],
  /* Forbid all on* event handlers. DOMPurify's default already strips
     these; the explicit list documents intent. */
  FORBID_ATTR: ['onerror', 'onclick', 'onload', 'onmouseover', 'onfocus',
                'onblur', 'onchange', 'onsubmit', 'onkeydown', 'onkeyup',
                'onkeypress', 'onmousedown', 'onmouseup', 'onmousemove',
                'onmouseout', 'onmouseenter', 'onmouseleave', 'oninput',
                'onpointerdown', 'onpointerup', 'onanimationend',
                'onanimationstart', 'ontransitionend'],
};

/* Apply DOMPurify if available; fall back to sanitizeUrls only. The
   CSP already mitigates remote script loading (no 'unsafe-inline'
   in script-src), but inline event handlers in the rendered HTML
   bypass CSP entirely — DOMPurify is the only line of defense. */
function sanitizeHtml(html) {
  if (typeof DOMPurify !== 'undefined') {
    try {
      return DOMPurify.sanitize(html, PURIFY_CONFIG);
    } catch (e) {
      // If DOMPurify fails for any reason, fall back to sanitizeUrls
      // so we don't drop the entire message.
      console.warn('[sanitizeHtml] DOMPurify failed, falling back:', e && e.message);
      return sanitizeUrls(html);
    }
  }
  return sanitizeUrls(html);
}

/* Stream-time scaffold plugins.
   main.js registers (parser, renderer) pairs here so the streaming
   pass can render widgets inline instead of falling back to a
   plain-text "[Quick Check] body…" preview. The plugin format:
     { name: 'theorem', parse: (inner) => parsedOrNull,
       render: (parsed) => htmlString }
   If `parse` returns null, the streaming pass falls back to a labelled
   plain-text preview so the user still sees the content, just not in
   its final styled form. */
var STREAM_SCAFFOLD_PLUGINS = [];

/* Lightweight plain-text fallback used when no plugin is registered OR
   when the plugin returns null. The streaming pass should never block
   on a missing plugin — at minimum we surface the scaffold as readable
   labelled text. */
var STREAM_SCAFFOLD_FALLBACK = {
  quiz:      '[Quick Check]',
  example:   '[Example]',
  practice:  '[Practice]',
  definition:'[Definition]',
  step:      '[Step]',
  flashcard: '[Flashcard]',
  proof:     '[Proof]',
  theorem:   '[Theorem]',
  'key-point':'[Key Point]',
  derivation:'[Derivation]'
};

export function registerStreamScaffold(name, parse, render) {
  /* Replace existing plugin with the same name so the latest call
     wins. main.js re-registers on every module load. */
  STREAM_SCAFFOLD_PLUGINS = STREAM_SCAFFOLD_PLUGINS.filter(function(p){
    return p.name !== name;
  });
  STREAM_SCAFFOLD_PLUGINS.push({ name: name, parse: parse, render: render });
}

export function clearStreamScaffolds() {
  STREAM_SCAFFOLD_PLUGINS = [];
}

/* Lookup helper — returns the plugin object for a given tag name, or
   null. Used by formatMsgProgressive. */
function findStreamScaffold(name) {
  for (var i = 0; i < STREAM_SCAFFOLD_PLUGINS.length; i++) {
    if (STREAM_SCAFFOLD_PLUGINS[i].name === name) return STREAM_SCAFFOLD_PLUGINS[i];
  }
  return null;
}

/* --------------------------------------------------------------
 * Think-block builder — shared by the streaming and final renderers.
 *
 * Minimal think summary: streaming shows a spinner, finalized shows
 * just the label + word count. No decorative icons, no animations.
 * -------------------------------------------------------------- */

function _thinkUnitCount(s){
  if(!s)return 0;
  /* CJK characters count individually; for Latin/other scripts
     split on whitespace. This gives a sensible "thought size" for
     both Chinese reasoning (e.g. 思考了 412 字) and English
     reasoning (e.g. Thought · 412 words). */
  var cjk = (s.match(/[㐀-鿿豈-﫿]/g) || []).length;
  var rest = s.replace(/[㐀-鿿豈-﫿]/g, " ").trim();
  var words = rest ? rest.split(/\s+/).filter(Boolean).length : 0;
  return cjk + words;
}

function _formatThinkMeta(n){
  if(!n) return "";
  var key = n === 1 ? "think.wordCountOne" : "think.wordCount";
  var tmpl = (typeof window !== "undefined" && window.t) ? window.t(key) : "";
  /* t() supports {n} substitution via .replace; do the same. */
  if(tmpl && tmpl.indexOf("{n}") !== -1) return tmpl.replace("{n}", n);
  /* Fallback if i18n key is missing for some reason. */
  return (n === 1 ? "1 word" : n + " words");
}

function _thinkSummary(opts){
  /* opts: { streaming: bool, count: number } */
  var label = opts.streaming
    ? ((typeof window !== "undefined" && window.t) ? window.t("think.thinking") : "Thinking…")
    : ((typeof window !== "undefined" && window.t) ? window.t("think.title") : "Thought");
  var meta  = (!opts.streaming && opts.count > 0)
    ? '<span class="think-summary-meta">' + esc(_formatThinkMeta(opts.count)) + '</span>'
    : '';
  var icon = opts.streaming
    ? '<span class="thinking-ring thinking-ring-sm" aria-hidden="true"></span>'
    : '';
  return '<summary class="think-summary">' +
    icon +
    '<span class="think-summary-label">' + esc(label) + '</span>' +
    meta +
    '<span class="think-summary-chevron" aria-hidden="true"></span>' +
  '</summary>';
}

function _thinkDetails(inner, opts){
  /* opts: { streaming: bool, count: number } */
  var cls = 'think-block' + (opts.streaming ? ' think-block-streaming' : '');
  var openAttr = opts.streaming ? ' open' : '';
  return '<details class="' + cls + '"' + openAttr + '>' +
    _thinkSummary(opts) +
    '<div class="think-content">' + inner + '</div>' +
  '</details>';
}

export function formatTickSlice(full,len){
  return formatMsgProgressive(full.slice(0,len));
}

/* P_viz-stable-id — fence-key → stable viz-card-N. Persists across
   rAF ticks inside one streaming message so the same <div class="viz">
   is replaced in-place instead of torn down + re-created each frame.

   Fingerprint key: "lang + '\x00' + content.slice(0, 50)". The first
   50 chars are stable for an in-progress fence (the user is appending
   to the tail), and the language tag prevents collision between two
   fences of different languages whose first 50 chars happen to match.

   The Map is append-only across a single streaming message. Each
   entry is a few dozen bytes; even long sessions don't blow memory.
   formatMsg (the one-shot final renderer) does NOT consult this Map —
   its innerHTML swap is atomic and the iframe mount handshake is
   handled by processPendingViz() in main.js's finish(). */
var _streamingVizIds = new Map();
function _streamingFingerprint(lang, content) {
  return (lang || '') + '\x00' + String(content || '').slice(0, 50);
}
function _getStreamingVizId(lang, content) {
  var key = _streamingFingerprint(lang, content);
  var id = _streamingVizIds.get(key);
  if (!id) {
    /* Lazily mint an id. We don't call ++_vizId here because viz.js
       owns the counter — instead we use a stable, prefix-tagged id
       that viz.js can recognize and reuse via opts.stableId. */
    id = 'viz-card-stream-' + key.replace(/[^\w]/g, '_');
    _streamingVizIds.set(key, id);
  }
  return id;
}

export function formatMsgProgressive(t){
  if(!t)return"";
  var s=preprocessMarkdownForStreaming(String(t));
  if(s.charCodeAt(s.length-1)===10){s=s.slice(0,-1)}
  if(!s)return"";

  var blocks=[];
  var pid=0;
  function save(html){
    var id=pid++;
    blocks.push(html);
    return'XBLOCK'+id+'X';
  }
  /* Separate pool for viz/mermaid cards — same rationale as formatMsg:
     their iframes are stripped by DOMPurify, so we restore them AFTER
     the sanitize pass. */
  var vizBlocks=[];
  var vizPid=0;
  function saveViz(html){
    var id=vizPid++;
    vizBlocks.push(html);
    return'XVIZBLOCK'+id+'X';
  }

  /* 1. Normalize ```svg / ```html → ```viz so the explicit-lang
     code fence handler catches them. Must run before think blocks
     and code fence processing. */
  s=s.replace(/^```(?:viz|html|svg)\s*$/m,'```viz\n');

  /* 2. Closed think blocks */
  s=s.replace(/<think>([\s\S]*?)<\/think>/g,function(_,content){
    var inner;
    try{
      inner=formatMsgProgressive(content.trim().replace(/<\/?think>/g,""));
    }catch(_e){
      inner=escHTML(content.trim());
    }
    return save(_thinkDetails(inner,{streaming:false,count:_thinkUnitCount(content.trim().replace(/<\/?think>/g,""))}));
  });
  /* Unclosed thinking — show pulsing placeholder */
  s=s.replace(/<think>([\s\S]*)$/g,function(_,content){
    var inner="";
    try{
      var c=content.trim().replace(/<\/?think>/g,"");
      inner=c?formatMsgProgressive(c):'<span class="thinking-ring thinking-ring-sm"></span> Thinking\u2026';
    }catch(_e){
      inner=escHTML(content.trim());
    }
    return save(_thinkDetails(inner,{streaming:true,count:_thinkUnitCount(content.trim().replace(/<\/?think>/g,""))}));
  });

  /* 1b. Tutor scaffold blocks — try the stream-time plugin first;
     fall back to a labelled plain-text preview if no plugin is
     registered or the parser returns null. The plugin path lets
     theorem / proof / key-point / derivation (and others, if
     registered) appear as their full styled widget as soon as
     </tag> lands during streaming. */
  function _scaffoldText(inner) {
    var text = inner.replace(/<[^>]+>/g, '').trim();
    return text.length > 200 ? text.slice(0, 200) + '\u2026' : text;
  }
  function _streamScaffoldFallback(tag, content) {
    var label = STREAM_SCAFFOLD_FALLBACK[tag] || '[' + tag + ']';
    var txt = _scaffoldText(content);
    /* Render LaTeX inside the fallback text so $...$ and $$...$$
       are processed by KaTeX even before a proper scaffold plugin
       is registered. Without this, theorem/proof/key-point/derivation
       blocks show literal dollar signs during streaming. */
    if(typeof katex!=="undefined"){
      txt=txt.replace(/\$\$([\s\S]*?)\$\$/g,function(_,math){
        try{return save(katex.renderToString(math.trim(),{displayMode:true,throwOnError:false,macros:KATEX_MACROS}))}
        catch(e){return save('<pre>$$'+escHTML(math)+'$$</pre>')}
      });
      txt=txt.replace(/\$(.+?)\$/g,function(_,math){
        try{return save(katex.renderToString(math.trim(),{displayMode:false,throwOnError:false,macros:KATEX_MACROS}))}
        catch(e){return save('<code>$'+escHTML(math)+'$</code>')}
      });
    }
    return save('<div class="scaffold-stream"><span class="scaffold-stream-label">'
                + label + '</span> ' + escHTML(txt) + '</div>');
  }
  function _streamScaffold(tag, content) {
    var plugin = findStreamScaffold(tag);
    if (plugin) {
      try {
        var parsed = plugin.parse(content);
        if (parsed) {
          var html = plugin.render(parsed);
          if (html) return save(html);
        }
      } catch (e) {
        /* Plugin threw \u2014 fall through to plain-text preview. */
      }
    }
    return _streamScaffoldFallback(tag, content);
  }
  s = s.replace(/<(quiz|example|practice|definition|flashcard|proof|theorem|key-point|derivation)\b[^>]*>([\s\S]*?)<\/\1>/gi, function(_, tag, content) {
    return _streamScaffold(tag, content);
  });
  s = s.replace(/<step\b[^>]*>([\s\S]*?)<\/step>/gi, function(_, content) {
    return _streamScaffold('step', content);
  });
  /* Unclosed scaffold tag \u2014 show a labelled pulsing pill so the user
     sees the model mid-scaffold without leaking raw XML. */
  s = s.replace(/<(quiz|example|practice|definition|step|flashcard|proof|theorem|key-point|derivation)\b[^>]*>([\s\S]*?)$/gi, function(_, tag) {
    var label = STREAM_SCAFFOLD_FALLBACK[tag] || '[' + tag + ']';
    return save('<span class="scaffold-stream scaffold-stream-unclosed"><span class="scaffold-stream-label">' + label + '</span> <span class="thinking-ring thinking-ring-sm"></span></span>');
  });

  /* ═══════════════════════════════════════════════════════════════
     CODE-FENCE & VIZ HANDLERS — MUST run BEFORE math handlers
     below, so that $ characters inside SVG/HTML code fences are
     never misinterpreted as LaTeX delimiters by the $...$ regex.
     This mirrors the order in formatMsg().
     ═══════════════════════════════════════════════════════════════ */

  /* 2. Mermaid diagram blocks — render during streaming so the user
     sees the diagram live instead of a code block. */
  s=s.replace(/```mermaid\s*\n?([\s\S]*?)```/g,function(_,code){
    var trimmed=code.trim();
    return trimmed?saveViz(renderMermaid(trimmed, { stableId: _getStreamingVizId('mermaid', trimmed) })):'';
  });
  s=s.replace(/```mermaid\s*\n?([\s\S]*?)$/g,function(_,body){
    var trimmed=body.trim();
    return saveViz(renderVizLoading({streaming:true, stableId: _getStreamingVizId('mermaid', trimmed)}));
  });

  /* 3. ```plot``` fence — JS-only math plot. Routed before generic
     code fences so plot isn't mistaken for a code-block language. */
  s=s.replace(/```plot\s*\n?([\s\S]*?)```/g,function(_,spec){
    var trimmed=spec.trim();
    return trimmed?saveViz(renderPlot(trimmed, { stableId: _getStreamingVizId('plot', trimmed) })):'';
  });
  s=s.replace(/```plot\s*\n?([\s\S]*?)$/g,function(_,body){
    var trimmed=body.trim();
    return saveViz(renderVizLoading({streaming:true, stableId: _getStreamingVizId('plot', trimmed)}));
  });

  /* 4. Closed code fences — detect HTML/SVG/viz content and render as
     sandboxed iframe (mirrors formatMsg's detection logic).
     Explicit language tags (svg/html/viz) bypass the length threshold
     so even a tiny <svg/> gets rendered rather than shown as code. */
  s=s.replace(/```(\w*)\n?([\s\S]*?)```/g,function(_,lang,code){
    var trimmed=code.trim();
    var isHtmlLang=lang==="html"||lang==="viz"||lang==="svg";
    /* P_svg-auto-detect — detect SVG content even in short blocks.
       A bare ``` <svg viewBox="0 0 100 100"><circle r="10"/></svg> ```
       without explicit language tag needs to be routed to renderViz,
       not shown as a code block. We detect `<svg` as a strong signal
       independently of the generic HTML length threshold. */
    var hasSvgTag=/<svg[\s>]/i.test(trimmed);
    var looksLikeHtml=isHtmlLang||hasSvgTag||(
      trimmed.length>30&&
      /<\/(style|script|canvas|svg|div|table)>|<style[\s>]/i.test(trimmed)
    );
    /* Explicit html/viz/svg lang → no length limit. Auto-detected
       HTML requires at least 20 chars to avoid false positives.
       SVG tags are exempt from the length requirement since even
       a single <svg><circle r="10"/></svg> is valid rendered content. */
    if(isHtmlLang || looksLikeHtml && (trimmed.length>20 || hasSvgTag)){
      return saveViz(renderViz(trimmed, { stableId: _getStreamingVizId(lang || 'html', trimmed) }));
    }
    var hljsLang=safeHljsLang(lang);
    var langAttr=hljsLang?' class="language-'+escAttr(hljsLang)+'"':'';
    return save('<pre><code'+langAttr+'>'+escHTML(trimmed)+'</code></pre>');
  });

  /* 5. Unclosed code fence — show a viz loading placeholder for
     known viz languages, otherwise a monospace code block. */
  s=s.replace(/```(\w*)\n?([\s\S]*)$/g,function(_,lang,body){
    var trimmed=body.trim();
    if(trimmed){
      var isHtmlLang=lang==="html"||lang==="viz"||lang==="svg";
      if(isHtmlLang){
        return saveViz(renderVizLoading({streaming:true, stableId: _getStreamingVizId(lang || 'html', trimmed)}));
      }
      var hljsLang=safeHljsLang(lang);
      var langAttr=hljsLang?' class="language-'+escAttr(hljsLang)+'"':'';
      return save('<pre><code'+langAttr+'>'+escHTML(trimmed)+'</code></pre>');
    }
    return save('<span style="color:hsl(var(--text-400));font-style:italic;font-size:0.9em">\u2026</span>');
  });

  /* ═══════════════════════════════════════════════════════════════
     MATH HANDLERS — process $ and $$ delimiters. Safe to run now
     because all code-fence content has been stashed into XBLOCK or
     XVIZBLOCK placeholders and won't be matched by these regexes.
     ═══════════════════════════════════════════════════════════════ */

  /* 6. Display math $$...$$ */
  if(typeof katex!=="undefined"){
    s=s.replace(/\$\$([\s\S]+?)\$\$/g,function(_,math){
      try{
        return save(katex.renderToString(math.trim(),{displayMode:true,throwOnError:false,macros:KATEX_MACROS}));
      }catch(e){
        return save('<pre>'+escHTML('$$'+math+'$$')+'</pre>');
      }
    });
    s=s.replace(/\$\$([\s\S]+)$/g,function(_,math){
      try{
        return save(katex.renderToString(math.trim(),{displayMode:true,throwOnError:false,macros:KATEX_MACROS}));
      }catch(e){
        return save('<span class="math-partial" style="color:hsl(var(--text-400));font-style:italic;font-size:0.9em">\u2026</span>');
      }
    });
  }

  /* 7. Inline math $...$ */
  if(typeof katex!=="undefined"){
    s=s.replace(/\$(.+?)\$/g,function(_,math){
      try{
        return save(katex.renderToString(math.trim(),{displayMode:false,throwOnError:false,macros:KATEX_MACROS}));
      }catch(e){
        return save('<code>'+escHTML("$"+math+"$")+'</code>');
      }
    });
  }

  /* 8. Render Markdown via marked.parse */
  var html;
  if(typeof marked!=="undefined"){
    html=marked.parse(s,{breaks:true,gfm:true});
  }else{
    html="<p>"+escHTML(s).replace(/\n\n/g,"</p><p>").replace(/\n/g,"<br>")+"</p>";
  }

  /* 9. Restore protected blocks */
  html=html.replace(/XBLOCK(\d+)X/g,function(_,id){
    return blocks[parseInt(id)];
  });

  /* 10. Sanitise the final HTML with DOMPurify.
     marked.parse() passes raw HTML through by default — this is
     the only line of defense against XSS via injected HTML. The
     `sanitizeUrls` pass earlier only filtered URL schemes; it did
     not strip inline event handlers (onerror, onclick, onload). */
  var sanitized=sanitizeHtml(html);
  /* Restore viz blocks AFTER DOMPurify so iframes survive. */
  return sanitized.replace(/XVIZBLOCK(\d+)X/g,function(_,id){
    return vizBlocks[parseInt(id)];
  });
}

export function formatMsg(t){
  if(typeof marked==="undefined"||typeof katex==="undefined"){
    /* Rendering a sandboxed visualization must not depend on optional CDN
       markdown/math globals. Without this branch, an offline page turned a
       complete ```html fence into escaped code even though Viz is local. */
    var fallbackViz=[];
    function saveFallbackViz(html){
      var id=fallbackViz.length;
      fallbackViz.push(html);
      return 'XVIZFALLBACK'+id+'X';
    }
    var raw=preprocessMarkdown(t);
    raw=raw.replace(/```(?:viz|html|svg)\s*\n?([\s\S]*?)```/gi,function(_,content){
      var trimmed=content.trim();
      return trimmed?saveFallbackViz(renderViz(trimmed)):'';
    });
    raw=raw.replace(/```plot\s*\n?([\s\S]*?)```/gi,function(_,content){
      var trimmed=content.trim();
      return trimmed?saveFallbackViz(renderPlot(trimmed)):'';
    });
    raw=raw.replace(/```(?:viz|html|svg|plot)\s*\n?([\s\S]*)$/i,function(_,content){
      return saveFallbackViz(renderVizLoading({streaming:true}));
    });
    var fallbackHtml="<p>"+esc(raw).replace(/```(\w*)\r?\n?([\s\S]*?)```/g,function(_,l,c){return"<pre><code>"+esc(c.trim())+"</code></pre>"}).replace(/`([^`]+)`/g,"<code>$1</code>").replace(/\*\*(.+?)\*\*/g,"<strong>$1</strong>").replace(/\*(.+?)\*/g,"<em>$1</em>").replace(/\n\n/g,"</p><p>").replace(/\n/g,"<br>")+"</p>";
    return fallbackHtml.replace(/XVIZFALLBACK(\d+)X/g,function(_,id){return fallbackViz[parseInt(id)]||'';});
  }
  var blocks=[];
  var pid=0;
  function save(html){
    var id=pid++;
    blocks.push(html);
    return'XBLOCK'+id+'X';
  }
  /* Separate pool for viz/mermaid cards. Their HTML embeds a
     sandboxed <iframe srcdoc=…> that the main DOMPurify pass
     strips (FORBID_TAGS includes 'iframe' and 'frame'). We
     restore viz placeholders AFTER DOMPurify below so the iframe
     survives. The placeholders use a distinct prefix (VIZBLOCK)
     so the pre-sanitize BLOCK<n> restore leaves them alone. */
  var vizBlocks=[];
  var vizPid=0;
  function saveViz(html){
    var id=vizPid++;
    vizBlocks.push(html);
    return'XVIZBLOCK'+id+'X';
  }

  t=t.replace(/&lt;think&gt;/g,'<think>').replace(/&lt;\/think&gt;/g,'</think>');
  t=stripChatArtifacts(t);
  t=preprocessMarkdown(t);

  /* Fallback safety: strip raw scaffold XML */
  t=t.replace(/<(quiz|example|practice|definition|flashcard)\b[^>]*>([\s\S]*?)<\/\1>/gi,function(_,tag,content){
    var label='['+(tag==='quiz'?'Quiz':tag==='example'?'Example':tag==='practice'?'Practice':tag==='definition'?'Definition':'Flashcard')+']';
    var txt=content.replace(/<[^>]+>/g,'').trim();
    if(txt.length>300)txt=txt.slice(0,300)+'\u2026';
    return save('<div class="scaffold-stream"><span class="scaffold-stream-label">'+label+'</span>'+esc(txt)+'</div>');
  });
  t=t.replace(/<step\b[^>]*>([\s\S]*?)<\/step>/gi,function(_,content){
    var txt=content.replace(/<[^>]+>/g,'').trim();
    if(txt.length>300)txt=txt.slice(0,300)+'\u2026';
    return save('<div class="scaffold-stream"><span class="scaffold-stream-label">[Step]</span>'+esc(txt)+'</div>');
  });
  /* Math-flavored scaffolds (proof / theorem / key-point / derivation) */
  t=t.replace(/<(proof|theorem|key-point|derivation)\b[^>]*>([\s\S]*?)<\/\1>/gi,function(_,tag,content){
    var label='['+(tag==='proof'?'Proof':tag==='theorem'?'Theorem':tag==='key-point'?'Key Point':'Derivation')+']';
    var txt=content.replace(/<[^>]+>/g,'').trim();
    if(txt.length>300)txt=txt.slice(0,300)+'\u2026';
    /* Render LaTeX inside the content before saving the scaffold block,
       so $...$ and $$...$$ are processed by KaTeX instead of appearing
       as literal text. We use the same save() pattern so inner math
       blocks are restored alongside the outer scaffold block. */
    if(typeof katex!=="undefined"){
      txt=txt.replace(/\$\$([\s\S]*?)\$\$/g,function(_,math){
        try{return save(katex.renderToString(math.trim(),{displayMode:true,throwOnError:false,macros:KATEX_MACROS}))}
        catch(e){return save('<pre>'+esc('$$'+math+'$$')+'</pre>')}
      });
      txt=txt.replace(/\$(.+?)\$/g,function(_,math){
        try{return save(katex.renderToString(math.trim(),{displayMode:false,throwOnError:false,macros:KATEX_MACROS}))}
        catch(e){return save('<code>'+esc('$'+math+'$')+'</code>')}
      });
    }
    return save('<div class="scaffold-stream"><span class="scaffold-stream-label">'+label+'</span>'+esc(txt)+'</div>');
  });
  t=t.replace(/<(quiz|example|practice|definition|step|flashcard|proof|theorem|key-point|derivation)\b[^>]*>([\s\S]*?)$/gi,function(_,tag){
    return save('<span class="scaffold-stream scaffold-stream-unclosed">\u2026'+esc(tag)+'\u2026</span>');
  });

  t=t.replace(/^```(?:viz|html|svg)\s*$/m,'```viz\n');

  /* Think blocks */
  t=t.replace(/<think>([\s\S]*?)<\/think>/g,function(_,content){
    var inner;
    try{
      inner=formatMsg(content.trim().replace(/<\/?think>/g,""));
    }catch(_){
      inner=esc(content.trim());
    }
    return save(_thinkDetails(inner,{streaming:false,count:_thinkUnitCount(content.trim().replace(/<\/?think>/g,""))}));
  });
  t=t.replace(/<think>([\s\S]*)$/g,function(_,content){
    var inner="";
    try{
      var c=content.trim().replace(/<\/?think>/g,"");
      inner=c?formatMsg(c):'<span class="thinking-ring thinking-ring-sm"></span> Thinking\u2026';
    }catch(_){
      inner=esc(content.trim());
    }
    return save(_thinkDetails(inner,{streaming:true,count:_thinkUnitCount(content.trim().replace(/<\/?think>/g,""))}));
  });

  /* Mermaid diagram blocks */
  t=t.replace(/```mermaid\s*\n?([\s\S]*?)```/g,function(_,code){
    var trimmed=code.trim();
    return trimmed?saveViz(renderMermaid(trimmed)):'';
  });
  t=t.replace(/```mermaid\s*\n?([\s\S]*?)$/g,function(_,body){
    return saveViz(renderVizLoading());
  });

  /* Viz blocks — svg is included here so explicit ```svg fences bypass
     the generic code-block length threshold below. */
  t=t.replace(/```(?:viz|html|svg)\s*\n?([\s\S]*?)```/g,function(_,json){
    var trimmed=json.trim();
    return trimmed?saveViz(renderViz(trimmed)):'';
  });
  t=t.replace(/```(?:viz|html|svg)\s*\n?([\s\S]*?)$/g,function(_,body){
    return saveViz(renderVizLoading());
  });

  /* ```plot``` fence → JS-only math plot. Routed BEFORE the
     generic ```lang``` handler so the plot language isn't
     mistaken for a code-block highlight language. The plot
     iframe is self-contained (canvas + inline runtime), no
     Pyodide / server round-trip needed. */
  t=t.replace(/```plot\s*\n?([\s\S]*?)```/g,function(_,spec){
    var trimmed=spec.trim();
    return trimmed?saveViz(renderPlot(trimmed)):'';
  });
  /* ```plot``` (unclosed) → just show a loading placeholder so the
     user sees the model mid-prompt without leaking the raw tag. */
  t=t.replace(/```plot\s*\n?([\s\S]*?)$/g,function(){
    return saveViz(renderVizLoading());
  });
  /* Code blocks — detect HTML/SVG/viz by explicit language tag or
     by content pattern (closing HTML tags). Self-closing SVGs without
     </svg> are caught by lang==="svg". */
  t=t.replace(/```(\w*)\n?([\s\S]*?)```/g,function(_,lang,code){
    var trimmed=code.trim();
    var isHtmlLang=lang==="html"||lang==="viz"||lang==="svg";
    /* P_svg-auto-detect — detect SVG content even in short blocks. */
    var hasSvgTag=/<svg[\s>]/i.test(trimmed);
    var looksLikeHtml=isHtmlLang||hasSvgTag||(
      trimmed.length>30&&
      /<\/(style|script|canvas|svg|div|table)>|<style[\s>]/i.test(trimmed)
    );
    if(isHtmlLang || looksLikeHtml && (trimmed.length>20 || hasSvgTag)){
      return saveViz(renderViz(trimmed));
    }
    var hljsLang=safeHljsLang(lang);
    var langAttr=hljsLang?' class="language-'+esc(hljsLang)+'"':'';
    return save('<pre><code'+langAttr+'>'+esc(trimmed)+'</code></pre>');
  });

  /* Display math $$...$$ */
  t=t.replace(/\$\$([\s\S]*?)\$\$/g,function(_,math){
    try{
      return save(katex.renderToString(math.trim(),{displayMode:true,throwOnError:false,macros:KATEX_MACROS}));
    }catch(e){
      return save('<pre>'+esc('$$'+math+'$$')+'</pre>');
    }
  });
  /* Unclosed $$ — auto-close LaTeX environments */
  if(typeof katex!=="undefined"){
    t=t.replace(/\$\$([\s\S]+?)$/g,function(_,math){
      var src=math.trim();
      var begins=src.match(/\\begin\{([^}]+)\}/g)||[];
      var ends=src.match(/\\end\{([^}]+)\}/g)||[];
      var openNames=[];
      begins.forEach(function(b){openNames.push(b.slice(7,-1))});
      ends.forEach(function(e){
        var name=e.slice(5,-1);
        for(var k=openNames.length-1;k>=0;k--){
          if(openNames[k]===name){openNames.splice(k,1);break}
        }
      });
      var closed=src;
      for(var i=openNames.length-1;i>=0;i--){
        closed+="\n\\end{"+openNames[i]+"}";
      }
      try{
        return save(katex.renderToString(closed,{displayMode:true,throwOnError:false,macros:KATEX_MACROS}));
      }catch(e){
        return save('<span class="math-partial" style="color:hsl(var(--text-400));font-style:italic;font-size:0.9em">\u2026</span>');
      }
    });
  }

  /* Inline math $...$ */
  t=t.replace(/\$([\s\S]+?)\$/g,function(_,math){
    try{
      return save(katex.renderToString(math.trim(),{displayMode:false,throwOnError:false,macros:KATEX_MACROS}));
    }catch(e){
      return save('<code>'+esc('$'+math+'$')+'</code>');
    }
  });

  /* Render Markdown */
  var html=marked.parse(t,{breaks:true,gfm:true});

  /* Sanitize URLs in rendered HTML */
  html=sanitizeUrls(html);

  /* Restore protected blocks. Viz/mermaid placeholders (VIZBLOCK)
     are intentionally skipped — they are restored AFTER DOMPurify
     below so the iframe + srcdoc survive sanitisation. */
  html=html.replace(/XBLOCK(\d+)X/g,function(_,id){
    return blocks[parseInt(id)];
  });

  /* P_latex-auto-render — safety net for math the explicit
     $/$$/\[/\]/\\(/\\) regex pass above missed. Auto-render
     (`renderMathInElement`, loaded as a KaTeX contrib from index.html)
     scans text nodes for delimited math and calls katex.render on
     each match. Common cases it catches:
       - `\( x + y \)` with extra whitespace inside the delimiters
       - `$x$` adjacent to other punctuation the regex tripped over
       - math inside an attribute / table cell the regex skipped
     We round-trip through a transient DOM node so the scan has a
     real Element to walk. KaTeX is idempotent — already-rendered
     spans carry a `data-mathml` attribute that auto-render skips,
     so calling it after our explicit pass is safe.

     We MUST forward KATEX_MACROS to renderMathInElement: without it,
     auto-render calls katex.render with an empty macro table, so our
     custom commands like \ket, \pdv, \comm would be
     rendered as red error text. Verified against
     node_modules/katex/dist/contrib/auto-render.min.js: `n.macros =
     n.macros || {}; f(e, n)` — auto-render reads `macros` from the
     per-call option and forwards it to katex.render.

     Skipped if `renderMathInElement` is not loaded (e.g. CDN was
     blocked) — falls back to whatever the regex pass produced. */
  if(typeof window !== "undefined" && typeof window.renderMathInElement === "function"
     && typeof document !== "undefined"){
    try{
      var _arHost=document.createElement("div");
      _arHost.innerHTML=html;
      window.renderMathInElement(_arHost,{
        delimiters:[
          {left:'$$', right:'$$', display:true},
          {left:'$',  right:'$',  display:false},
          {left:'\\(', right:'\\)', display:false},
          {left:'\\[', right:'\\]', display:true}
        ],
        throwOnError:false,
        /* Forward the same macro table the explicit KaTeX passes use,
           so \ket, \pdv, \comm, etc. expand identically in
           both passes. The KATEX_MACROS object is module-scoped and
           never mutated by KaTeX — safe to share by reference. */
        macros:KATEX_MACROS,
        /* trust:false (default) — KaTeX will refuse to expand
           \href / \url into <a href> tags, so an LLM that emits
           \href{javascript:...}{x} renders as red error text, not
           an XSS vector. */
        ignoredTags:['script','noscript','style','textarea','pre','code']
      });
      html=_arHost.innerHTML;
    }catch(_arErr){
      // Don't let a transient DOM failure poison the message — fall
      // back to the pre-auto-render HTML.
      console.warn('[formatMsg] auto-render pass skipped:',_arErr&&_arErr.message);
    }
  }

  /* Sanitise the final HTML with DOMPurify. See note in
     formatMsgProgressive for rationale. */
  var sanitized=sanitizeHtml(html);
  /* Restore viz/mermaid blocks AFTER DOMPurify. Their HTML
     strings (sandboxed iframe + srcdoc) are produced by our own
     renderViz/renderMermaid helpers, not user content, so it is
     safe to bypass the sanitiser for these specific blocks. The
     srcdoc payload is HTML-entity-escaped at the call site
     (renderViz in viz.js replaces &, ", <, > with entities
     before assigning to the iframe's srcdoc attribute) so an
     injection attempt renders as visible text inside the
     sandboxed iframe, not as DOM nodes in the parent page. */
  return sanitized.replace(/XVIZBLOCK(\d+)X/g,function(_,id){
    return vizBlocks[parseInt(id)];
  });
}

/* ── Plain-text helpers (used by message-editing flows) ────────────
   These two functions are *not* part of the streaming / rendering
   pipeline — they strip markdown formatting so the user sees clean
   text when editing or resending a message. Imported by main.js.
   Note: distinct from stripChatArtifacts (util/stripChatArtifacts.js),
   which strips code-injection artifacts for render-time safety. */

export function stripMarkdown(s){
  if(!s)return"";
  return String(s)
    /* Strip any HTML tags first — older server payloads sometimes
       stored the rendered <p>foo</p> rather than the plain text.
       Editing a user message must never expose raw <p>/<br>/etc. */
    .replace(/<\/?[a-zA-Z][^>]*>/g,"")
    .replace(/<!--[\s\S]*?-->/g,"")
    .replace(/<!\[CDATA\[[\s\S]*?\]\]>/g,"")
    /* Remove fenced code blocks (```...``` or ~~~...~~~) */
    .replace(/```[\s\S]*?```/g,"")
    .replace(/~~~[\s\S]*?~~~/g,"")
    /* Remove inline code and math: $...$, $$...$$, `...` */
    .replace(/\$\$[^$]*\$\$/g,"")
    .replace(/\$[^$]*\$/g,"")
    .replace(/`[^`]*`/g,"")
    /* Remove images: ![alt](url) */
    .replace(/!\[([^\]]*)\]\([^)]*\)/g,"$1")
    /* Replace links: [text](url) → text */
    .replace(/\[([^\]]*)\]\([^)]*\)/g,"$1")
    /* Strip bold/italic markers */
    .replace(/\*\*([^*]*)\*\*/g,"$1")
    .replace(/__([^_]*)__/g,"$1")
    .replace(/\*([^*]*)\*/g,"$1")
    .replace(/_([^_]*)_/g,"$1")
    /* Remove heading markers */
    .replace(/^#{1,6}\s+/gm,"")
    /* Remove blockquote markers */
    .replace(/^>\s+/gm,"")
    /* Remove horizontal rules */
    .replace(/^[-*_]{3,}\s*$/gm,"")
    /* Remove list markers (-, *, +, 1.) */
    .replace(/^[-*+]\s+/gm,"")
    .replace(/^\d+\.\s+/gm,"")
    /* Collapse multiple newlines into one */
    .replace(/\n{3,}/g,"\n\n")
    .trim();
}

/* Returns the most recent user message with markdown stripped, or null.
   Used by the `↑` (empty input) shortcut to pop the previous prompt
   back into the input for editing. */
export function findLastUserMessage(){
  var list=window.state.session.messages||[];
  for(var i=list.length-1;i>=0;i--){
    if(list[i].role==="user"&&list[i].rawText)return stripMarkdown(list[i].rawText);
  }
  return null;
}
