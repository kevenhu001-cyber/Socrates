import { apiFetch, apiFetchRaw } from '../util/api.js';
import { callAPI } from './api.js';
import { offlineGuard } from './offline.js';
import { hasUsableActive, webSearchOn } from '../config/providers.js';
import { loadLocalMemory } from '../storage/localMemory.js';
import { stateStore } from '../state/store.js';

function tr(key) { return typeof window.t === 'function' ? window.t(key) : key; }

/* Fetch web context for `topic`. Returns a structured result so the UI
   can show a "N sources" pill (or an error pill). The `state` fields
   are populated as a side effect so any prompt builder can read
   `window.stateStore.read("searchContext")` synchronously.

   Refresh strategy (set per the user):
   - First fetch: at session start (tutor mode) or at first chat turn (chat mode)
   - Re-fetch: every 5 user turns (counted by window.stateStore.read("totalQ") mod 5)
   - Old context is KEPT in window.stateStore.read("searchContext") until the new fetch
     resolves, so a slow refresh never causes a turn to ship without
     grounding. */
var SEARCH_REFRESH_EVERY=5;
/* Hard cap on /api/web-search POSTs per single fetchWebContext call.
   Each query variant + the retry (if all fail) consumes one. This
   caps the total backend search volume and prevents runaway costs
   when the rewriter generates many alternatives. */
var MAX_WS_CALLS=5;

export async function fetchWebContext(topic,opts){
  opts=opts||{};
  /* Phase 3: optional onStep observer. Emits step events at every natural
     pipeline boundary so the UI (search-progress log) can render a
     streaming activity feed. Wrapped in try/catch so a UI bug never
     breaks the search itself. */
  function _emit(kind,data){
    try{if(typeof opts.onStep==="function")opts.onStep({kind:kind,data:data||{}})}catch(_){}
  }
  if(!webSearchOn||!topic)return{ok:false,reason:"disabled",results:0,context:""};
  if(opts.background){
    /* Background refresh — set the pill to "refreshing" but don't await.
       The refresh paints its own success/error pill when it finishes;
       there is no client-side deadline on it. */
    try{setSearchPill("loading",0,"Refreshing…")}catch(_){}
  }else{
    try{setSearchPill("loading",0,"Searching…")}catch(_){}
  }
  _emit("started",{topic:topic,background:!!opts.background});
  /* Offline precheck — fail fast in background too, so the pill
     resolves to an error state instead of hanging on "Refreshing…". */
  if(offlineGuard()){
    try{setSearchPill("err",0,"Offline")}catch(_){}
    return{ok:false,reason:"offline",results:0,context:opts.background?window.stateStore.read("searchContext")||"":""};
  }
  /* Collect search queries. If the rewriter returns good ones, we also
     always append the raw topic as a baseline — this guarantees at least
     one pass-through and often catches what the rewriter missed. */
  var queries=Array.isArray(opts.queries)?opts.queries.slice():[];
  if(!queries.length){
    var rewritten=await rewriteQueryForSearch(topic);
    if(rewritten&&rewritten.length)queries=rewritten.slice();
  }
  /* Always include the raw topic as a baseline query. It frequently
     catches things the rewriter over-engineered away. */
  if(queries.indexOf(topic)===-1)queries.push(topic);
  /* Cap to 6 for a good balance of breadth vs latency. */
  if(queries.length>6)queries=queries.slice(0,6);
  /* Honor the per-call search budget — reserve one slot for the retry. */
  var _wsRemaining=MAX_WS_CALLS;
  if(queries.length>_wsRemaining)queries=queries.slice(0,_wsRemaining);
  _emit("expanding",{queries:queries.slice(),count:queries.length});
  /* Always do at least one search; dedupe results by URL. */
  try{
    /* Run searches in parallel for both queries. */
    var searchResults=[];
    var seenUrls={};
    var searches=queries.map(function(q,idx){
      _emit("querying",{query:q,idx:idx,total:queries.length});
      _wsRemaining--;
      return apiFetchRaw("/api/web-search",{
        method:"POST",
        body:{query:q,count:8}
      }).then(function(r){
        return r.json().then(function(d){return{ok:true,query:q,results:(d&&d.results)||[]}});
      }).catch(function(e){return{ok:false,status:e&&e.status,reason:e&&e.message,results:[]}});
    });
    var searchResps=await Promise.all(searches);
    for(var si=0;si<searchResps.length;si++){
      _emit("got_results",{query:searchResps[si].query,count:(searchResps[si].results||[]).length});
      var sr=searchResps[si];
      if(!sr.ok||!sr.results)continue;
      for(var ri=0;ri<sr.results.length;ri++){
        var item=sr.results[ri];
        if(!item||!item.url)continue;
        if(seenUrls[item.url])continue;
        seenUrls[item.url]=true;
        searchResults.push(Object.assign({matchedQuery:sr.query},item));
        if(searchResults.length>=25)break;
      }
      if(searchResults.length>=25)break;
    }
    /* If every search failed AND we used the rewriter, retry once with
       the raw topic — sometimes the rewriter is too aggressive. */
    if(!searchResults.length&&queries[0]!==topic&&_wsRemaining>0){
      _emit("retry",{reason:"all-failed",query:topic});
      _wsRemaining--;
      try{
        var r2=await apiFetchRaw("/api/web-search",{
          method:"POST",
          body:{query:topic,count:8}
        });
        var d2=await r2.json();
        searchResults=(d2.results||[]).map(function(x){return Object.assign({matchedQuery:topic},x)});
        _emit("got_results",{query:topic,count:searchResults.length});
      }catch(_){}
    }
    if(!searchResults.length){
      /* All searches failed (network / 5xx / non-bing). Surface a
         soft error; the user still gets the previous context if any. */
      var firstErr=searchResps.find(function(x){return x&&!x.ok&&(x.status||x.reason)});
      var emsg=firstErr?(firstErr.status?"HTTP "+firstErr.status:(firstErr.reason||"failed")):"no results";
      console.log("[web search] all queries failed");
      stateStore.dispatch({type:'state/set',key:'searchContextError',value:emsg});
      _emit("error",{message:emsg,code:"no-results"});
      try{setSearchPill("err",0,"Search failed: "+emsg)}catch(_){}
      return{ok:false,reason:emsg,results:0,context:opts.background?window.stateStore.read("searchContext")||"":""};
    }
    var d={results:searchResults,query:queries.join(" | ")};
    if(!d.results||!d.results.length){
      stateStore.dispatch({type:'state/batch',patch:{
        searchContextError:null,
        searchContext:"",
        searchContextAt:Date.now(),
        searchContextCount:0,
        searchResults:[]
      }});
      try{setSearchPill("ok",0,"No results")}catch(_){}
      return{ok:true,reason:"empty",results:0,context:""};
    }
    /* Step 2: webfetch the top 8 results to get the full article text.
       The model can quote, summarize, and reason about the actual page
       contents. Failed fetches fall back to the snippet we already have. */
    var topUrls=d.results.slice(0,8).map(function(x){return x.url});
    var fetched=[];
    if(topUrls.length){
      _emit("fetching",{urls:topUrls,count:topUrls.length});
      try{
        var fb=await apiFetchRaw("/api/fetch-batch",{
          method:"POST",
          body:{urls:topUrls}
        });
        var fd=await fb.json();
        fetched=fd.results||[];
        var okN=fetched.filter(function(x){return x&&x.ok}).length;
        _emit("fetched",{okCount:okN,total:topUrls.length});
      }catch(e){
        console.log("[web fetch] batch failed");
        _emit("fetched",{okCount:0,total:topUrls.length,error:e&&e.message});
      }
    }
    /* Merge: for each result, attach the fetched body if successful. */
    var byUrl={};
    fetched.forEach(function(f){if(f&&f.url)byUrl[f.url]=f});
    var enriched=d.results.map(function(x){
      var f=byUrl[x.url];
      return Object.assign({},x,{fullContent:f&&f.ok?f.content:null,truncated:f&&f.ok&&f.truncated});
    });
    var origEnriched=enriched.slice();  /* keep unfiltered copy for fallback */
    /* Relevance scoring: measure how well each result actually matches
       the user's topic. Uses multiple signals for better accuracy than
       simple keyword counting. Also handles cross-language matching:
       a Chinese topic should match Chinese results even if the query
       was in English. */
    var topicNorm=(topic||"").toLowerCase();
    var topicWords=topicNorm.split(/\W+/).filter(function(w){return w.length>2});
    var topicBigrams=[];
    for(var tb=0;tb<topicWords.length-1;tb++)topicBigrams.push(topicWords[tb]+" "+topicWords[tb+1]);
    enriched.forEach(function(x){
      var title=(x.title||"").toLowerCase();
      var snippet=(x.snippet||"").toLowerCase();
      var full=(x.fullContent||"").toLowerCase();
      var score=0;
      /* Signal 1: How many topic words appear in title (weighted high). */
      var titleMatch=0;
      for(var tw=0;tw<topicWords.length;tw++){
        if(title.indexOf(topicWords[tw])!==-1)titleMatch++;
      }
      score+=titleMatch*15;
      /* Signal 2: Exact phrase match in title (very strong signal). */
      for(var bg=0;bg<topicBigrams.length;bg++){
        if(title.indexOf(topicBigrams[bg])!==-1)score+=20;
      }
      /* Signal 3: Topic words in snippet. */
      var snippetMatch=0;
      for(var sw=0;sw<topicWords.length;sw++){
        if(snippet.indexOf(topicWords[sw])!==-1)snippetMatch++;
      }
      score+=snippetMatch*8;
      /* Signal 4: If we have full content, check deeper match. */
      if(full){
        var fullMatch=0;
        for(var fw=0;fw<topicWords.length;fw++){
          if(full.indexOf(topicWords[fw])!==-1)fullMatch++;
        }
        score+=fullMatch*5;
        for(var fbg=0;fbg<topicBigrams.length;fbg++){
          if(full.indexOf(topicBigrams[fbg])!==-1)score+=10;
        }
      }
      /* Normalize to 0-100 range. Max possible: len*15 + (len-1)*20 + len*8 + len*5 + (len-1)*10 */
      var maxScore=topicWords.length*28+(topicWords.length-1)*30;
      x._relevance=Math.round(Math.min(100,score/Math.max(1,maxScore)*100));
    });
    /* Phase 3: emit a summary of the relevance distribution. The UI uses
       this to render "Top match: 78% relevance" or similar. */
    {
      var dist=[0,0,0];  // b30, 30-69, 70+
      var topRel=0,sumRel=0,scoredN=enriched.length;
      for(var di=0;di<enriched.length;di++){
        var r=enriched[di]._relevance||0;
        sumRel+=r;
        if(r>topRel)topRel=r;
        if(r<30)dist[0]++;else if(r<70)dist[1]++;else dist[2]++;
      }
      _emit("scored",{avgRel:scoredN?Math.round(sumRel/scoredN):0,topRel:topRel,distribution:dist,count:scoredN});
    }
    /* Filter out low-quality results — don't just tag them, remove them.
       This prevents the model from wasting context on irrelevant pages. */
    var preFilterCount=enriched.length;
    enriched=enriched.filter(function(x){return x._relevance>=30});
    _emit("filtered",{keptCount:enriched.length,droppedCount:preFilterCount-enriched.length});
    /* If filtering gutted the list, keep at least the top 3 (they might
       still be useful even if weakly matched). */
    if(!enriched.length){
      /* All results were below threshold — keep best 3 as-is. */
      enriched=origEnriched.slice(0,3);
      enriched.forEach(function(x){x._relevance=Math.max(x._relevance||0,25)});
    }
    /* Sort by relevance descending so the most on-point results appear
       first in the context block the model sees. */
    enriched.sort(function(a,b){return b._relevance-a._relevance});
    /* Build the [Web research] block. Each entry has a snippet (always
       present) and optionally a "Full text:" excerpt (when fetch
       succeeded). The model uses whichever it needs. Include the
       matched query and relevance hint per result. */
    var lines=enriched.map(function(x,i){
      var relTag=x._relevance>=70?"[high relevance]":x._relevance>=45?"[medium relevance]":"[low relevance]";
      var head="["+(i+1)+"] "+relTag+" "+x.title;
      if(x.snippet)head+=" — "+x.snippet;
      head+=" ( "+x.url+" )";
      head+="\n    Source query: \""+(x.matchedQuery||topic)+"\"";
      if(x.fullContent){
        var trimmed=(x.fullContent.length>3000)?x.fullContent.slice(0,3000)+"…":x.fullContent;
        head+="\n    Full text: "+trimmed;
      }else{
        head+="\n    (snippet only — full text unavailable)";
      }
      return head;
    });
    var ctx="\n\n[Web research] — original query: \""+topic+"\". "+
      "Each result below was retrieved live from the web, scored for relevance, and sorted by estimated accuracy. "+
      "[high relevance] results closely match what the user is asking about. [medium relevance] are related but may be tangential. "+
      "[low relevance] results are included only as supplementary context — use them cautiously.\n\n"+
      "Weave the facts into your reply as natural prose. Do NOT add [1]/[2] citation markers, do NOT append a \"Sources:\"/\"References:\" list, and do NOT paste result URLs into your reply (the UI already shows every source to the user). "+
      "Do NOT invent facts not supported by the results. "+
      "If multiple results contradict each other, prefer [high relevance] sources.\n"+
      lines.join("\n");
    stateStore.dispatch({type:'state/batch',patch:{
      searchContext:ctx,
      searchContextAt:Date.now(),
      searchContextCount:enriched.length,
      searchContextError:null,
      searchContextQuery:topic,
      searchResults:enriched
    }});   /* searchResults: [{title,url,snippet,fullContent?,truncated?}] */
    var fetchedCount=enriched.filter(function(x){return!!x.fullContent}).length;
    /* Phase 3: emit per-source engine breakdown so the UI can render
       "Wikipedia ×2, arXiv ×1, Bing ×3" in the summary. */
    {
      var engineCounts={};
      for(var ei=0;ei<enriched.length;ei++){
        var s=enriched[ei].source||"web";
        engineCounts[s]=(engineCounts[s]||0)+1;
      }
      _emit("done",{finalCount:enriched.length,fetchedCount:fetchedCount,engines:engineCounts});
    }
    console.log("[web search]",enriched.length,"results for:",topic);
    try{setSearchPill("ok",enriched.length,enriched.length+" sources"+(fetchedCount?" · "+fetchedCount+" full":""))}catch(_){}
    return{ok:true,reason:"ok",results:enriched.length,context:ctx,sources:enriched};
  }catch(e){
    var emsg=(e&&e.message)||String(e);
    console.log("[web search] failed");
    stateStore.dispatch({type:'state/set',key:'searchContextError',value:emsg});
    _emit("error",{message:emsg,code:"exception"});
    try{setSearchPill("err",0,"Search: "+emsg)}catch(_){}
    /* Keep the previous context so a transient failure doesn't drop
       grounding from the next turn. */
    return{ok:false,reason:emsg,results:0,context:opts.background?window.stateStore.read("searchContext")||"":""};
  }
}

/* ──────────────────────────────────────────────────────────────────────
   Phase 3 — AI-driven search-quality judge + re-search loop
   ──────────────────────────────────────────────────────────────────────
   `judgeSearchQuality` makes a tiny, fast, non-streaming LLM call to
   score the round-1 result set on a 0–5 scale. If score < 3, it
   returns a rewritten query the caller can use for round 2.

   `webSearchWithRetry` is a thin wrapper around fetchWebContext that
   runs round 1, judges it, and (if needed) runs round 2 with the
   rewrite. Round cap = 2. Events from both rounds are forwarded to
   `opts.onStep` so the search-progress log can render the full
   activity timeline.

   Latency budget: round 1 (≤10 s) + judge (≤4 s) + round 2 (≤8 s)
   = 22 s worst case. The caller is expected to race this against
   the main answer stream to keep first-token latency low. */

/* Build a compact results digest (first 5 sources, snippet only) for
 * the judge prompt. The judge doesn't need fullContent — only the
 * title + snippet + source, so we keep the prompt small. */
function _buildJudgeDigest(sources){
  if(!Array.isArray(sources))return"[]";
  var top=(sources.slice(0,5)).map(function(s){
    return{
      title:(s.title||"").slice(0,200),
      url:s.url||"",
      snippet:(s.snippet||"").slice(0,300),
      source:s.source||"web"
    };
  });
  try{return JSON.stringify(top)}catch(_){return"[]"}
}

/* Judge the result set via a small non-streaming LLM call. Returns
 * {score: 0..5, rewrite: string}. Failure of the call is treated as
 * score=3 (don't retry). 4 s ceiling via AbortController. */
async function judgeSearchQuality(sources, topic){
  if(!Array.isArray(sources)||!sources.length)return{score:0,rewrite:""};
  if(!hasUsableActive||!hasUsableActive())return{score:3,rewrite:""};
  var digest=_buildJudgeDigest(sources);
  var promptText=
    "You are a search-quality judge. Given the user's TOPIC and a list of search results, return strict JSON only:\n"+
    "{ \"score\": <0-5 integer>, \"rewrite\": \"<better search query, or empty if score>=3>\" }\n\n"+
    "Score 0 if results are all irrelevant or wrong language. Score 5 if top 3 results directly answer the topic. "+
    "Score 3 if results are tangential but usable. Below 3, provide a sharper rewrite in the same language.\n\n"+
    "TOPIC: "+(topic||"").slice(0,500)+"\n\n"+
    "RESULTS: "+digest;
  var msgs=[
    {role:"system",content:"You are a strict JSON-output search-quality judge. Output JSON only, no prose, no markdown fences."},
    {role:"user",content:promptText}
  ];
  try{
    var raw=await callAPI(msgs,80);
    if(!raw)return{score:3,rewrite:""};
    /* callAPI may return a string (the LLM's reply content) or an
     * object with {content} or {text} depending on the provider. */
    var text="";
    if(typeof raw==="string")text=raw;
    else if(raw&&typeof raw==="object"){
      if(typeof raw.content==="string")text=raw.content;
      else if(typeof raw.text==="string")text=raw.text;
      else if(Array.isArray(raw.choices)&&raw.choices[0]&&raw.choices[0].message){
        text=String(raw.choices[0].message.content||"");
      }
    }
    text=(text||"").trim();
    /* Strip code fences if the model wrapped the JSON. */
    text=text.replace(/^```(?:json)?\s*/i,"").replace(/```\s*$/i,"").trim();
    var parsed=null;
    try{parsed=JSON.parse(text)}catch(_){
      /* Try to extract the first {...} block from the text. */
      var m=text.match(/\{[\s\S]*\}/);
      if(m)try{parsed=JSON.parse(m[0])}catch(_){parsed=null}
    }
    if(!parsed||typeof parsed!=="object")return{score:3,rewrite:""};
    var scoreN=parseInt(parsed.score,10);
    if(isNaN(scoreN))scoreN=3;
    scoreN=Math.max(0,Math.min(5,scoreN));
    return{score:scoreN,rewrite:(typeof parsed.rewrite==="string")?parsed.rewrite:""};
  }catch {
    /* Treat judge failures as "good enough" (don't retry). */
    return{score:3,rewrite:""};
  }
}

/* Wrap fetchWebContext with a judge + 1-retry loop. Round cap = 2.
 *
 * Forwards every onStep event from both rounds to opts.onStep. After
 * round 1, calls judgeSearchQuality. If score < 3 AND we haven't
 * already retried, calls fetchWebContext again with the rewritten
 * query. Returns the same shape as fetchWebContext ({ok, reason,
 * results, context, sources}); prefers round-2 results if a retry
 * succeeded.
 *
 * opts:
 *   onStep   — optional step observer (forwards events from both rounds)
 *   signal   — optional AbortSignal (cancels both rounds)
 *   ceilingMs — hard cap on the whole loop (default 12000)
 */
export async function webSearchWithRetry(topic, opts){
  opts=opts||{};
  var onStep=opts.onStep;
  function _emit(kind,data){
    try{if(typeof onStep==="function")onStep({kind:kind,data:data||{}})}catch(_){}
  }
  _emit("started",{topic:topic});
  /* Round 1 */
  var res=await fetchWebContext(topic,{
    signal:opts.signal,
    onStep:function(ev){_emit(ev.kind,ev.data)}
  });
  if(!res||!res.ok||!res.sources||!res.sources.length){
    return res||{ok:false,reason:"empty",results:0,context:""};
  }
  /* Judge */
  var verdict=await judgeSearchQuality(res.sources,topic);
  _emit("scored",{avgRel:0,topRel:0,distribution:[0,0,0],judgeScore:verdict.score});
  if(verdict.score>=3||!verdict.rewrite||verdict.rewrite===topic){
    _emit("good",{score:verdict.score});
    return res;
  }
  /* Round 2 */
  _emit("retry_low",{score:verdict.score,rewrite:verdict.rewrite});
  var res2=await fetchWebContext(verdict.rewrite,{
    signal:opts.signal,
    onStep:function(ev){_emit(ev.kind,ev.data)}
  });
  if(res2&&res2.ok&&res2.sources&&res2.sources.length){
    _emit("retry_rewrote",{q:verdict.rewrite,n:res2.sources.length});
    return res2;
  }
  _emit("retry_still_bad",{score:verdict.score});
  /* Round 2 failed too — fall back to round-1 results. */
  return res;
}

/* When the user references a website but we couldn't extract a URL,
   drop a small "paste the full URL" hint card in the bubble so they
   know to include the https:// prefix on the next turn. */
/* Pick a useful search query for Chat mode. We don't have a
   session-wide topic here, so the user's current message is the most
   relevant signal. If it's too short, prepend the session topic. */
export function extractChatQuery(){
  /* Walk the last few user messages, take the most recent non-trivial
     one, fall back to the session topic. */
  var rec=window.stateStore.read("currentSessionId")?loadLocalMemory(window.stateStore.read("currentSessionId")):null;
  if(rec&&rec.messages){
    for(var i=rec.messages.length-1;i>=0;i--){
      var m=rec.messages[i];
      if(m.role==="user"&&m.content&&m.content.trim().length>=4){
        var q=m.content.trim().slice(0,200);
        if(window.stateStore.read("topic")&&q.length<20){q=window.stateStore.read("topic")+" — "+q}
        return q;
      }
    }
  }
  return window.stateStore.read("topic")||"";
}

/* Use the configured LLM to turn the user's natural-language text
   into 1-2 short, search-engine-friendly queries. This is the
   "let AI do the query" part of the user's request. We:
     1) Send a tiny prompt asking for a JSON array of queries.
     2) Use the first query for the search; if a second exists, also
        search it (and dedupe results).
   Falls back to the raw text if the model is unavailable or doesn't
   return valid JSON. Cached per user text via a Map. */
var _rewriterCache=new Map();

export async function rewriteQueryForSearch(rawText){
  if(!rawText||!hasUsableActive())return null;
  var cached=_rewriterCache.get(rawText);
  if(cached)return cached;
  var prompt="You are a precise search query generator. Given the user's message, generate "+
    "search queries that will return EXACTLY the information the user is looking for. "+
    "Accuracy is critical — prefer EXACT PHRASE matches and UNIQUE technical terms over generic keywords. "+
    "Rules:\n"+
    "- Each query MUST contain the CORE named entities and key terms from the user's message\n"+
    "- Use exact phrase matching: put specific multi-word terms in quotes when they form a unit\n"+
    "- Queries must be 4-12 words, precise not generic\n"+
    "- Avoid filler words, pronouns, and vague terms\n"+
    "- Generate 5 queries, each targeting a slightly different facet so at least 2-3 return useful results\n"+
    "Output ONLY a JSON array of strings, no other text. "+
    "Example for user asking about migrating from TensorFlow to PyTorch performance:\n"+
    "[\"TensorFlow to PyTorch migration performance comparison\", "+
    "\"PyTorch vs TensorFlow benchmark 2025\", "+
    "\"migrate TensorFlow model PyTorch tutorial step by step\", "+
    "\"PyTorch performance tips production deployment\", "+
    "\"PyTorch vs JAX speed benchmark 2025\"]";
  var msgs=[
    {role:"system",content:prompt},
    {role:"user",content:rawText.slice(0,500)}
  ];
  try{
    var r=await apiFetch("/api/chat",{method:"POST",body:{messages:msgs,temperature:0.3,max_tokens:250,mode:"chat"}});
    var txt=(r&&typeof r.content==="string")?r.content:
      (r&&r.choices&&r.choices[0]&&r.choices[0].message&&r.choices[0].message.content)||"";
    if(!txt)return null;
    /* Extract the first JSON array. Be tolerant of stray prose. */
    var m=txt.match(/\[[\s\S]*?\]/);
    if(!m)return null;
    var arr;
    try{arr=JSON.parse(m[0])}catch(_){return null}
    if(!Array.isArray(arr)||!arr.length)return null;
    var cleaned=arr.filter(function(x){return typeof x==="string"&&x.trim()}).map(function(x){return x.trim()});
    if(!cleaned.length)return null;
    /* Cap cache to 64 entries to avoid unbounded growth. */
    if(_rewriterCache.size>64){_rewriterCache.clear()}
    _rewriterCache.set(rawText,cleaned);
    return cleaned;
  }catch {
    console.log("[rewriter] failed");
    return null;
  }
}

/* Returns true if we should kick off a background re-fetch. Called
   from every prompt builder. The rule: every 5 user turns we refresh,
   unless we just refreshed within the last 30s. */
export function shouldRefreshSearch(){
  if(!webSearchOn)return false;
  var last=window.stateStore.read("searchContextAt")||0;
  if(Date.now()-last<30000)return false;
  if(!window.stateStore.read("searchContextQuery"))return false;
  return (window.stateStore.read("totalQ")%SEARCH_REFRESH_EVERY)===0;
}

/* Update the small pill in the chat header. `count=0` for loading/err. */
export function setSearchPill(kind,count,label){
  var p=document.getElementById("searchPill");
  if(!p)return;
  if(!webSearchOn){p.classList.add("hidden");return}
  p.classList.remove("hidden");
  p.className="search-pill "+kind;
  p.textContent=tr("chat.webSearchLabel")+" "+(label||(count>0?tr("chat.webSearchSources").replace("{n}",count):""));
  p.title=kind==="ok"?tr("chat.webSearchResults"):kind==="err"?tr("chat.webSearchFailed"):"";
}
