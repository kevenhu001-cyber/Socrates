import { apiFetch } from '../util/api.js';

/* Heuristic: returns true if the user's text seems to refer to a
   website but we couldn't pull a usable URL out of it. We look for
   words like "网站"、"网址"、"网页"、"site"、"homepage", or for
   "看看/visit/check/打开" near a domain-shaped word. Conservative
   enough to avoid false positives in pure conceptual Q&A. */
export function looksLikeUserMentionedSite(text){
  if(!text)return false;
  if(/网站|网址|网页|主页|站点|官网|链接|URL|url/i.test(text))return true;
  if(/\b(visit|open|check|go to|browse|look at|see|read|fetch)\b/i.test(text)
     && /\b[a-z0-9-]+\.[a-z]{2,}\b/i.test(text))return true;
  /* "看看 xxx" / "看一下 xxx" / "了解下 xxx" style — but only if there's
     a domain-shaped token in the sentence. */
  if(/(看看|看一下|了解下|了解|查阅|访问|打开|浏览|读一读|读一下)/.test(text)
     && /\b[a-z0-9-]+\.[a-z]{2,}\b/i.test(text))return true;
  return false;
}

/* Extract URLs from a free-form text. Returns at most 3 URLs, deduped,
   in first-seen order. Strips trailing punctuation that commonly rides
   in (Chinese full-width parens, periods, commas).

   Two flavors of "URL" are accepted:
     1. Anything that already starts with http:// or https://
     2. Bare domains like example.com, www.foo.bar, sub.example.co.uk
        and the same followed by an obvious path. We prepend https://.

   Conservative rules: we only auto-promote a bare domain if it contains
   at least one dot and the TLD looks plausible (≥ 2 alpha chars). This
   avoids grabbing every word like "github" in prose. */
export function extractHttpUrls(text){
  if(!text)return[];
  var seen=Object.create(null);
  var out=[];

  function add(u){
    if(!u)return;
    /* Strip common trailing punctuation. */
    u=u.replace(/[.,;:!?\]）】」』\)]+$/,"");
    /* Drop anchor-only fragments the user didn't intend to send. */
    if(!u||u==="#")return;
    if(seen[u])return;
    seen[u]=1;
    out.push(u);
  }

  /* (1) http(s)://... */
  var re1=/https?:\/\/[^\s一-鿿　-〿＀-￯"'<>)\]】」』]+/gi;
  var m;
  while((m=re1.exec(text))!==null){
    add(m[0]);
    if(out.length>=3)break;
  }
  if(out.length>=3)return out;

  /* (2) Bare domains / domain+path. We anchor on a word boundary,
     require at least one dot, and only accept character classes that
     are valid in a URL host or path. We allow an optional path/query
     so things like "example.com/about" or "news.ycombinator.com/item?id=1"
     are picked up. */
  /* Known file extensions we should NOT treat as TLDs when the user
     wrote something like "report.pdf" or "image.png" — those are
     filenames, not URLs. We still allow the same token if the user
     wrote "www." or included a "/" path. */
  var FILE_EXTS=("pdf doc docx xls xlsx ppt pptx zip rar 7z tar gz "+
    "jpg jpeg png gif webp svg mp3 mp4 mov avi mkv exe dmg iso "+
    "txt md rtf csv json xml html htm").split(" ");
  var re2=/(?:^|[^\w一-鿿＠@])([a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+(?:\/[^\s一-鿿　-〿＀-￯"'<>)\]】」』]*)?)/gi;
  while((m=re2.exec(text))!==null){
    var d=m[1];
    if(!d)continue;
    if(d.indexOf(".")===-1)continue;
    /* TLD is the part after the LAST dot in the host portion only.
       The host stops at the first "/" so "example.com/about" reads
       the TLD as "com", not the path's last segment. */
    var host=d.split("/")[0];
    var lastDot=host.lastIndexOf(".");
    var tld=host.slice(lastDot+1);
    if(!/^[a-z]{2,}$/i.test(tld))continue;
    if(/^\d+(\.\d+)+$/.test(d))continue;
    /* Reject filename-style matches: "report.pdf" — no path AND no
       "www." AND the last segment is a known file extension. If the
       user actually wants a URL ending in .pdf, they'll paste the
       full https:// form, which the first regex already handles. */
    var hasPath=d.indexOf("/")!==-1;
    var hasWww=/^www\./i.test(d);
    if(!hasPath&&!hasWww){
      var t=tld.toLowerCase();
      var isFile=false;
      for(var fi=0;fi<FILE_EXTS.length;fi++){if(FILE_EXTS[fi]===t){isFile=true;break}}
      if(isFile)continue;
    }
    add("https://"+d);
    if(out.length>=3)break;
  }
  return out;
}

/* Fetch up to 3 pages in parallel and format them as [Referenced page]
   blocks. Returns {blocks, results} so the caller can also render
   link-preview cards in the user bubble. Failures degrade to a small
   error line per page so the assistant can still acknowledge the link
   in its answer. */
export async function fetchPagesForContext(urls){
  if(!Array.isArray(urls)||!urls.length)return{blocks:[],results:[]};
  try{
    var r=await apiFetch("/api/fetch-batch",{method:"POST",body:{urls:urls}});
    var results=(r&&r.results)||[];
    var blocks=[];
    for(var i=0;i<urls.length;i++){
      var u=urls[i];
      var f=results[i];
      if(f&&f.ok&&f.content){
        blocks.push(
          "[Referenced page] "+u+"\n"+
          (f.title?"Title: "+f.title+"\n":"")+
          (f.truncated?"(truncated excerpt)\n":"")+
          f.content
        );
      }else{
        var reason=(f&&f.reason)||"fetch failed";
        blocks.push("[Referenced page] "+u+"\n(could not retrieve: "+reason+")");
      }
    }
    return{blocks:blocks,results:results};
  }catch(e){
    var emsg=(e&&e.message)||String(e);
    var blocks=urls.map(function(u){return"[Referenced page] "+u+"\n(could not retrieve: "+emsg+")"});
    var results=urls.map(function(){return{ok:false,reason:emsg}});
    return{blocks:blocks,results:results};
  }
}
