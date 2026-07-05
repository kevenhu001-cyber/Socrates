/* ── Markdown + math + viz message renderers ──
   formatMsgProgressive — streaming markdown renderer (called per
     animation frame during streaming).
   formatMsg — final one-shot renderer (called when the message is
     complete or during typeTick animation).
   formatTickSlice — convenience wrapper for the type-tick slider.
   All three exported for use by main.js / doRender / streaming. */

import { esc, escAttr, escHTML, KATEX_MACROS } from './helpers.js';
import { renderMermaid, renderViz, renderVizLoading, renderVizError } from './viz.js';
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
    return'\x00BLOCK'+id+'\x00';
  }

  /* 1. Closed think blocks */
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

  /* 2. Display math $$...$$ — CLOSED blocks render with KaTeX now. */
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

  /* 3. Inline math $...$ */
  if(typeof katex!=="undefined"){
    s=s.replace(/\$(.+?)\$/g,function(_,math){
      try{
        return save(katex.renderToString(math.trim(),{displayMode:false,throwOnError:false,macros:KATEX_MACROS}));
      }catch(e){
        return save('<code>'+escHTML("$"+math+"$")+'</code>');
      }
    });
  }

  /* 4. Closed code fences */
  s=s.replace(/```(\w*)\n?([\s\S]*?)```/g,function(_,lang,code){
    var trimmed=code.trim();
    var langAttr=lang?' class="language-'+escAttr(lang)+'"':'';
    return save('<pre><code'+langAttr+'>'+escHTML(trimmed)+'</code></pre>');
  });

  /* 5. Unclosed code fence */
  s=s.replace(/```(\w*)\n?([\s\S]*)$/g,function(_,lang,body){
    var trimmed=body.trim();
    if(trimmed){
      var langAttr=lang?' class="language-'+escAttr(lang)+'"':'';
      return save('<pre><code'+langAttr+'>'+escHTML(trimmed)+'</code></pre>');
    }
    return save('<span style="color:hsl(var(--text-400));font-style:italic;font-size:0.9em">\u2026</span>');
  });

  /* 6. Render Markdown via marked.parse */
  var html;
  if(typeof marked!=="undefined"){
    html=marked.parse(s,{breaks:true,gfm:true});
  }else{
    html="<p>"+escHTML(s).replace(/\n\n/g,"</p><p>").replace(/\n/g,"<br>")+"</p>";
  }

  /* 7. Restore protected blocks */
  html=html.replace(/\x00BLOCK(\d+)\x00/g,function(_,id){
    return blocks[parseInt(id)];
  });

  /* 8. Sanitise the final HTML with DOMPurify.
     marked.parse() passes raw HTML through by default — this is
     the only line of defense against XSS via injected HTML. The
     `sanitizeUrls` pass earlier only filtered URL schemes; it did
     not strip inline event handlers (onerror, onclick, onload). */
  return sanitizeHtml(html);
}

export function formatMsg(t){
  if(typeof marked==="undefined"||typeof katex==="undefined"){
    return"<p>"+esc(preprocessMarkdown(t)).replace(/```(\w*)\r?\n?([\s\S]*?)```/g,function(_,l,c){return"<pre><code>"+esc(c.trim())+"</code></pre>"}).replace(/`([^`]+)`/g,"<code>$1</code>").replace(/\*\*(.+?)\*\*/g,"<strong>$1</strong>").replace(/\*(.+?)\*/g,"<em>$1</em>").replace(/\n\n/g,"</p><p>").replace(/\n/g,"<br>")+"</p>"
  }
  var blocks=[];
  var pid=0;
  function save(html){
    var id=pid++;
    blocks.push(html);
    return'\x00BLOCK'+id+'\x00';
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

  t=t.replace(/^```(?:viz|html)\s*$/m,'```viz\n');

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
    return trimmed?save(renderMermaid(trimmed)):'';
  });
  t=t.replace(/```mermaid\s*\n?([\s\S]*?)$/g,function(_,body){
    return save(renderVizLoading());
  });

  /* Viz blocks */
  t=t.replace(/```(?:viz|html)\s*\n?([\s\S]*?)```/g,function(_,json){
    var trimmed=json.trim();
    return trimmed?save(renderViz(trimmed)):'';
  });
  t=t.replace(/```(?:viz|html)\s*\n?([\s\S]*?)$/g,function(_,body){
    return save(renderVizLoading());
  });

  /* Code blocks */
  t=t.replace(/```(\w*)\n?([\s\S]*?)```/g,function(_,lang,code){
    var trimmed=code.trim();
    var looksLikeHtml=trimmed.length>30&&(
      lang==="html"||lang==="viz"||
      /<\/(style|script|canvas|svg|div|table)>|<style[\s>]/i.test(trimmed)
    );
    if(looksLikeHtml&&trimmed.length>20){
      return save(renderViz(trimmed));
    }
    var langAttr=lang?' class="language-'+esc(lang)+'"':'';
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

  /* Restore protected blocks */
  html=html.replace(/\x00BLOCK(\d+)\x00/g,function(_,id){
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
  return sanitizeHtml(html);
}
