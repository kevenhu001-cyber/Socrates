// src/ui/scroll.js — Phase 1.4 extraction (main.js A.4)
// scrollContainer() returns whichever element is currently the
// scrollable surface (#msgList when chat/tutor active, else
// #mainContent for start screen / settings). Centralises the
// "where do I scroll" question for ~12 callers across main.js.
//
// scrollToBottomIfPinned() snaps back to bottom (or preserves the
// relative scroll position) after a font-size / width change so
// the user's visible window doesn't end up mid-list.
//
// initChatComposerReserve() keeps its legacy public name, but no longer
// measures the composer into a CSS padding variable. The composer now
// participates in the chat flex layout, while this controller only
// preserves bottom-follow intent as the composer or rich content grows.

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

/* Keep a reader who was pinned to the bottom of the transcript
   pinned there as the latest answer renders, attachments expand, or
   rich content (images, KaTeX, tool cards) settles in. The composer
   itself no longer needs JS measurement — flex-shrink on `.msg-list`
   makes room for whatever height the composer naturally takes (see
   P_chat-reserve in styles.css). The previous function mirrored the bar's
   height into a CSS variable; with the bar in the flex flow that geometry
   bookkeeping is gone. Resize observation remains necessary so a reader
   already at the bottom stays there when the list's flex height changes. */
export function initChatComposerReserve(options){
  options=options||{};
  var list=options.list||document.getElementById("msgList");
  if(!list)return function(){};

  var contentFrame=0;
  var layoutFrame=0;
  var layoutReady=false;
  var layoutFollowUntil=0;
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

  function followLayoutUntilSettled(){
    layoutFrame=0;
    if(userScrolledAway()||Date.now()>=layoutFollowUntil){
      rememberMetrics();
      return;
    }
    list.scrollTop=list.scrollHeight;
    rememberMetrics();
    layoutFrame=requestAnimationFrame(followLayoutUntilSettled);
  }
  function scheduleLayoutFollow(){
    var previous=lastMetrics;
    var current=readMetrics();
    if(!current||current.clientHeight<=0)return;
    if(!layoutReady){
      layoutReady=true;
      lastMetrics=current;
      return;
    }
    var resized=!!previous&&current.clientHeight!==previous.clientHeight;
    var shouldFollow=resized&&wasPinned(previous);
    if(!shouldFollow)return;
    /* Composer and keyboard changes animate for up to ~280ms. A single
       ResizeObserver callback can land between two transition frames and
       leave a small stale gap at the end, so follow through a short settle
       window. Explicit upward input flips _userScrolledAway and stops the
       loop immediately. Repeated viewport changes extend the deadline. */
    layoutFollowUntil=Date.now()+450;
    if(!layoutFrame)layoutFrame=requestAnimationFrame(followLayoutUntilSettled);
  }

  /* Rich content can keep changing size after the stream has finished:
     images decode, KaTeX/fonts settle, diagrams mount, and tool cards expand.
     Observe the newest message and keep following only when the reader was
     already pinned before that size change. A reader who deliberately moved
     upward keeps the exact same scrollTop. */
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
        list.scrollTop=list.scrollHeight;
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

  var layoutResizeObserver=typeof ResizeObserver==="function"
    ?new ResizeObserver(scheduleLayoutFollow)
    :null;

  lastMetrics=readMetrics();
  layoutReady=!!(lastMetrics&&lastMetrics.clientHeight>0);
  list.addEventListener("scroll",rememberScrollPosition,{passive:true});
  observeLastMessage();
  if(messageMutationObserver)messageMutationObserver.observe(list,{childList:true});
  if(layoutResizeObserver)layoutResizeObserver.observe(list);

  return function(){
    if(contentFrame)cancelAnimationFrame(contentFrame);
    if(layoutFrame)cancelAnimationFrame(layoutFrame);
    if(layoutResizeObserver)layoutResizeObserver.disconnect();
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
