var state={
  /* session: active chat / topic lifecycle, including the
     authoritative message list (P1.1). */
  session:{
    topic:"",phase:"topic",diagIndex:0,diagAnswers:[],diagQuestions:[],
    currentSessionId:null,substantiveCount:0,explaining:false,
    sessionTitle:null,domain:null,
    totalQ:0,stuckCount:0,
    /* P1.1 — authoritative message list, single source of truth.
       Each entry: { clientId, role, rawText, html, type, actions? }.
       `rawText` is the unformatted text used for history extraction
       and session save; `html` is the rendered output. The DOM is
       a downstream view of this list — never the other way around. */
    messages:[],
    /* P2.1 — project binding. `currentProjectId` is the project
       the active session belongs to (defaults to "inbox" for
       legacy sessions). */
    currentProjectId:null,
    /* P2.1 — UI state: which project is the Recents panel
       currently filtered to. `null` = "All projects". */
    activeProjectFilter:null
  },
  /* kb: knowledge graph + mistake book. */
  kb:{kbNodes:[],currentNode:0,mistakes:[]},
  /* search: web-research results cached from the most recent round 2. */
  search:{context:null,results:[],contextAt:0,contextCount:0,contextQuery:null,error:null},
  /* call: most recent API call metadata — used by the chatApiBadge. */
  call:{source:null,error:null},
  /* ui: ephemeral UI state (per-tab, never persisted). */
  ui:{_userScrolledAway:false,_examInView:false},
  /* exam: exam-mode state (ephemeral, never persisted). */
  exam:{cancel:false,questions:[],answers:{},submitted:false,topic:"",count:0}
};

/* P1.5 — flat-name lookup table for the Proxy. Maps a legacy
   `state.<field>` access to its sub-namespace + property. Update
   this whenever a new field is added to a sub-namespace; existing
   fields are listed below. */
var STATE_FLAT_TO_NS={
  /* session */
  topic:"session.topic",phase:"session.phase",diagIndex:"session.diagIndex",
  diagAnswers:"session.diagAnswers",diagQuestions:"session.diagQuestions",
  currentSessionId:"session.currentSessionId",substantiveCount:"session.substantiveCount",
  explaining:"session.explaining",sessionTitle:"session.sessionTitle",
  domain:"session.domain",totalQ:"session.totalQ",stuckCount:"session.stuckCount",
  messages:"session.messages",
  currentProjectId:"session.currentProjectId",
  activeProjectFilter:"session.activeProjectFilter",
  /* kb */
  kbNodes:"kb.kbNodes",currentNode:"kb.currentNode",
  mistakes:"kb.mistakes",
  /* search */
  searchContext:"search.context",searchResults:"search.results",
  searchContextAt:"search.contextAt",searchContextCount:"search.contextCount",
  searchContextQuery:"search.contextQuery",searchContextError:"search.error",
  /* call */
  lastCallSource:"call.source",lastCallError:"call.error",
  /* ui */
  _userScrolledAway:"ui._userScrolledAway",
  _examInView:"ui._examInView",
  /* exam */
  examCancel:"exam.cancel",examQuestions:"exam.questions",
  examAnswers:"exam.answers",examSubmitted:"exam.submitted",
  examTopic:"exam.topic",examCount:"exam.count"
};

/* P1.5 — Proxy that translates flat legacy reads/writes into
   the new namespace structure. The Proxy is the value of the
   module-level `state` identifier from this point on. Reads
   always return the live sub-namespace value (so `state.topic`
   and `state.session.topic` see the same data). Writes update
   the sub-namespace. Deletes are no-ops (legacy code never
   `delete state.<x>`). */
(function(){
  function resolve(path){
    var parts=path.split(".");
    var cur=state;
    for(var i=0;i<parts.length;i++){
      if(cur==null)return undefined;
      cur=cur[parts[i]];
    }
    return cur;
  }
  var proxy=new Proxy(state,{
    get:function(target,prop){
      if(typeof prop!=="string")return Reflect.get(target,prop);
      if(prop in target)return Reflect.get(target,prop);
      if(Object.prototype.hasOwnProperty.call(STATE_FLAT_TO_NS,prop)){
        return resolve(STATE_FLAT_TO_NS[prop]);
      }
      return undefined;
    },
    set:function(target,prop,value){
      if(typeof prop!=="string")return Reflect.set(target,prop,value);
      if(prop in target)return Reflect.set(target,prop,value);
      if(Object.prototype.hasOwnProperty.call(STATE_FLAT_TO_NS,prop)){
        var path=STATE_FLAT_TO_NS[prop].split(".");
        var cur=state;
        for(var i=0;i<path.length-1;i++){
          if(cur[path[i]]==null)cur[path[i]]={};
          cur=cur[path[i]];
        }
        cur[path[path.length-1]]=value;
        return true;
      }
      /* Unknown property — set on the root target so we don't
         lose data, and warn. This preserves the previous
         behaviour of `state.foo = bar` silently working. */
      console.warn("[state] unknown flat key, setting on root:",prop);
      target[prop]=value;
      return true;
    },
    has:function(target,prop){
      if(typeof prop!=="string")return Reflect.has(target,prop);
      if(prop in target)return true;
      return Object.prototype.hasOwnProperty.call(STATE_FLAT_TO_NS,prop);
    },
    ownKeys:function(target){
      return Array.from(new Set([].concat(
        Reflect.ownKeys(target),
        Object.keys(STATE_FLAT_TO_NS)
      )));
    },
    getOwnPropertyDescriptor:function(target,prop){
      if(typeof prop!=="string")return Reflect.getOwnPropertyDescriptor(target,prop);
      if(prop in target)return Reflect.getOwnPropertyDescriptor(target,prop);
      if(Object.prototype.hasOwnProperty.call(STATE_FLAT_TO_NS,prop)){
        var path=STATE_FLAT_TO_NS[prop];
        var val=resolve(path);
        return{
          configurable:true,enumerable:true,
          get:function(){return resolve(path)},
          set:function(v){
            var parts=path.split(".");
            var cur=state;
            for(var i=0;i<parts.length-1;i++){if(cur[parts[i]]==null)cur[parts[i]]={};cur=cur[parts[i]]}
            cur[parts[parts.length-1]]=v;
          }
        };
      }
      return undefined;
    }
  });
  /* Replace the module-level `state` with the proxy. */
  state=proxy;
})();

/* Expose as a global for backward compat with the rest of the code.
   main.js and other modules reference `state` as a bare name; since
   ES module scope does not share var/let/const across import chains,
   we put it on window so all code sees the same instance. */
window.state = state;

/* P1.5 — reset all namespaces to their defaults. Callers that
   previously did `state = {…}` should use this instead so the
   Proxy is preserved. The proxy is bound to the *binding*, not
   the value, so reassigning `state = …` would orphan every
   observer and break the legacy `state.topic` getter. */
function resetState(){
  state.session.topic="";
  state.session.phase="topic";
  state.session.diagIndex=0;
  state.session.diagAnswers=[];
  state.session.diagQuestions=[];
  state.session.currentSessionId=null;
  state.session.substantiveCount=0;
  state.session.explaining=false;
  state.session.sessionTitle=null;
  state.session.domain=null;
  state.session.totalQ=0;
  state.session.stuckCount=0;
  state.session.messages=[];
  state.session.currentProjectId=null;
  state.session.activeProjectFilter=null;
  state.kb.kbNodes=[];
  state.kb.currentNode=0;
  state.kb.mistakes=[];
  state.search.context=null;
  state.search.results=[];
  state.search.contextAt=0;
  state.search.contextCount=0;
  state.search.contextQuery=null;
  state.search.error=null;
  state.call.source=null;
  state.call.error=null;
  state.ui._userScrolledAway=false;
}
/* Expose for modules that reference resetState via onclick handlers. */
window.resetState = resetState;
