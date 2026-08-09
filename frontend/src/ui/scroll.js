import { planMotionForUser, easeOutQuint } from './motion.js';

// src/ui/scroll.js — Phase 1.4 extraction (main.js A.4)
// scrollContainer() returns whichever element is currently the
// scrollable surface (#msgList when chat/tutor active, else
// #mainContent for start screen / settings). Centralises the
// "where do I scroll" question for ~12 callers across main.js.
//
// velocityScrollTo() is the lower-level primitive: it scrolls an
// arbitrary target in `distance` px using the velocity-based duration
// planner in ui/motion.js. Both the keyboard-inset lift and the
// content-follow scroll share this planner so they finish in
// lockstep; that is what keeps the "AI content moves up with the
// input" geometry constant. smoothScrollToBottom() is layered on
// top of velocityScrollTo() so the data-auto-scrolling flag and the
// cancellation semantics are written once.
//
// smoothScrollToBottom() centralises the "glide to the new bottom"
// motion for send, keyboard open, and in-message content growth.
// prefers-reduced-motion degrades to an instant snap.
//
// scrollToBottomIfPinned() snaps back to bottom (or preserves the
// relative scroll position) after a font-size / width change so
// the user's visible window doesn't end up mid-list.
//
// initChatComposerReserve() keeps its legacy public name, but no longer
// measures the composer into a CSS padding variable. The composer now
// participates in the chat flex layout; this controller only preserves
// bottom-follow intent for in-message content growth (streaming text,
// image decode, tool card expansion). Keyboard-driven layout shifts
// are handled by keyboardViewport.js via a paired keyboard-inset +
// velocityScrollTo call that share one motion plan.

/* The page's scrollable area is .msg-list (when chat/tutor is
   active) or #mainContent (for the start screen, settings, etc.).
   Return whichever is currently scrollable. This centralises the
   "where do I scroll" question so we don't have to chase it every
   time we add a new auto-scroll point. */
export function scrollContainer(){
  var ml=document.getElementById("msgList");
  /* A visible chat always owns scrolling, even before its first overflow.
     Falling back to #mainContent at the exact non-scrollable -> scrollable
     boundary makes the first long reply target the wrong element and leaves
     the transcript one render behind the real bottom. */
  if(ml&&ml.offsetParent!==null){
    return ml;
  }
  return document.getElementById("mainContent");
}

/* Detect reduced-motion preference once and cache it. Browsers do not
   fire change events here reliably inside WebView, so the cached value
   is acceptable for a UX animation preference. `globalThis` fallback
   covers the Node unit-test stub. */
function prefersReducedMotion(){
  try {
    const hasWindow = typeof window !== 'undefined' && window;
    const host = hasWindow || (typeof globalThis !== 'undefined' ? globalThis : null);
    if (!host || typeof host.matchMedia !== 'function') return false;
    return host.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch (_) {
    return false;
  }
}

/* Cache the last animation started by velocityScrollTo on a given
   list so a follow-up call (e.g. keyboard inset changes from 250 to
   280 px mid-animation) cancels the previous one and starts a fresh
   run from the current position. Cancelling is essential — without
   it, two parallel scroll animations race and the visible scrollTop
   jitters between their interpolated values. */
const activeScrollAnims = typeof WeakMap === 'function' ? new WeakMap() : null;

/* `easeOutQuint` lives in ui/motion.js alongside the velocity planner
   so the per-frame interpolation matches the curve the WAAPI
   consumers see in planMotion(). KeyboardViewport's inset
   interpolation also uses it (see applyInset in keyboardViewport.js)
   — three call sites, one implementation, kept consistent by the
   shared import. */

/* Glide the chat container from its current `scrollTop` to
   `targetTop` using the velocity-based duration planner from
   ui/motion.js. Honours prefers-reduced-motion (snaps) and
   `opts.smooth:false` (snaps). Returns a Promise that resolves when
   the animation settles, or immediately when snapping.

   The planner guarantees a constant perceived velocity regardless of
   the distance — the keyboard-inset lift and the scroll-follow use
   the same planner, so when they are dispatched together (from
   keyboardViewport.applyInset) they share the same duration and
   finish in lockstep. That is the geometry contract that keeps the
   AI content and the input box at a constant relative distance.

   Implementation: manual requestAnimationFrame interpolation of
   `list.scrollTop`. WAAPI cannot animate scrollTop directly (it is
   a JS property, not a CSS property), and the platform's
   `scrollTo({behavior:'smooth'})` ignores the duration we want —
   we use it only to seed a fast first paint, then drive the rest of
   the motion ourselves so duration, easing, and cancellation are
   all under our control. Cancellation matters: rapid keyboard show
   / hide cycles must not leave a stray rAF writing to scrollTop
   after the user has manually scrolled.

   Side effect: sets `data-auto-scrolling="true"` on the container
   while the motion runs and clears it on completion so the global
   scroll listener (scrollPill.js) does not treat the programmatic
   motion as user scroll-away intent. */
export function velocityScrollTo(list, targetTop, opts){
  if(!list)return Promise.resolve();
  const o = opts || {};
  const startTop = list.scrollTop;
  const distance = targetTop - startTop;
  if (!isFinite(distance) || distance === 0) {
    return Promise.resolve();
  }
  const absDistance = Math.abs(distance);
  const reduced = prefersReducedMotion();
  const snap = reduced || o.smooth === false || absDistance <= 24 || typeof requestAnimationFrame !== 'function';
  const previous = list.dataset.autoScrolling;
  list.dataset.autoScrolling = 'true';
  const settle = function(){
    try {
      if (previous === undefined) delete list.dataset.autoScrolling;
      else list.dataset.autoScrolling = previous;
    } catch(_){ /* detached node */ }
  };
  const cancelActive = function(){
    if (activeScrollAnims && activeScrollAnims.has(list)) {
      try { activeScrollAnims.get(list).cancel(); } catch(_){}
      activeScrollAnims.delete(list);
    }
  };
  if (snap) {
    cancelActive();
    list.scrollTop = targetTop;
    settle();
    return Promise.resolve();
  }
  const plan = planMotionForUser(absDistance, o.motion);
  const duration = plan.duration;
  cancelActive();
  return new Promise(function(resolve){
    let startedAt = 0;
    let handle = 0;
    let cancelled = false;
    const tick = function(now){
      if (cancelled) return;
      if (!startedAt) startedAt = now;
      const elapsed = now - startedAt;
      if (elapsed >= duration) {
        list.scrollTop = targetTop;
        cancelActive();
        settle();
        resolve();
        return;
      }
      const t = elapsed / duration;
      list.scrollTop = startTop + distance * easeOutQuint(t);
      handle = requestAnimationFrame(tick);
    };
    handle = requestAnimationFrame(tick);
    if (activeScrollAnims) activeScrollAnims.set(list, {
      cancel: function(){
        cancelled = true;
        if (handle && typeof cancelAnimationFrame === 'function') cancelAnimationFrame(handle);
      },
    });
  });
}

/* Glide the scrollable chat container to its current bottom using the
   velocity-based planner. Thin convenience wrapper around
   velocityScrollTo() — the heavy lifting lives there so send-time,
   keyboard-time, and stream-time scroll-to-bottom share one code
   path and one timeline.

   `opts.smooth` defaults to true; setting it to false forces an
   instant snap (used by streaming chunks where a smooth scroll per
   chunk would queue an unending animation chain). */
export function smoothScrollToBottom(list, opts){
  if(!list)return Promise.resolve();
  const target = list.scrollHeight;
  if(typeof target !== 'number' || !isFinite(target)) return Promise.resolve();
  return velocityScrollTo(list, target, opts);
}

/* Keep a reader who was pinned to the bottom of the transcript
   pinned there as the latest answer renders, attachments expand, or
   rich content (images, KaTeX, tool cards) settles in. The composer
   itself no longer needs JS measurement — flex-shrink on `.msg-list`
   makes room for whatever height the composer naturally takes (see
   P_chat-reserve in styles.css). The previous function mirrored the
   bar's height into a CSS variable; with the bar in the flex flow that
   geometry bookkeeping is gone. Resize observation remains necessary
   so a reader already at the bottom stays there when in-message
   content (images, KaTeX, tool cards) grows. The previous
   450 ms ResizeObserver RAF loop that handled *keyboard/composer*
   layout shifts has been removed — that motion now belongs to a
   single browser-native smoothScrollToBottom() call dispatched from
   keyboardViewport.js, so the CSS padding-bottom transition owns
   the visual motion and the JS no longer resets scrollTop every
   frame mid-animation. */
export function initChatComposerReserve(options){
  options=options||{};
  var list=options.list||document.getElementById("msgList");
  if(!list)return function(){};

  var contentFrame=0;
  var pinSlack=96;
  var lastMetrics=null;

  function readMetrics(){
    if(!list)return null;
    return {
      scrollHeight:list.scrollHeight,
      scrollTop:list.scrollTop,
      clientHeight:list.clientHeight
    };
  }
  function userScrolledAway(){
    return !!(window.state&&window.state._userScrolledAway);
  }
  function wasPinned(metrics){
    return !!metrics&&!userScrolledAway()&&
      metrics.scrollHeight-metrics.scrollTop-metrics.clientHeight<=pinSlack;
  }
  function rememberMetrics(){
    lastMetrics=readMetrics();
  }
  function rememberScrollPosition(){
    var current=readMetrics();
    if(!current)return;
    /* A scroll event can be dispatched after content has already resized but
       before ResizeObserver reports that resize. Keep the previous geometry
       baseline and update only scrollTop, otherwise late image/tool growth
       becomes indistinguishable from an ordinary user scroll. */
    if(lastMetrics){
      lastMetrics.scrollTop=current.scrollTop;
    }else{
      lastMetrics=current;
    }
  }

  /* Rich content can keep changing size after the stream has finished:
     images decode, KaTeX/fonts settle, diagrams mount, and tool cards
     expand. Observe the newest message and keep following only when the
     reader was already pinned before that size change. A reader who
     deliberately moved upward keeps the exact same scrollTop. The
     smooth path is delegated to smoothScrollToBottom() so the same
     motion language (and reduced-motion handling) applies. */
  function scheduleContentFollow(){
    if(contentFrame||!list)return;
    var previous=lastMetrics;
    var current=readMetrics();
    var grew=!!previous&&!!current&&current.scrollHeight>previous.scrollHeight+1;
    /* ResizeObserver fires after layout. Compare the current scrollTop with
       the PREVIOUS scrollHeight to recover whether the reader was pinned
       before the latest message grew. This also handles a scrollTop write and
       a rich-content resize occurring in the same task, before the browser
       dispatches the scroll event. */
    var beforeGrowth=previous&&list?{
      scrollHeight:previous.scrollHeight,
      scrollTop:list.scrollTop,
      clientHeight:previous.clientHeight
    }:null;
    /* Retry positioning intentionally keeps the replacement at the failed
       answer's visible offset. Its dedicated viewport anchor owns scrolling;
       snapping it to the bottom here would erase that position. */
    var retryOwnsViewport=!!(lastMessage&&
      lastMessage.getAttribute("data-viewport-anchor")==="retry");
    var shouldFollow=grew&&!retryOwnsViewport&&wasPinned(beforeGrowth);
    contentFrame=requestAnimationFrame(function(){
      contentFrame=0;
      if(shouldFollow&&!userScrolledAway()){
        /* Use the browser-native smooth-scroll pipeline. Streaming renders
           fire this multiple times per second; smoothScrollToBottom() will
           restart the underlying smooth scroll on each call, which the
           platform collapses into a single ongoing motion toward the new
           bottom. */
        smoothScrollToBottom(list,{smooth:true});
      }
      rememberMetrics();
    });
  }

  var lastMessage=null;
  var messageResizeObserver=typeof ResizeObserver==="function"&&list
    ?new ResizeObserver(scheduleContentFollow)
    :null;
  function observeLastMessage(){
    if(!list||!messageResizeObserver)return;
    var messages=list.querySelectorAll(":scope > .msg");
    var next=messages.length?messages[messages.length-1]:null;
    if(next===lastMessage)return;
    messageResizeObserver.disconnect();
    lastMessage=next;
    if(lastMessage)messageResizeObserver.observe(lastMessage);
  }

  var messageMutationObserver=typeof MutationObserver==="function"&&list
    ?new MutationObserver(function(){
      observeLastMessage();
      /* Adding/removing a message has its own positioning path in main.js and
         React. Record the new baseline here; only a later ResizeObserver
         callback for actual in-message growth should auto-follow. */
      rememberMetrics();
    })
    :null;

  lastMetrics=readMetrics();
  list.addEventListener("scroll",rememberScrollPosition,{passive:true});
  observeLastMessage();
  if(messageMutationObserver)messageMutationObserver.observe(list,{childList:true});

  return function(){
    if(contentFrame)cancelAnimationFrame(contentFrame);
    if(messageResizeObserver)messageResizeObserver.disconnect();
    if(messageMutationObserver)messageMutationObserver.disconnect();
    list.removeEventListener("scroll",rememberScrollPosition);
  };
}

/* If the chat scroller is currently pinned near the bottom, snap it
   back to the new bottom after the next layout pass. Used after the
   user changes font-size / content-width — otherwise the same
   content recomputes to a larger/smaller height and the user's
   visible window ends up somewhere in the middle of the list. */
export function scrollToBottomIfPinned(){
  var sc=scrollContainer();
  if(!sc)return;
  var slack=80; /* pixels from bottom considered "pinned" */
  var wasPinned=(sc.scrollHeight-sc.scrollTop-sc.clientHeight)<=slack;
  /* Do the scroll on the next frame so the new font-size / width has
     been applied to the layout. */
  requestAnimationFrame(function(){
    var sc2=scrollContainer();
    if(!sc2)return;
    if(wasPinned){
      sc2.scrollTop=sc2.scrollHeight;
    }else{
      /* Even if not pinned, keep the relative position stable. */
      var ratio=sc.scrollTop/Math.max(1,sc.scrollHeight-sc.clientHeight);
      sc2.scrollTop=Math.round(ratio*(sc2.scrollHeight-sc2.clientHeight));
    }
  });
}
