var state={
  /* session: active chat / topic lifecycle, including the
     authoritative message list (P1.1). */
  session:{
    topic:"",phase:"topic",diagIndex:0,diagAnswers:[],diagQuestions:[],
    currentSessionId:null,substantiveCount:0,explaining:false,
    sessionTitle:null,domain:null,
    totalQ:0,stuckCount:0,
    /* P1.1 — branchedFrom metadata: records the source session and
       message when this session was created via branching. */
    branchedFrom:null,
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
    fourOptionDialog:null,
    /* U-H3 — set true when the user cancels diagnostic-question
       generation so the async generation loop can bail out early
       instead of finishing a run whose result will be discarded. */
    diagCancel:false
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
  /* search: web-research results cached from the most recent round 2. */
  search:{context:null,results:[],contextAt:0,contextCount:0,contextQuery:null,error:null},
  /* call: most recent API call metadata — used by the chatApiBadge. */
  call:{source:null,error:null},
  /* ui: ephemeral UI state (per-tab, never persisted). */
  ui:{_userScrolledAway:false,_examInView:false},
  /* exam: exam-mode state (ephemeral, never persisted). */
  exam:{cancel:false,questions:[],answers:{},submitted:false,topic:"",count:0,_examScrollBound:false,readOnly:false,lang:"",difficulty:"intermediate",instructions:"",types:[],_examPrevActiveId:null},
  /* tutor: ephemeral working state for the tutoring feature. */
  tutorAttachments:null,
  tutorPartsTemplate:null
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
  diagCancel:"session.diagCancel",
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

/* P1.5 — reset all namespaces to their defaults. Callers that
   previously did `state = {…}` should use this instead so the
   Proxy is preserved. The proxy is bound to the *binding*, not
   the value, so reassigning `state = …` would orphan every
   observer and break the legacy `state.topic` getter. */
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
  state.session.stuckCheckOffered=false;
  state.session.stuckCheckRejected=0;
  state.session.fourOptionDialog=null;
  state.session.diagCancel=false;
  /* AUDIT-fix — branchedFrom was the only session field skipped by
     this reset, so a new session started right after viewing a
     branched one would persist the stale "Branched from …" metadata
     to the server on its first save. */
  state.session.branchedFrom=null;
  /* AUDIT-fix — tutor-mode attachment working state also leaked into
     the next session: startSession only writes these in tutor mode,
     so a tutor→chat→tutor sequence could feed the earlier session's
     attachments into the new diagnostic/teaching LLM calls. */
  state.tutorAttachments=null;
  state.tutorPartsTemplate=null;
  state.kb.kbNodes=[];
  state.kb.currentNode=0;
  state.kb.mistakes=[];
  state.kb.boundariesHistory=[];
  state.kb.boundariesSavedAt=0;
  state.kb.mistakeFilter="all";
  state.search.context=null;
  state.search.results=[];
  state.search.contextAt=0;
  state.search.contextCount=0;
  state.search.contextQuery=null;
  state.search.error=null;
  state.call.source=null;
  state.call.error=null;
  state.ui._userScrolledAway=false;
  state.ui._examInView=false;
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
  /* P_exam-prev-active — _examPrevActiveId records the provider that
     was active before entering the exam view, so restoreExamActiveProvider
     can switch back when the exam is closed. Not clearing it in resetState
     means a subsequent exam session (or non-exam session) could inherit
     the old provider binding and incorrectly restore it. */
  try{state.exam._examPrevActiveId=null}catch(_){}
  /* P_dup-session — also clear the top-level mirror so a follow-up
     call to saveCurrentSession doesn't read a stale id and try to
     re-open a session that was just deleted / reset. Without this,
     bounceOutOfArchivedSession left state.currentSessionId pointing
     at the deleted session, which (a) confused renderRecents about
     which row was active and (b) made the chat view briefly show
     stale content if any code path looked at the top-level field
     instead of state.session.currentSessionId. setCurrentSessionId
     lives in main.js to keep the helper co-located with the other
     loadSession / startSession call sites that need it. */
  try{if(typeof setCurrentSessionId==="function"){setCurrentSessionId(null)}else if("currentSessionId" in state){state.currentSessionId=null}}catch(_){}
}
/* Expose for modules that reference resetState via onclick handlers. */
window.resetState = resetState;
