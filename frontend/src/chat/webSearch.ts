import { apiFetch, apiFetchRaw } from '../util/api.ts';
import { offlineGuard } from './offline.ts';
import { hasUsableActive, webSearchOn } from '../config/providers.ts';
import { loadLocalMemory } from '../storage/localMemory.ts';
import { stateStore } from '../state/store.ts';
import { reportSwallow } from '../util/reportSwallow.ts';
import { shouldRefreshSearch } from './webSearchPolicy.ts';


export { shouldRefreshSearch };

/* Fetch web context for `topic`. Returns a structured result so the UI
   state fields are populated as a side effect so prompt builders can read
   `stateStore.read("searchContext")` synchronously.

   Refresh strategy (set per the user):
   - First fetch: at session start (tutor mode) or at first chat turn (chat mode)
   - Re-fetch: every 5 user turns (counted by `stateStore.read("totalQ")` mod 5)
   - Old context is KEPT in `stateStore.read("searchContext")` until the new fetch
     resolves, so a slow refresh never causes a turn to ship without
     grounding. */
/* Hard cap on /api/web-search POSTs per single fetchWebContext call.
   Each query variant + the retry (if all fail) consumes one. This
   caps the total backend search volume and prevents runaway costs
   when the rewriter generates many alternatives. */
const MAX_WS_CALLS=5;
interface SearchResult {
  url: string;
  title?: string;
  snippet?: string;
  source?: string;
  matchedQuery?: string;
  _relevance?: number;
  [key: string]: unknown;
}
interface RankedSearchResult extends SearchResult { _relevance: number }
interface SearchResponse { ok: boolean; query: string; results: SearchResult[]; status?: number; reason?: string }

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isSearchResult(value: unknown): value is SearchResult {
  return isRecord(value) && typeof value.url === 'string'
    && (value.title === undefined || typeof value.title === 'string')
    && (value.snippet === undefined || typeof value.snippet === 'string')
    && (value.source === undefined || typeof value.source === 'string');
}

function searchResultsFrom(value: unknown): SearchResult[] {
  if (!isRecord(value) || !Array.isArray(value.results)) return [];
  return value.results.filter(isSearchResult);
}

function searchContextForBackground(background: boolean | undefined){
  return background ? stateStore.read('searchContext') || '' : '';
}

async function buildSearchQueries(topic: string,opts: { queries?: string[] }){
  let queries=Array.isArray(opts.queries)?opts.queries.slice():[];
  if(!queries.length){
    const rewritten=await rewriteQueryForSearch(topic);
    if(rewritten&&rewritten.length)queries=rewritten.slice();
  }
  if(queries.indexOf(topic)===-1)queries.push(topic);
  if(queries.length>6)queries=queries.slice(0,6);
  if(queries.length>MAX_WS_CALLS)queries=queries.slice(0,MAX_WS_CALLS);
  return queries;
}

function searchOneQuery(query: string): Promise<SearchResponse>{
  return apiFetchRaw("/api/web-search",{
    method:"POST",
    body:{query:query,count:8}
  }).then(async function(response){
    const data: unknown = await response.json();
    return { ok: true, query, results: searchResultsFrom(data) };
  }).catch(function(error: unknown){
    const details = isRecord(error) ? error : {};
    return {
      ok: false,
      query,
      status: typeof details.status === 'number' ? details.status : undefined,
      reason: typeof details.message === 'string' ? details.message : undefined,
      results: [],
    };
  });
}

function mergeQueryResults(searchResponses: SearchResponse[]): SearchResult[]{
  const results: SearchResult[]=[];
  const seenUrls: Record<string, boolean>={};
  for(let responseIndex=0;responseIndex<searchResponses.length;responseIndex++){
    const response=searchResponses[responseIndex];
    if(!response.ok||!response.results)continue;
    for(let resultIndex=0;resultIndex<response.results.length;resultIndex++){
      const item=response.results[resultIndex];
      if(!item||!item.url||seenUrls[item.url])continue;
      seenUrls[item.url]=true;
      results.push(Object.assign({matchedQuery:response.query},item));
      if(results.length>=25)break;
    }
    if(results.length>=25)break;
  }
  return results;
}

async function searchForQueries(topic: string,queries: string[]){
  const searchResponses=await Promise.all(queries.map(function(query){
    return searchOneQuery(query);
  }));
  let results=mergeQueryResults(searchResponses);
  const retryAvailable=MAX_WS_CALLS-queries.length>0;
  if(!results.length&&queries[0]!==topic&&retryAvailable){
    try{
      const response=await apiFetchRaw("/api/web-search",{
        method:"POST",
        body:{query:topic,count:8}
      });
      const data: unknown = await response.json();
      results=searchResultsFrom(data).map(function(item){
        return Object.assign({matchedQuery:topic},item);
      });
    }catch(error){
      reportSwallow(error, 'webSearch.runQuery.fetchResults');
    }
  }
  return{results:results,searchResponses:searchResponses};
}

function scoreSearchResult(result: SearchResult,topicWords: string[],topicBigrams: string[]){
  const title=(result.title||"").toLowerCase();
  const snippet=(result.snippet||"").toLowerCase();
  let titleMatch=0;
  for(let wordIndex=0;wordIndex<topicWords.length;wordIndex++){
    if(title.indexOf(topicWords[wordIndex])!==-1)titleMatch++;
  }
  const phraseMatch=topicBigrams.some(function(bigram){return title.indexOf(bigram)!==-1;});
  let snippetMatch=0;
  for(let snippetIndex=0;snippetIndex<topicWords.length;snippetIndex++){
    if(snippet.indexOf(topicWords[snippetIndex])!==-1)snippetMatch++;
  }
  const termCount=Math.max(1,topicWords.length);
  return Math.min(100,Math.round(titleMatch/termCount*60+snippetMatch/termCount*40+(phraseMatch?10:0)));
}

function rankSearchResults(topic: string,searchResults: SearchResult[]): RankedSearchResult[]{
  let enriched: RankedSearchResult[]=searchResults.map((result) => ({ ...result, _relevance: 0 }));
  const originalResults=enriched.slice();
  const topicWords=((topic||"").toLowerCase().match(/[\p{L}\p{N}]+/gu)||[])
    .filter(function(word: string){return word.length>2||/[^\p{ASCII}]/u.test(word);});
  const topicBigrams: string[]=[];
  for(let index=0;index<topicWords.length-1;index++){
    topicBigrams.push(topicWords[index]+" "+topicWords[index+1]);
  }
  enriched.forEach(function(result){
    result._relevance=scoreSearchResult(result,topicWords,topicBigrams);
  });
  enriched=enriched.filter(function(result: { _relevance: number; }){return result._relevance>=30;});
  if(!enriched.length){
    enriched=originalResults.sort(function(a: { _relevance: number; },b: { _relevance: number; }){return b._relevance-a._relevance}).slice(0,3);
  }
  return enriched.sort(function(a: { _relevance: number; },b: { _relevance: number; }){return b._relevance-a._relevance;});
}

function formatSearchContext(topic: string,results: RankedSearchResult[]){
  const lines=results.map(function(result,index){
    const relevanceTag=result._relevance>=70?"[high relevance]":result._relevance>=45?"[medium relevance]":"[low relevance]";
    let heading="["+(index+1)+"] "+relevanceTag+" "+result.title;
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

function searchFailureReason(searchResponses: SearchResponse[]){
  const firstError=searchResponses.find(function(response){
    return response&&!response.ok&&(response.status||response.reason);
  });
  return firstError
    ?firstError.status?"HTTP "+firstError.status:(firstError.reason||"failed")
    :"no results";
}

export async function fetchWebContext(topic: string,opts: { background?: boolean; queries?: string[] } = {}){
  opts=opts||{};
  if(!webSearchOn||!topic)return{ok:false,reason:"disabled",results:0,context:""};
  /* Offline precheck returns immediately and keeps previous background
     context available to the next turn. */
  if(offlineGuard()){
    return{ok:false,reason:"offline",results:0,context:searchContextForBackground(opts.background)};
  }
  /* Keep the raw topic in every query set and reserve one budget slot for
     the fallback retry when a rewritten query set returns no results. */
  const queries=await buildSearchQueries(topic,opts);
  try{
    const {results,searchResponses}=await searchForQueries(topic,queries);
    if(!results.length){
      const reason=searchFailureReason(searchResponses);
      console.log("[web search] all queries failed");
      stateStore.dispatch({type:'state/set',key:'searchContextError',value:reason});
      return{ok:false,reason:reason,results:0,context:searchContextForBackground(opts.background)};
    }

    const rankedResults=rankSearchResults(topic,results);
    const context=formatSearchContext(topic,rankedResults);
    stateStore.dispatch({type:'state/batch',patch:{
      searchContext:context,
      searchContextAt:Date.now(),
      searchContextCount:rankedResults.length,
      searchContextError:null,
      searchContextQuery:topic,
      searchResults:rankedResults
    }});
    console.log("[web search]",rankedResults.length,"results for:",topic);
    return{ok:true,reason:"ok",results:rankedResults.length,context:context,sources:rankedResults};
  }catch(error){
    const reason=(error&&(error as Error).message)||String(error);
    console.log("[web search] failed");
    stateStore.dispatch({type:'state/set',key:'searchContextError',value:reason});
    /* Keep the previous context so a transient failure doesn't drop
       grounding from the next turn. */
    return{ok:false,reason:reason,results:0,context:searchContextForBackground(opts.background)};
  }
}

/* Pick a useful search query for Chat mode. We don't have a
   session-wide topic here, so the user's current message is the most
   relevant signal. If it's too short, prepend the session topic. */
export function extractChatQuery(){
  /* Walk the last few user messages, take the most recent non-trivial
     one, fall back to the session topic. */
  const sessionId = stateStore.read('currentSessionId');
  const rec = sessionId ? loadLocalMemory(sessionId) : null;
  if(rec&&rec.messages){
    for(let i=rec.messages.length-1;i>=0;i--){
      const m=rec.messages[i];
      if(m.role==="user"&&m.content&&m.content.trim().length>=4){
        let q=m.content.trim().slice(0,200);
        const topic = stateStore.read('topic');
        if (topic && q.length < 20) q = topic + ' — ' + q;
        return q;
      }
    }
  }
  return stateStore.read('topic') || '';
}

/* Use the configured LLM to turn the user's natural-language text
   into 1-2 short, search-engine-friendly queries. This is the
   "let AI do the query" part of the user's request. We:
     1) Send a tiny prompt asking for a JSON array of queries.
     2) Use the first query for the search; if a second exists, also
        search it (and dedupe results).
   Falls back to the raw text if the model is unavailable or doesn't
   return valid JSON. Cached per user text via a Map. */
const _rewriterCache = new Map<string, string[]>();

function rewriteMessages(rawText: string){
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

function rewriteResponseText(response: unknown){
  if(!isRecord(response))return "";
  if(typeof response.content === 'string') return response.content;
  const choice=Array.isArray(response.choices)?response.choices[0]:null;
  return isRecord(choice) && isRecord(choice.message) && typeof choice.message.content === 'string'
    ? choice.message.content
    : "";
}

function parseRewrittenQueries(text: string){
  if(!text)return null;
  const match=text.match(/\[[\s\S]*?\]/);
  if(!match)return null;
  let parsed: unknown;
  try{parsed=JSON.parse(match[0]);}catch(_){return null;}
  if(!Array.isArray(parsed)||!parsed.length)return null;
  const cleaned=parsed.flatMap(function(query): string[] {
    return typeof query === 'string' && query.trim() ? [query.trim()] : [];
  });
  return cleaned.length?cleaned:null;
}

function cacheRewrittenQueries(rawText: string,queries: string[]){
  if(_rewriterCache.size>64)_rewriterCache.clear();
  _rewriterCache.set(rawText,queries);
}

export async function rewriteQueryForSearch(rawText: string){
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
