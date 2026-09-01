import { createInitialAppState, FLAT_STATE_PATHS } from './state/index.ts';

var state=createInitialAppState();

/* P1.5 — flat-name lookup table for the Proxy. Maps a legacy
   `state.<field>` access to its sub-namespace + property. Update
   this whenever a new field is added to a sub-namespace; existing
   fields are listed below. */

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
   FLAT_STATE_PATHS (or live on the `state` root directly)
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
      if(Object.prototype.hasOwnProperty.call(FLAT_STATE_PATHS,prop)){
        return resolve(FLAT_STATE_PATHS[prop]);
      }
      return undefined;
    },
    set:function(target,prop,value){
      if(typeof prop!=="string")return Reflect.set(target,prop,value);
      if(prop in target)return Reflect.set(target,prop,value);
      if(Object.prototype.hasOwnProperty.call(FLAT_STATE_PATHS,prop)){
        var path=FLAT_STATE_PATHS[prop].split(".");
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
      if(Object.prototype.hasOwnProperty.call(FLAT_STATE_PATHS,prop)){
        var path=FLAT_STATE_PATHS[prop].split(".");
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
      return Object.prototype.hasOwnProperty.call(FLAT_STATE_PATHS,prop);
    },
    ownKeys:function(target){
      return Array.from(new Set([].concat(
        Reflect.ownKeys(target),
        Object.keys(FLAT_STATE_PATHS)
      )));
    },
    getOwnPropertyDescriptor:function(target,prop){
      if(typeof prop!=="string")return Reflect.getOwnPropertyDescriptor(target,prop);
      if(prop in target)return Reflect.getOwnPropertyDescriptor(target,prop);
      if(Object.prototype.hasOwnProperty.call(FLAT_STATE_PATHS,prop)){
        var path=FLAT_STATE_PATHS[prop];
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

/* M3 migration facade. New legacy call sites use read/dispatch while older
   direct state mutations remain compatible during the incremental rewrite. */
var stateStore=(function(){
  var listeners=new Set();
  var notifyScheduled=false;
  function pathFor(key){
    if(typeof key!=="string")return null;
    return FLAT_STATE_PATHS[key]||key;
  }
  /** @param {string} key @returns {any} */
  function read(key){
    var path=pathFor(key);
    if(!path)return undefined;
    var parts=path.split(".");
    var value=state;
    for(var i=0;i<parts.length;i++){
      if(value==null)return undefined;
      value=value[parts[i]];
    }
    return value;
  }
  function setPath(path,value){
    var parts=path.split(".");
    if(parts.length===1){state[parts[0]]=value;return}
    var rootKey=parts[0];
    var root=Object.assign({},state[rootKey]);
    var cursor=root;
    var source=state[rootKey];
    for(var index=1;index<parts.length-1;index++){
      var key=parts[index];
      source=source&&source[key];
      cursor[key]=Array.isArray(source)?source.slice():Object.assign({},source||{});
      cursor=cursor[key];
    }
    cursor[parts[parts.length-1]]=value;
    state[rootKey]=root;
  }
  function notify(){listeners.forEach(function(listener){listener()})}
  function notifyDeferred(){
    if(notifyScheduled)return;
    notifyScheduled=true;
    var flush=function(){notifyScheduled=false;notify()};
    if(typeof requestAnimationFrame==="function")requestAnimationFrame(flush);
    else queueMicrotask(flush);
  }
  function dispatch(action){
    if(!action||typeof action.type!=="string")throw new TypeError("stateStore.dispatch requires an action");
    var result;
    if(action.type==="state/set"){
      var path=pathFor(action.key);
      if(!path)throw new TypeError("state/set requires a key");
      setPath(path,action.value);
    }else if(action.type==="state/batch"){
      if(!action.patch||typeof action.patch!=="object")throw new TypeError("state/batch requires a patch");
      Object.keys(action.patch).forEach(function(key){
        var batchPath=pathFor(key);
        if(!batchPath)throw new TypeError("state/batch contains an invalid key");
        setPath(batchPath,action.patch[key]);
      });
    }else if(action.type==="state/patch-namespace"){
      if(!action.namespace||!state[action.namespace])throw new TypeError("Unknown state namespace");
      state[action.namespace]=Object.assign({},state[action.namespace],action.patch||{});
    }else if(action.type==="session/append-message"){
      state.session.messages=state.session.messages.concat([action.payload]);
      result=state.session.messages.length-1;
    }else if(action.type==="session/replace-messages"){
      if(!Array.isArray(action.payload))throw new TypeError("session/replace-messages requires an array payload");
      state.session.messages=action.payload.slice();
      result=state.session.messages;
    }else if(action.type==="session/update-message"){
      var updateIndex=Number(action.index);
      var current=state.session.messages[updateIndex];
      if(!Number.isInteger(updateIndex)||!current)return null;
      if(action.clientId&&current.clientId!==action.clientId)return null;
      var updated=Object.assign({},current,action.patch||{});
      state.session.messages=state.session.messages.slice(0,updateIndex)
        .concat([updated],state.session.messages.slice(updateIndex+1));
      result=updated;
    }else if(action.type==="session/remove-message-at"){
      var removeIndex=Number(action.index);
      var candidate=state.session.messages[removeIndex];
      if(!Number.isInteger(removeIndex)||!candidate)return null;
      if(action.clientId&&candidate.clientId!==action.clientId)return null;
      state.session.messages=state.session.messages.slice(0,removeIndex)
        .concat(state.session.messages.slice(removeIndex+1));
      result=candidate;
    }else if(action.type==="session/truncate-messages-after"){
      var keepIndex=Number(action.index);
      if(!Number.isInteger(keepIndex)||keepIndex < -1)return [];
      result=state.session.messages.slice(keepIndex+1);
      if(!result.length)return result;
      state.session.messages=state.session.messages.slice(0,keepIndex+1);
    }else if(action.type==="state/reset"){
      resetState();
    }else{
      throw new TypeError("Unknown state action: "+action.type);
    }
    if(action.deferNotify)notifyDeferred();
    else notify();
    return result;
  }
  return Object.freeze({
    read:read,
    dispatch:dispatch,
    getSnapshot:function(){return state},
    subscribe:function(listener){listeners.add(listener);return function(){listeners.delete(listener)}},
  });
})();
window.stateStore=stateStore;

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

/* Replace each namespace reference from one source of truth. Keeping the
   root Proxy intact preserves legacy flat reads while eliminating the
   hand-maintained reset list. */
function resetState(){
  var initial=createInitialAppState();
  state.session=initial.session;
  state.kb=initial.kb;
  state.search=initial.search;
  state.call=initial.call;
  state.ui=initial.ui;
  state.exam=initial.exam;
  state.tutorAttachments=initial.tutorAttachments;
  state.tutorPartsTemplate=initial.tutorPartsTemplate;
  try{if(typeof setCurrentSessionId==="function")setCurrentSessionId(null)}catch(_){}
}
/* Expose for modules that reference resetState via onclick handlers. */
window.resetState = resetState;

export { state, stateStore, resetState };
