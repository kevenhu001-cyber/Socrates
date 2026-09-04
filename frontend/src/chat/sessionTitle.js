import { apiFetch } from '../util/api.js';
import { hasUsableActive } from '../config/providers.js';
import { stateStore } from '../state/store.js';

/* Generate a declarative session title based on the user's first input.
   Called fire-and-forget on first save. A short cooldown prevents repeated
   saves from amplifying a 429 while still allowing a later retry.
   Uses window.stateStore.read("topic") (the user's initial topic) as context. */
var _titleGenQueued=false;
var _titleGenSession=null;
var _titleGenRetryAfter=0;
export function generateSessionTitle(){
  var sessionId=stateStore.read("currentSessionId");
  if(!hasUsableActive()||_titleGenQueued||window.stateStore.read("sessionTitle"))return;
  /* P_title-429 — background title generation must not turn repeated saves
     into a request storm after a rate-limit response. */
  if(sessionId&&_titleGenSession===sessionId&&Date.now()<_titleGenRetryAfter)return;
  var topic=(window.stateStore.read("topic")||"").replace(/<think>[\s\S]*?<\/think>/gi,"").replace(/<think>[\s\S]*$/gi,"").trim();
  if(!topic)return;
  _titleGenQueued=true;
  _titleGenSession=sessionId||null;
  _titleGenRetryAfter=Date.now()+30000;
  /* Title language follows the language the user actually wrote the
     topic in; the UI preference is only a fallback when the topic
     carries no detectable language signal. */
  var isZh = /[\u4e00-\u9fff]/.test(topic)
    ? true
    : (/[A-Za-z]/.test(topic) ? false : window._currentLang === "zh");
  var prompt, sysContent;
  if (isZh) {
    prompt = "基于用户的第一条消息，生成一个简短的中文陈述式标题（3-8个字），"+
      "概括会话内容。示例：「探索量子计算」、「理解机器学习基础」、「学会更优写作」。\n"+
      "不要使用问句或标签 — 必须是一个陈述。只输出标题本身，不要引号，不要多余文字。\n\n"+
      topic.slice(0, 300);
    sysContent = "不要输出<think>思考块、内部推理或思维链。直接输出最终的标题，纯文字，无前缀。";
  } else {
    prompt = "Based on the user's first message below, generate a SHORT "+
      "declarative title (3-8 words) in a statement tone that names what the "+
      "session is about. Examples: \"Exploring quantum computing\", "+
      "\"Understanding machine learning basics\", \"Writing better essays\". "+
      "Do NOT use a question or a label — it must read as a statement. "+
      "Output ONLY the title, no quotes, no extra text.\n\n"+topic.slice(0,300);
    sysContent = "Do NOT output <think>...</think> blocks, internal reasoning, or chain-of-thought. Reply directly with the final title in clean prose. No preamble.";
  }
  var sysMsg={role:"system",content:sysContent};
  var userMsg={role:"user",content:prompt};
  var msgs2=[sysMsg,userMsg];
  /* Background-only call: never trigger the global 401 → auth-gate flow.
     A title request that races a real session expiry (or a rate limit)
     must fail silently — the main chat turn already owns the user-visible
     429 toast / sign-in gate, and a duplicate handleAuthExpired from here
     would re-enter the gate + abort the stream a second time. */
  apiFetch("/api/chat",{method:"POST",_authEndpoint:true,body:{messages:msgs2,temperature:0.3,max_tokens:30,mode:"chat"}}).then(function(r){
    _titleGenQueued=false;
    var raw=(r&&typeof r.content==="string")?r.content:
      (r&&r.choices&&r.choices[0]&&r.choices[0].message&&r.choices[0].message.content)||"";
    if(!raw)return;
    /* Mirror the strips formatMsg() / stripChatArtifacts() apply to
     * chat output, plus a few extra guards for title-gen quirks:
     *  - closed <think>…</think> and unclosed trailing <think>…$
     *  - chat-template tokens (<|im_start|>, <s>, [INST], etc.)
     *  - any leading punctuation the model added (quotes, dashes,
     *    bullets) that would look ugly in a sidebar title. */
    var title=raw
      .replace(/<think>[\s\S]*?<\/think>/gi,"")
      .replace(/<think>[\s\S]*$/gi,"")
      .replace(/<\|im_start\|>[\s\S]*?<\|im_end\|>/g,"")
      .replace(/<\|[a-z_]+\|>/gi,"")
      .replace(/<\/?s>/g,"")
      .replace(/\[INST\]|\[\/INST\]|<<SYS>>|<<\/SYS>>/g,"")
      .replace(/^\s*Title\s*[:\-]\s*/i,"")
      .replace(/^\s*标题\s*[:\-]\s*/,"")
      .trim()
      .replace(/^[\s\-•·—:"'\u201c\u201d\u2018\u2019]+|[\s\-•·—:"'\u201c\u201d\u2018\u2019]+$/g,"")
      .replace(/^[\s\-•·—:]+/,"")
      .slice(0,60);
    if(title&&title.length>2){
      /* P_title-save-race — only save the title if the session is
         still active. A previous session may have been deleted or
         reset while the title generation was in-flight, and calling
         saveCurrentSession() would either resurrect the deleted
         session or attach a stale title to the wrong session. */
      if(window.stateStore.read("currentSessionId"))stateStore.dispatch({type:'state/set',key:'sessionTitle',value:title});
      _titleGenRetryAfter=0;
      if (typeof window.saveCurrentSession === "function") window.saveCurrentSession();
    }
  }).catch(function(e){
    _titleGenQueued=false;
    /* P_title-quiet — 401 (session gone; the main turn already showed the
       gate) and 429 (rate-limited; the main turn already owns the retry
       toast) are expected background failures: stay silent and, for 429,
       back off longer so the next save doesn't re-hit the same bucket.
       Only log unexpected failures to keep the console useful. */
    var st=e&&e.status;
    if(st===429){_titleGenRetryAfter=Date.now()+5*60*1000;return;}
    if(st===401)return;
    console.log("[title gen] failed");
  });
}
