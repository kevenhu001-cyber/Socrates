/* ── Sidebar chrome + recents filter ──
   Small utilities for sidebar toggle and recents filter persistence.
   Larger functions (renderRecents, saveCurrentSession, loadSession,
   deleteSession) stay in main.js — their DOM/IO coupling makes
   extraction a separate dedicated PR.
   Reads main.js globals via window.* (sidebarOpen, RECENTS_FILTER_KEY,
   syncSidebarBtns, renderRecents, getRecentsFilter, etc.). */

/* Persisted sidebar collapsed/expanded state. main.js sets up
   sidebarOpen=true and reads the persisted pref on boot. */
export function toggleSidebar(){
  var sidebarOpen=window.sidebarOpen;
  sidebarOpen=!sidebarOpen;
  window.sidebarOpen=sidebarOpen;
  var s=document.getElementById("sidebar");
  var bd=document.getElementById("sidebarBackdrop");
  if(sidebarOpen){
    s.classList.remove("collapsed");
    if(bd&&window.innerWidth<768)bd.classList.add("show");
  }else{
    s.classList.add("collapsed");
    if(bd)bd.classList.remove("show");
  }
  window.syncSidebarBtns&&window.syncSidebarBtns();
  try{localStorage.setItem("socrates-sb",sidebarOpen?"1":"0")}catch(e){}
}

/* Recents filter is a project-tag chip the user picked to narrow the
   recents list. Persisted in localStorage so it survives reloads.
   main.js's renderRecents() reads it via getRecentsFilter() on each
   paint; the setter re-renders immediately. */
export function getRecentsFilter(){
  try{return localStorage.getItem(window.RECENTS_FILTER_KEY)||null}catch(_){return null}
}

export function setRecentsFilter(v){
  try{if(v)localStorage.setItem(window.RECENTS_FILTER_KEY,v);else localStorage.removeItem(window.RECENTS_FILTER_KEY)}catch(_){}
  window.renderRecents&&window.renderRecents();
}

/* Drop the pinned/tag filter and re-render. Used by the empty-state
   "Clear filter" link so a user who's stuck looking at an empty list
   (because a stale filter matches nothing) can recover in one click. */
export function clearRecentsFilter(){
  setRecentsFilter(null);
}

/* Recents filter chip click handler. Chips toggle the active filter:
   - clicking "all" clears any filter
   - clicking the active chip again clears it
   - clicking a different chip switches to that one */
export function onRecentsFilterChipClick(val){
  var cur=getRecentsFilter();
  if(val==="all"){setRecentsFilter(null)}
  else if(cur===val){setRecentsFilter(null)}  /* toggle off */
  else{setRecentsFilter(val)}
}
