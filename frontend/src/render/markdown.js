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
    return save('<details class="think-block"><summary class="think-summary">Thinking</summary><div class="think-content">'+inner+'</div></details>');
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
    return save('<details class="think-block"><summary class="think-summary"><span class="thinking-ring thinking-ring-sm"></span> Thinking\u2026</summary><div class="think-content">'+inner+'</div></details>');
  });

  /* 1b. Tutor scaffold blocks — show text-only preview during streaming. */
  function _scaffoldText(inner) {
    var text = inner.replace(/<[^>]+>/g, '').trim();
    return text.length > 200 ? text.slice(0, 200) + '\u2026' : text;
  }
  s = s.replace(/<(quiz|example|practice|definition|flashcard)\b[^>]*>([\s\S]*?)<\/\1>/gi, function(_, tag, content) {
    var label = tag === 'quiz'     ? '[Quick Check]'
              : tag === 'example'  ? '[Example]'
              : tag === 'practice' ? '[Practice]'
              : tag === 'definition' ? '[Definition]'
              : '[Flashcard]';
    return save('<div class="scaffold-stream"><span class="scaffold-stream-label">' + label + '</span> ' + escHTML(_scaffoldText(content)) + '</div>');
  });
  s = s.replace(/<step\b[^>]*>([\s\S]*?)<\/step>/gi, function(_, content) {
    return save('<div class="scaffold-stream"><span class="scaffold-stream-label">[Step]</span> ' + escHTML(_scaffoldText(content)) + '</div>');
  });
  s = s.replace(/<(quiz|example|practice|definition|step|flashcard)\b[^>]*>([\s\S]*?)$/gi, function(_, tag) {
    return save('<span class="scaffold-stream scaffold-stream-unclosed">\u2026' + escHTML(tag) + '\u2026</span>');
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

  return html;
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
  t=t.replace(/<(quiz|example|practice|definition|step|flashcard)\b[^>]*>([\s\S]*?)$/gi,function(_,tag){
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
    return save('<details class="think-block"><summary class="think-summary">Thinking</summary><div class="think-content">'+inner+'</div></details>');
  });
  t=t.replace(/<think>([\s\S]*)$/g,function(_,content){
    var inner="";
    try{
      var c=content.trim().replace(/<\/?think>/g,"");
      inner=c?formatMsg(c):'<span class="thinking-ring thinking-ring-sm"></span> Thinking\u2026';
    }catch(_){
      inner=esc(content.trim());
    }
    return save('<details class="think-block"><summary class="think-summary"><span class="thinking-ring thinking-ring-sm"></span> Thinking\u2026</summary><div class="think-content">'+inner+'</div></details>');
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

  return html;
}
