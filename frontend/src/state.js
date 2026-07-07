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
    activeProjectFilter:null,
    /* Task 2.1 — explicit client-side teaching-stage state machine.
       `teachingStage` tracks where we are in the
       motivate → define → develop → illustrate → exercise → check
       loop for the current sub-topic. `currentExampleIdx` is the
       0-based index of the example we're on; `practiceAttempts`
       counts how many times the user has attempted the current
       practice problem. `teachingPlan` holds the structured plan
       object produced by finishDiagnostic (see Task 3.1). */
    teachingStage:"motivate",
    currentExampleIdx:0,
    practiceAttempts:0,
    practicePhase:"foundation",
    teachingPlan:null,
    /* v3.0 design — long-term plan fields populated by the user from
       the topic-setup screen. Defaults match §10.1 of the design doc
       (30 minutes/day, no fixed deadline, no scheduled rest days). */
    planTargetDate:null,
    planDailyMinutes:30,
    planWeeklyRestDays:[],
    planStartedAt:null,
    planLastWarnedAt:0,
    /* v3.0 design — stuck-detection. The "stuck check" prompt appears
       once the system has observed what looks like a conceptual break
       (reasoning chain fracture, not just a short answer). The four
       options are: hint, full explanation, add to mistake book,
       skip. `stuckCheckOffered` tracks whether we've already shown
       the "讲解一下 / 再想想" choice for the current node — once both
       branches are exhausted we fall through to the four-option
       dialog. */
    stuckCheckOffered:false,
    stuckCheckRejected:0,
    fourOptionDialog:null
  },
  /* kb: knowledge graph + mistake book. */
  kb:{kbNodes:[],currentNode:0,mistakes:[],
    /* v3.0 design — knowledge boundary version history. Each
       `boundariesSavedAt` mutation produces a snapshot in
       `boundariesHistory` so the user can compare past and present
       (the most direct growth signal per §6.6). Bounded to last 30
       entries to avoid unbounded localStorage growth. */
    boundariesHistory:[],
    boundariesSavedAt:0,
    /* v3.0 design — mistake book UI state. `mistakeFilter` mirrors
       the sidebar filter dropdown (all/unresolved/byNode). */
    mistakeFilter:"all"},
  /* plan: long-term plan warnings (e.g. deadline pressure). */
  plan:{warning:null,lastEvaluatedAt:0},
  /* search: web-research results cached from the most recent round 2. */
  search:{context:null,results:[],contextAt:0,contextCount:0,contextQuery:null,error:null},
  /* call: most recent API call metadata — used by the chatApiBadge. */
  call:{source:null,error:null},
  /* ui: ephemeral UI state (per-tab, never persisted). */
  ui:{_userScrolledAway:false,_examInView:false},
  /* exam: exam-mode state (ephemeral, never persisted). */
  exam:{cancel:false,questions:[],answers:{},submitted:false,topic:"",count:0,_examScrollBound:false,readOnly:false,lang:"",difficulty:"intermediate",instructions:"",types:[],_examPrevActiveId:null}
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
  /* Task 2.1 — teaching-stage state machine fields. Mapped so
     legacy `state.teachingStage` etc. continue to work alongside
     the namespaced `state.session.teachingStage`. */
  teachingStage:"session.teachingStage",
  currentExampleIdx:"session.currentExampleIdx",
  practiceAttempts:"session.practiceAttempts",
  practicePhase:"session.practicePhase",
  teachingPlan:"session.teachingPlan",
  /* kb */
  kbNodes:"kb.kbNodes",currentNode:"kb.currentNode",
  mistakes:"kb.mistakes",
  boundariesHistory:"kb.boundariesHistory",
  boundariesSavedAt:"kb.boundariesSavedAt",
  mistakeFilter:"kb.mistakeFilter",
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
  examTopic:"exam.topic",examCount:"exam.count",
  _examScrollBound:"exam._examScrollBound",examReadOnly:"exam.readOnly",
  examLang:"exam.lang",examDifficulty:"exam.difficulty",
  examInstructions:"exam.instructions",examTypes:"exam.types",
  _examPrevActiveId:"exam._examPrevActiveId"
};

/* P1.5 — Proxy that translates flat legacy reads/writes into
   the new namespace structure. The Proxy is the value of the
   module-level `state` identifier from this point on. Reads
   always return the live sub-namespace value (so `state.topic`
   and `state.session.topic` see the same data). Writes update
   the sub-namespace. Deletes are no-ops (legacy code never
   `delete state.<x>`).
   ─────────────────────────────────────────────────────────────────
   The flat-namespace compat shim is preserved by design:
   main.js has ~200 references to `state.topic`, `state.messages`,
   `state.kbNodes` etc. that all flow through this Proxy. Removing
   the shim is a single-shot full rewrite of those call sites,
   which belongs in a dedicated refactor PR. Until then the
   Proxy is the contract: any new field MUST be added to
   STATE_FLAT_TO_NS below (or live on the `state` root directly)
   for the legacy `state.<name>` form to work. */
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
    deleteProperty:function(target,prop){
      if(typeof prop!=="string")return Reflect.deleteProperty(target,prop);
      // Flat-namespace keys: resolve to the sub-namespace path and delete there.
      if(Object.prototype.hasOwnProperty.call(STATE_FLAT_TO_NS,prop)){
        var path=STATE_FLAT_TO_NS[prop].split(".");
        var cur=state;
        for(var i=0;i<path.length-1;i++){
          if(cur[path[i]]==null)return true;
          cur=cur[path[i]];
        }
        delete cur[path[path.length-1]];
        return true;
      }
      // Unknown property — no-op (don't delete from root to preserve Proxy integrity).
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

/* v3.0 design — wire the plan-setup toggle and inputs once the
   DOM is ready. Called from a DOMContentLoaded handler so the
   <button>s exist by the time we attach. */
if(typeof document!=="undefined"){
  if(document.readyState==="loading"){
    document.addEventListener("DOMContentLoaded",initPlanSetupUI);
  }else{
    try{initPlanSetupUI()}catch(_){}
  }
}

/* Task 3.1 — teachingPlan structure (stored in state.session.teachingPlan):
   {
     subtopics: [
       {
         name:            <string>,  // sub-topic display name (mirrors kbNode.name)
         status:          <"blank"|"fuzzy"|"internalized">,
         objective:       <string>,  // e.g. "Master <name>"
         exampleCount:    <number>,  // how many worked examples to present (default 2)
         practiceCount:   <number>,  // how many practice problems (default 1)
         inspectionType:  <"concept"|"procedural"|"application">,
         prerequisites:   <string[]> // names of sub-topics that should precede this one
       }
     ],
     currentSubtopicIdx: <number>,   // index into subtopics[] currently being taught
     createdAt:          <number>    // Date.now() when the plan was generated
   }
   Generated by finishDiagnostic in main.js; rendered by renderKnowledgeView. */

/* v3.0 design — §10.1 plan-setup toggle + input wiring.
   Called once on page load. The toggle expands/collapses the
   optional fields; the inputs write into state.session.* via
   setPlanInputs so the rest of the system sees one source of
   truth. */
function initPlanSetupUI(){
  var toggle=document.getElementById("planSetupToggle");
  var fields=document.getElementById("planSetupFields");
  if(toggle&&fields){
    toggle.onclick=function(){
      var open=toggle.getAttribute("aria-expanded")==="true";
      toggle.setAttribute("aria-expanded",open?"false":"true");
      fields.hidden=open;
    };
  }
  var dateInput=document.getElementById("planTargetDateInput");
  if(dateInput){
    dateInput.onchange=function(){
      var v=dateInput.value?new Date(dateInput.value).toISOString():null;
      try{state.planTargetDate=v}catch(_){}
      try{state.session.planTargetDate=v}catch(_){}
    };
  }
  var minInput=document.getElementById("planDailyMinutesInput");
  if(minInput){
    minInput.onchange=function(){
      var v=Math.max(5,parseInt(minInput.value,10)||30);
      try{state.planDailyMinutes=v}catch(_){}
      try{state.session.planDailyMinutes=v}catch(_){}
    };
  }
  var restWrap=document.getElementById("planRestDays");
  if(restWrap){
    Array.prototype.forEach.call(restWrap.querySelectorAll(".plan-restday"),function(btn){
      btn.onclick=function(){
        btn.classList.toggle("active");
        var days=[];
        Array.prototype.forEach.call(restWrap.querySelectorAll(".plan-restday.active"),function(b){
          days.push(parseInt(b.getAttribute("data-day"),10));
        });
        try{state.planWeeklyRestDays=days}catch(_){}
        try{state.session.planWeeklyRestDays=days}catch(_){}
      };
    });
  }
}
window.initPlanSetupUI=initPlanSetupUI;

/* Read the current plan-setup values into state. Called from
   startSession so any pending input change is committed. */
function readPlanSetupIntoState(){
  var dateInput=document.getElementById("planTargetDateInput");
  if(dateInput&&dateInput.value){
    try{state.session.planTargetDate=new Date(dateInput.value).toISOString()}catch(_){}
  }
  var minInput=document.getElementById("planDailyMinutesInput");
  if(minInput){
    var v=Math.max(5,parseInt(minInput.value,10)||30);
    try{state.session.planDailyMinutes=v}catch(_){}
  }
  var restWrap=document.getElementById("planRestDays");
  if(restWrap){
    var days=[];
    Array.prototype.forEach.call(restWrap.querySelectorAll(".plan-restday.active"),function(b){
      days.push(parseInt(b.getAttribute("data-day"),10));
    });
    try{state.session.planWeeklyRestDays=days}catch(_){}
  }
}
window.readPlanSetupIntoState=readPlanSetupIntoState;

/* Populate the plan-setup inputs from state — used on load
 * (after a session restore) and on returning to the topic-setup
 * screen. Idempotent: safe to call repeatedly. */
function writeStateIntoPlanSetup(){
  var dateInput=document.getElementById("planTargetDateInput");
  if(dateInput){
    var t=state.session.planTargetDate;
    if(t){
      try{dateInput.value=new Date(t).toISOString().slice(0,10)}catch(_){}
    }else{
      dateInput.value="";
    }
  }
  var minInput=document.getElementById("planDailyMinutesInput");
  if(minInput){
    minInput.value=String(state.session.planDailyMinutes||30);
  }
  var restWrap=document.getElementById("planRestDays");
  if(restWrap){
    var days=Array.isArray(state.session.planWeeklyRestDays)?state.session.planWeeklyRestDays:[];
    Array.prototype.forEach.call(restWrap.querySelectorAll(".plan-restday"),function(b){
      var d=parseInt(b.getAttribute("data-day"),10);
      b.classList.toggle("active",days.indexOf(d)!==-1);
    });
  }
}
window.writeStateIntoPlanSetup=writeStateIntoPlanSetup;

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
  /* Task 2.1 — reset the teaching-stage state machine so a new
     session starts at the motivate stage with no plan. */
  state.session.teachingStage="motivate";
  state.session.currentExampleIdx=0;
  state.session.practiceAttempts=0;
  state.session.practicePhase="foundation";
  state.session.teachingPlan=null;
  state.session.planTargetDate=null;
  state.session.planDailyMinutes=30;
  state.session.planWeeklyRestDays=[];
  state.session.planStartedAt=null;
  state.session.planLastWarnedAt=0;
  state.session.stuckCheckOffered=false;
  state.session.stuckCheckRejected=0;
  state.session.fourOptionDialog=null;
  state.kb.kbNodes=[];
  state.kb.currentNode=0;
  state.kb.mistakes=[];
  state.kb.boundariesHistory=[];
  state.kb.boundariesSavedAt=0;
  state.kb.mistakeFilter="all";
  state.plan.warning=null;
  state.plan.lastEvaluatedAt=0;
  state.search.context=null;
  state.search.results=[];
  state.search.contextAt=0;
  state.search.contextCount=0;
  state.search.contextQuery=null;
  state.search.error=null;
  state.call.source=null;
  state.call.error=null;
  state.ui._userScrolledAway=false;
  /* Clear exam-mode fields so a fresh session doesn't inherit stale
     topic / language / difficulty / instructions / types from a prior
     exam. */
  try{state.exam.cancel=false}catch(_){}
  try{state.exam.questions=[]}catch(_){}
  try{state.exam.answers={}}catch(_){}
  try{state.exam.submitted=false}catch(_){}
  try{state.exam.topic=""}catch(_){}
  try{state.exam.count=0}catch(_){}
  try{state.exam.readOnly=false}catch(_){}
  try{state.exam.lang=""}catch(_){}
  try{state.exam.difficulty="intermediate"}catch(_){}
  try{state.exam.instructions=""}catch(_){}
  try{state.exam.types=[]}catch(_){}
  /* P_dup-session — also clear the top-level mirror so a follow-up
     call to saveCurrentSession doesn't read a stale id and try to
     re-open a session that was just deleted / reset. Without this,
     bounceOutOfArchivedSession left state.currentSessionId pointing
     at the deleted session, which (a) confused renderRecents about
     which row was active and (b) made the chat view briefly show
     stale content if any code path looked at the top-level field
     instead of state.session.currentSessionId. */
  try{if("currentSessionId" in state)state.currentSessionId=null}catch(_){}
}
/* Expose for modules that reference resetState via onclick handlers. */
window.resetState = resetState;
