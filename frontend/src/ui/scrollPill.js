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
  let lastScrollTop = null;
  let lastScroller = scrollContainer();
  if(lastScroller) lastScrollTop = lastScroller.scrollTop;

  /* P_stream-scroll-intent — the scroll-position listener below cannot
     tell an upward wheel flick from the layout growing underneath the
     reader: while an answer streams, doRender() snaps scrollTop to the
     bottom every ~50-120ms, so a wheel/touch scroll that begins inside
     the pin slack is undone before it can escape — the transcript feels
     locked during streaming. Listen for the INPUT (wheel up / touch
     drag / keyboard) instead of the resulting position: any upward
     intent releases the pin immediately, and a short guard stops the
     programmatic snap's own scroll event from re-pinning the reader
     against their will. Scrolling back down (or clicking the pill)
     clears the guard so the bottom re-pins naturally. */
  let upIntentAt = 0;
  const UP_INTENT_GUARD_MS = 600;

  function releasePin(){
    upIntentAt = Date.now();
    if(!state._userScrolledAway) state._userScrolledAway = true;
  }

  document.addEventListener("wheel", function(ev){
    if(ev.deltaY < 0) releasePin();
    else if(ev.deltaY > 0) upIntentAt = 0;
  }, {passive:true, capture:true});

  let touchY = null;
  document.addEventListener("touchstart", function(ev){
    touchY = ev.touches && ev.touches.length ? ev.touches[0].clientY : null;
  }, {passive:true, capture:true});
  document.addEventListener("touchmove", function(ev){
    if(touchY == null || !ev.touches || !ev.touches.length) return;
    const y = ev.touches[0].clientY;
    if(y - touchY > 4) releasePin();      /* finger down = scrolling up */
    else if(touchY - y > 4) upIntentAt = 0;
    touchY = y;
  }, {passive:true, capture:true});

  document.addEventListener("keydown", function(ev){
    const el = ev.target;
    const tag = el && el.tagName;
    if(tag === "INPUT" || tag === "TEXTAREA" || (el && el.isContentEditable)) return;
    if(ev.key === "ArrowUp" || ev.key === "PageUp" || ev.key === "Home") releasePin();
    else if(ev.key === "End") upIntentAt = 0;
  }, true);

  document.addEventListener("scroll", function(ev){
    const sc = scrollContainer();
    if(!sc) return;
    /* Ignore scroll events from child elements (code blocks with
       overflow-y, inline iframes, etc.) — only the main chat
       scroller's position determines user intent. Without this
       guard, scrolling inside a <pre> code block or a viz iframe
       could set _userScrolledAway=true and break auto-scroll. */
    if(ev.target !== sc) return;
    /* P_auto-scroll-respect — velocityScrollTo() tags the list with
       `data-auto-scrolling="true"` while it programmatically
       scrolls. Any scroll event fired during that window is from
       our own interpolation, not the user; flipping
       _userScrolledAway here would break the keyboard/scroll
       lockstep guarantee (the keyboard lift would stop being
       followed by the scroll because wasPinned would already be
       false by the time the inset animation reached its target). */
    if(sc.dataset.autoScrolling === 'true') return;
    const previousTop = sc===lastScroller ? lastScrollTop : null;
    lastScroller = sc;
    lastScrollTop = sc.scrollTop;
    const atBottom = sc.scrollHeight - sc.scrollTop - sc.clientHeight <= SCROLL_SLACK;
    if(atBottom){
      /* Ignore "back at bottom" while an upward intent is fresh — it is
         the streaming snap fighting the user, not the user returning. */
      if(Date.now() - upIntentAt < UP_INTENT_GUARD_MS) return;
      state._userScrolledAway = false;
      hideNewReplyPill();
    } else if(!state._userScrolledAway){
      /* Only an upward position change means the reader left the latest
         answer. Composer growth, keyboard avoidance, and late rich-content
         layout all reduce the visible viewport without changing scrollTop;
         treating those geometry-only events as user intent strands the
         reader above the bottom. Downward programmatic snaps followed by
         same-task content growth must not release the pin either. */
      const movedUp = previousTop != null && sc.scrollTop < previousTop - 1;
      if(movedUp&&!debounceTmo){
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
        upIntentAt = 0;
        state._userScrolledAway = false;
        hideNewReplyPill();
        return;
      }
      t = t.parentNode;
    }
  });
}
