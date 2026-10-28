import { apiFetch, apiFetchRaw } from '../util/api.ts';
import { callAPI } from './api.ts';
import { offlineGuard } from './offline.ts';
import { hasUsableActive, webSearchOn } from '../config/providers.ts';
import { loadLocalMemory } from '../storage/localMemory.ts';
import { stateStore } from '../state/store.js';
import { reportSwallow } from '../util/reportSwallow.ts';
import { shouldRefreshSearch } from './webSearchPolicy.ts';

export { shouldRefreshSearch };

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
/* Hard cap on /api/web-search POSTs per single fetchWebContext call.
   Each query variant + the retry (if all fail) consumes one. This
   caps the total backend search volume and prevents runaway costs
   when the rewriter generates many alternatives. */
var MAX_WS_CALLS=5;

function emitSearchStep(opts,kind,data){
  try{
    if(typeof opts.onStep==="function")opts.onStep({kind:kind,data:data||{}});
  }catch(error){
    reportSwallow(error, 'webSearch._emit');
  }
}

function setSearchPillSafely(kind,count,label,source){
  try{
    setSearchPill(kind,count,label);
  }catch(error){
    reportSwallow(error,source);
  }
}

function searchContextForBackground(background){
  return background?window.stateStore.read("searchContext")||"":"";
}

async function buildSearchQueries(topic,opts){
  var queries=Array.isArray(opts.queries)?opts.queries.slice():[];
  if(!queries.length){
    var rewritten=await rewriteQueryForSearch(topic);
    if(rewritten&&rewritten.length)queries=rewritten.slice();
  }
  if(queries.indexOf(topic)===-1)queries.push(topic);
  if(queries.length>6)queries=queries.slice(0,6);
  if(queries.length>MAX_WS_CALLS)queries=queries.slice(0,MAX_WS_CALLS);
  return queries;
}

function searchOneQuery(query){
  return apiFetchRaw("/api/web-search",{
    method:"POST",
    body:{query:query,count:8}
  }).then(function(response){
    return response.json().then(function(data){
      return{ok:true,query:query,results:(data&&data.results)||[]};
    });
  }).catch(function(error){
    return{ok:false,status:error&&error.status,reason:error&&error.message,results:[]};
  });
}

function mergeQueryResults(searchResponses,emit){
  var results=[];
  var seenUrls={};
  for(var responseIndex=0;responseIndex<searchResponses.length;responseIndex++){
    var response=searchResponses[responseIndex];
    emit("got_results",{query:response.query,count:(response.results||[]).length});
    if(!response.ok||!response.results)continue;
    for(var resultIndex=0;resultIndex<response.results.length;resultIndex++){
      var item=response.results[resultIndex];
      if(!item||!item.url||seenUrls[item.url])continue;
      seenUrls[item.url]=true;
      results.push(Object.assign({matchedQuery:response.query},item));
      if(results.length>=25)break;
    }
    if(results.length>=25)break;
  }
  return results;
}

async function searchForQueries(topic,queries,emit){
  const searchResponses=await Promise.all(queries.map(function(query,index){
    emit("querying",{query:query,idx:index,total:queries.length});
    return searchOneQuery(query);
  }));
  var results=mergeQueryResults(searchResponses,emit);
  const retryAvailable=MAX_WS_CALLS-queries.length>0;
  if(!results.length&&queries[0]!==topic&&retryAvailable){
    emit("retry",{reason:"all-failed",query:topic});
    try{
      const response=await apiFetchRaw("/api/web-search",{
        method:"POST",
        body:{query:topic,count:8}
      });
      const data=await response.json();
      results=(data.results||[]).map(function(item){
        return Object.assign({matchedQuery:topic},item);
      });
      emit("got_results",{query:topic,count:results.length});
    }catch(error){
      reportSwallow(error, 'webSearch.runQuery.fetchResults');
    }
  }
  return{results:results,searchResponses:searchResponses};
}

function scoreSearchResult(result,topicWords,topicBigrams){
  var title=(result.title||"").toLowerCase();
  var snippet=(result.snippet||"").toLowerCase();
  var titleMatch=0;
  for(var wordIndex=0;wordIndex<topicWords.length;wordIndex++){
    if(title.indexOf(topicWords[wordIndex])!==-1)titleMatch++;
  }
  var phraseMatch=topicBigrams.some(function(bigram){return title.indexOf(bigram)!==-1;});
  var snippetMatch=0;
  for(var snippetIndex=0;snippetIndex<topicWords.length;snippetIndex++){
    if(snippet.indexOf(topicWords[snippetIndex])!==-1)snippetMatch++;
  }
  var termCount=Math.max(1,topicWords.length);
  return Math.min(100,Math.round(titleMatch/termCount*60+snippetMatch/termCount*40+(phraseMatch?10:0)));
}

function relevanceDistribution(results){
  var distribution=[0,0,0];
  var topRel=0;
  var sumRel=0;
  for(var index=0;index<results.length;index++){
    var relevance=results[index]._relevance||0;
    sumRel+=relevance;
    if(relevance>topRel)topRel=relevance;
    if(relevance<30)distribution[0]++;
    else if(relevance<70)distribution[1]++;
    else distribution[2]++;
  }
  return{
    avgRel:results.length?Math.round(sumRel/results.length):0,
    topRel:topRel,
    distribution:distribution,
    count:results.length,
  };
}

function rankSearchResults(topic,searchResults,emit){
  var enriched=searchResults.map(function(result){return Object.assign({},result);});
  var originalResults=enriched.slice();
  var topicWords=((topic||"").toLowerCase().match(/[\p{L}\p{N}]+/gu)||[])
    .filter(function(word){return word.length>2||/[^\p{ASCII}]/u.test(word);});
  var topicBigrams=[];
  for(var index=0;index<topicWords.length-1;index++){
    topicBigrams.push(topicWords[index]+" "+topicWords[index+1]);
  }
  enriched.forEach(function(result){
    result._relevance=scoreSearchResult(result,topicWords,topicBigrams);
  });
  emit("scored",relevanceDistribution(enriched));
  var preFilterCount=enriched.length;
  enriched=enriched.filter(function(result){return result._relevance>=30;});
  emit("filtered",{keptCount:enriched.length,droppedCount:preFilterCount-enriched.length});
  if(!enriched.length){
    enriched=originalResults.sort(function(a,b){return b._relevance-a._relevance}).slice(0,3);
  }
  return enriched.sort(function(a,b){return b._relevance-a._relevance;});
}

function formatSearchContext(topic,results){
  var lines=results.map(function(result,index){
    var relevanceTag=result._relevance>=70?"[high relevance]":result._relevance>=45?"[medium relevance]":"[low relevance]";
    var heading="["+(index+1)+"] "+relevanceTag+" "+result.title;
    if(result.snippet)heading+=" — "+String(result.snippet).slice(0,500);
    heading+=" ( "+result.url+" )";
    heading+="\n    Source query: \""+(result.matchedQuery||topic)+"\"";
    heading+="\n    (snippet only — page not read)";
    return heading;
  });
  return"\n\n[Web research] — original query: \""+topic+"\". "+
    "These results were scored using titles and snippets, then sorted by estimated relevance. "+
    "[high relevance] results closely match what the user is asking about. [medium relevance] are related but may be tangential. "+
    "[low relevance] results are included only as supplementary context — use them cautiously.\n\n"+
    "Weave the facts into your reply as natural prose. Do NOT add [1]/[2] citation markers or append a \"Sources:\"/\"References:\" list. Attribute claims drawn only from these snippets with a Markdown link to the source URL when no tool source card covers them. "+
    "These are snippets, not verified page text: if a claim needs details beyond them, call web_fetch on the relevant URL when available. Do NOT invent facts not supported by the results. "+
    "If multiple results contradict each other, prefer [high relevance] sources.\n"+
    lines.join("\n");
}

function searchEngineCounts(results){
  var counts={};
  for(var index=0;index<results.length;index++){
    var source=results[index].source||"web";
    counts[source]=(counts[source]||0)+1;
  }
  return counts;
}

function searchFailureReason(searchResponses){
  var firstError=searchResponses.find(function(response){
    return response&&!response.ok&&(response.status||response.reason);
  });
  return firstError
    ?firstError.status?"HTTP "+firstError.status:(firstError.reason||"failed")
    :"no results";
}

export async function fetchWebContext(topic,opts){
  opts=opts||{};
  const emit=(kind,data)=>emitSearchStep(opts,kind,data);
  if(!webSearchOn||!topic)return{ok:false,reason:"disabled",results:0,context:""};
  setSearchPillSafely("loading",0,opts.background?"Refreshing…":"Searching…",opts.background?'webSearch.pill.refreshing':'webSearch.pill.searching');
  emit("started",{topic:topic,background:!!opts.background});
  /* Offline precheck resolves the pill immediately and keeps previous
     background context available to the next turn. */
  if(offlineGuard()){
    setSearchPillSafely("err",0,"Offline",'webSearch.pill.offline');
    return{ok:false,reason:"offline",results:0,context:searchContextForBackground(opts.background)};
  }
  /* Keep the raw topic in every query set and reserve one budget slot for
     the fallback retry when a rewritten query set returns no results. */
  const queries=await buildSearchQueries(topic,opts);
  emit("expanding",{queries:queries.slice(),count:queries.length});
  try{
    const {results,searchResponses}=await searchForQueries(topic,queries,emit);
    if(!results.length){
      const reason=searchFailureReason(searchResponses);
      console.log("[web search] all queries failed");
      stateStore.dispatch({type:'state/set',key:'searchContextError',value:reason});
      emit("error",{message:reason,code:"no-results"});
      setSearchPillSafely("err",0,"Search failed: "+reason,'webSearch.pill.noResults');
      return{ok:false,reason:reason,results:0,context:searchContextForBackground(opts.background)};
    }

    const rankedResults=rankSearchResults(topic,results,emit);
    const context=formatSearchContext(topic,rankedResults);
    stateStore.dispatch({type:'state/batch',patch:{
      searchContext:context,
      searchContextAt:Date.now(),
      searchContextCount:rankedResults.length,
      searchContextError:null,
      searchContextQuery:topic,
      searchResults:rankedResults
    }});
    emit("done",{
      finalCount:rankedResults.length,
      fetchedCount:0,
      engines:searchEngineCounts(rankedResults),
    });
    console.log("[web search]",rankedResults.length,"results for:",topic);
    setSearchPillSafely("ok",rankedResults.length,rankedResults.length+" sources",'webSearch.pill.done');
    return{ok:true,reason:"ok",results:rankedResults.length,context:context,sources:rankedResults};
  }catch(error){
    const reason=(error&&error.message)||String(error);
    console.log("[web search] failed");
    stateStore.dispatch({type:'state/set',key:'searchContextError',value:reason});
    emit("error",{message:reason,code:"exception"});
    setSearchPillSafely("err",0,"Search: "+reason,'webSearch.pill.exception');
    /* Keep the previous context so a transient failure doesn't drop
       grounding from the next turn. */
    return{ok:false,reason:reason,results:0,context:searchContextForBackground(opts.background)};
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

function judgeTextFromResponse(raw){
  if(typeof raw==="string")return raw;
  if(!raw||typeof raw!=="object")return"";
  if(typeof raw.content==="string")return raw.content;
  if(typeof raw.text==="string")return raw.text;
  const choice=Array.isArray(raw.choices)?raw.choices[0]:null;
  return choice&&choice.message?String(choice.message.content||""):"";
}

function parseJudgeResponse(text){
  const cleaned=(text||"").trim()
    .replace(/^```(?:json)?\s*/i,"")
    .replace(/```\s*$/i,"")
    .trim();
  try{
    return JSON.parse(cleaned);
  }catch(_){
    const match=cleaned.match(/\{[\s\S]*\}/);
    if(!match)return null;
    try{return JSON.parse(match[0]);}catch(_){return null;}
  }
}

function normalizeJudgeVerdict(parsed){
  if(!parsed||typeof parsed!=="object")return{score:3,rewrite:""};
  const parsedScore=parseInt(parsed.score,10);
  const score=Number.isNaN(parsedScore)?3:Math.max(0,Math.min(5,parsedScore));
  return{score:score,rewrite:typeof parsed.rewrite==="string"?parsed.rewrite:""};
}

/* Judge the result set via a small non-streaming LLM call. Returns
 * {score: 0..5, rewrite: string}. Failure of the call is treated as
 * score=3 (don't retry). 4 s ceiling via AbortController. */
async function judgeSearchQuality(sources, topic){
  if(!Array.isArray(sources)||!sources.length)return{score:0,rewrite:""};
  if(!hasUsableActive||!hasUsableActive())return{score:3,rewrite:""};
  const digest=_buildJudgeDigest(sources);
  const promptText=
    "You are a search-quality judge. Given the user's TOPIC and a list of search results, return strict JSON only:\n"+
    "{ \"score\": <0-5 integer>, \"rewrite\": \"<better search query, or empty if score>=3>\" }\n\n"+
    "Score 0 if results are all irrelevant or wrong language. Score 5 if top 3 results directly answer the topic. "+
    "Score 3 if results are tangential but usable. Below 3, provide a sharper rewrite in the same language.\n\n"+
    "TOPIC: "+(topic||"").slice(0,500)+"\n\n"+
    "RESULTS: "+digest;
  const messages=[
    {role:"system",content:"You are a strict JSON-output search-quality judge. Output JSON only, no prose, no markdown fences."},
    {role:"user",content:promptText}
  ];
  try{
    const raw=await callAPI(messages,80);
    if(!raw)return{score:3,rewrite:""};
    return normalizeJudgeVerdict(parseJudgeResponse(judgeTextFromResponse(raw)));
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
    try{if(typeof onStep==="function")onStep({kind:kind,data:data||{}})}catch(e){reportSwallow(e, 'webSearch.fetchWebContext._emit');}
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

function rewriteMessages(rawText){
  const prompt="You are a precise search query generator. Given the user's message, generate "+
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
  return[
    {role:"system",content:prompt},
    {role:"user",content:rawText.slice(0,500)}
  ];
}

function rewriteResponseText(response){
  if(response&&typeof response.content==="string")return response.content;
  return response&&response.choices&&response.choices[0]&&response.choices[0].message&&response.choices[0].message.content||"";
}

function parseRewrittenQueries(text){
  if(!text)return null;
  const match=text.match(/\[[\s\S]*?\]/);
  if(!match)return null;
  let parsed;
  try{parsed=JSON.parse(match[0]);}catch(_){return null;}
  if(!Array.isArray(parsed)||!parsed.length)return null;
  const cleaned=parsed
    .filter(function(query){return typeof query==="string"&&query.trim();})
    .map(function(query){return query.trim();});
  return cleaned.length?cleaned:null;
}

function cacheRewrittenQueries(rawText,queries){
  if(_rewriterCache.size>64)_rewriterCache.clear();
  _rewriterCache.set(rawText,queries);
}

export async function rewriteQueryForSearch(rawText){
  if(!rawText||!hasUsableActive())return null;
  const cached=_rewriterCache.get(rawText);
  if(cached)return cached;
  try{
    const response=await apiFetch("/api/chat",{
      method:"POST",
      body:{messages:rewriteMessages(rawText),temperature:0.3,max_tokens:250,mode:"chat"},
    });
    const queries=parseRewrittenQueries(rewriteResponseText(response));
    if(!queries)return null;
    cacheRewrittenQueries(rawText,queries);
    return queries;
  }catch {
    console.log("[rewriter] failed");
    return null;
  }
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
