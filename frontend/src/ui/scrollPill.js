// src/ui/scrollPill.js — Phase C-2.2 extraction
// "↓ new response" pill shown when the user has scrolled away from
// the bottom of the chat and a new assistant delta arrives. Clicking
// the pill snaps the scroller back to the bottom.
//
// The module registers a single global `scroll` listener (capture
// phase) that toggles `state._userScrolledAway` based on whether the
// user is currently within `SCROLL_SLACK` of the bottom. This flag is
// read by addStreamingMessage (in main.js) to decide whether to auto
// snap-to-bottom.
import { scrollContainer } from './scroll.js';
// state is exposed on window by state.js (line 220: window.state = state).
// Import the side-effect module so the Proxy is registered before this
// module's wireScrollPill() runs.
import '../state.js';
const state = window.state;

const SCROLL_SLACK = 64;   /* pixels from bottom considered "pinned" */

export function showNewReplyPill(){
  const pill = document.getElementById("newReplyPill");
  if(pill) pill.classList.add("visible");
}

export function hideNewReplyPill(){
  const pill = document.getElementById("newReplyPill");
  if(pill) pill.classList.remove("visible");
}

/* Idempotent: window flag prevents re-registering on hot-reload. */
let wired = false;
export function wireScrollPill(){
  if(wired) return;
  wired = true;

  let debounceTmo = null;

  document.addEventListener("scroll", function(){
    const sc = scrollContainer();
    if(!sc) return;
    const atBottom = sc.scrollHeight - sc.scrollTop - sc.clientHeight <= SCROLL_SLACK;
    if(atBottom){
      state._userScrolledAway = false;
      hideNewReplyPill();
    } else if(!state._userScrolledAway){
      /* Debounce: only set _userScrolledAway once per scroll burst. */
      if(!debounceTmo){
        state._userScrolledAway = true;
        debounceTmo = setTimeout(function(){ debounceTmo = null; }, 300);
      }
    }
  }, true);   /* useCapture so we catch scroll on any child element */

  /* Pill click handler — wire once, attached to the static element
     rendered by index.html. */
  document.addEventListener("click", function(ev){
    let t = ev.target;
    while(t && t !== document.body){
      if(t.id === "newReplyPill"){
        const sc = scrollContainer();
        if(sc) sc.scrollTop = sc.scrollHeight;
        state._userScrolledAway = false;
        hideNewReplyPill();
        return;
      }
      t = t.parentNode;
    }
  });
}