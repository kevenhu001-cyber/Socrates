// src/ui/scroll.js — Phase 1.4 extraction (main.js A.4)
// scrollContainer() returns whichever element is currently the
// scrollable surface (#msgList when chat/tutor active, else
// #mainContent for start screen / settings). Centralises the
// "where do I scroll" question for ~12 callers across main.js.
//
// smoothScrollToBottom() centralises the "glide to the new bottom"
// motion for send, keyboard open, and in-message content growth. It
// uses the browser-native Element.scrollTo({behavior:'smooth'}) so
// the platform owns the easing curve, duration, and interruption
// behaviour. prefers-reduced-motion degrades to 'auto'. The list is
// tagged with data-auto-scrolling while the smooth scroll runs so the
// global scroll listener in scrollPill.js does not flip
// _userScrolledAway against the programmatic motion.
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
// are handled by keyboardViewport.js via a single smoothScrollToBottom
// call — the previous 450 ms ResizeObserver-driven RAF loop was the
// source of the keyboard/send stutter (it raced the CSS padding-bottom
// transition and reset scrollTop every frame).

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

/* Glide the scrollable chat container to its current bottom using the
   browser-native smooth-scroll pipeline. Falls back to an instant
   `scrollTop` write when the platform rejects the options object
   (older WebViews), so the caller always lands at the bottom.
   `opts.smooth` defaults to true; setting it to false forces an
   instant snap (used by the streaming growth path where every chunk
   would otherwise queue its own animation).

   Side effect: sets `data-auto-scrolling="true"` on the container
   while the motion runs and clears it on completion so the global
   scroll listener (scrollPill.js) does not treat the programmatic
   motion as user scroll-away intent. */
export function smoothScrollToBottom(list, opts){
  if(!list)return;
  var o=opts||{};
  var target=list.scrollHeight;
  if(typeof target!=='number'||!isFinite(target))return;
  var behavior=o.smooth===false||prefersReducedMotion()?'auto':'smooth';
  var previous=list.dataset.autoScrolling;
  list.dataset.autoScrolling='true';
  var settle=function(){
    try {
      if(list.dataset.autoScrolling==='true'&&previous===undefined){
        delete list.dataset.autoScrolling;
      } else if(previous===undefined){
        delete list.dataset.autoScrolling;
      }
    } catch(_){/* detached node */}
  };
  try {
    var ret=list.scrollTo({top:target,left:0,behavior:behavior});
    if(ret&&typeof ret.then==='function'){
      /* Wrap settle() so the returned promise chains after the platform
         motion completes. Callers (and tests) can await settle so the
         data-auto-scrolling flag is reliably cleared by the time they
         observe the DOM. */
      var chained=ret.then(function(){settle();},function(){settle();});
      return chained;
    }
  } catch(_){
    /* options-object scrollTo unsupported: fall through to the direct
       assignment below so the caller still reaches the bottom. */
  }
  try { list.scrollTop=list.scrollHeight; } catch(_){/* readonly */}
  /* The smooth path has no completion signal here; clear the flag on
     a best-effort timer that matches the CSS motion duration (~340 ms)
     plus a small safety margin. */
  setTimeout(settle,500);
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
