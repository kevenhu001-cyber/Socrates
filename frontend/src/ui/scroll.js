// src/ui/scroll.js — Phase 1.4 extraction (main.js A.4)
// scrollContainer() returns whichever element is currently the
// scrollable surface (#msgList when chat/tutor active, else
// #mainContent for start screen / settings). Centralises the
// "where do I scroll" question for ~12 callers across main.js.
//
// scrollToBottomIfPinned() snaps back to bottom (or preserves the
// relative scroll position) after a font-size / width change so
// the user's visible window doesn't end up mid-list.

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

/* Keep the transcript's bottom safe area equal to the composer that is
   actually on screen. The composer changes height when the mobile editor
   expands, attachments are added, or text wraps; a fixed CSS padding leaves
   the last lines underneath the absolutely positioned input bar. */
export function initChatComposerReserve(options){
  options=options||{};
  var bar=options.bar||document.getElementById("chatInputBar");
  var host=options.host||document.getElementById("chatView");
  var list=options.list||document.getElementById("msgList");
  if(!bar||!host)return function(){};

  var frame=0;
  var contentFrame=0;
  var lastHeight=0;
  var lastReserve=0;
  var visibleMeasurementReady=false;
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
    if(list){
      lastReserve=parseFloat(getComputedStyle(list).paddingBottom)||0;
    }
  }
  function followAfterLayout(shouldFollow){
    if(!list){return}
    requestAnimationFrame(function(){
      if(shouldFollow&&!userScrolledAway()){
        list.scrollTop=list.scrollHeight;
      }
      rememberMetrics();
    });
  }
  function measure(){
    frame=0;
    var height=Math.ceil(bar.getBoundingClientRect().height);
    var reserve=list?(parseFloat(getComputedStyle(list).paddingBottom)||0):height;
    var heightChanged=height!==lastHeight;
    var reserveChanged=Math.abs(reserve-lastReserve)>=1;
    if(height<=0||(!heightChanged&&!reserveChanged))return;
    /* ResizeObserver runs before the new reserve is written. Capture whether
       the reader was at the old bottom, then restore that intent after the
       padding changes. Otherwise a multiline composer or attachment strip
       grows upward over the last answer while scrollTop stays unchanged. */
    var beforeReserve=reserveChanged&&lastMetrics&&list?{
      scrollHeight:lastMetrics.scrollHeight,
      scrollTop:list.scrollTop,
      clientHeight:lastMetrics.clientHeight
    }:readMetrics();
    /* The controller is initialized while #chatView is hidden. Its first
       non-zero measurement establishes CSS geometry only; treating that as a
       later composer resize can race with turn/retry positioning and move a
       freshly rendered anchor after it became visible. */
    var shouldFollow=visibleMeasurementReady&&wasPinned(beforeReserve);
    visibleMeasurementReady=true;
    lastHeight=height;
    lastReserve=reserve;
    host.style.setProperty("--chat-input-bar-height",height+"px");
    followAfterLayout(shouldFollow);
  }
  function schedule(){
    if(frame)return;
    frame=requestAnimationFrame(measure);
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

  var observer=typeof ResizeObserver==="function"
    ?new ResizeObserver(schedule)
    :null;
  if(observer){
    /* Border-box catches padding/safe-area changes as well as composer
       content growth. Older ResizeObserver implementations accept only the
       one-argument form, so retain a fallback. */
    try{observer.observe(bar,{box:"border-box"})}catch(_){observer.observe(bar)}
    /* The keyboard inset changes the transcript padding without necessarily
       changing the composer's own height. Observing the list's content box
       makes those reserve changes participate in the same pinned-reader
       correction. */
    if(list)observer.observe(list);
  }
  if(list){
    lastMetrics=readMetrics();
    list.addEventListener("scroll",rememberMetrics,{passive:true});
    observeLastMessage();
    if(messageMutationObserver)messageMutationObserver.observe(list,{childList:true});
  }
  window.addEventListener("resize",schedule,{passive:true});
  if(window.visualViewport){
    window.visualViewport.addEventListener("resize",schedule,{passive:true});
  }
  schedule();

  return function(){
    if(frame)cancelAnimationFrame(frame);
    if(contentFrame)cancelAnimationFrame(contentFrame);
    if(observer)observer.disconnect();
    if(messageResizeObserver)messageResizeObserver.disconnect();
    if(messageMutationObserver)messageMutationObserver.disconnect();
    if(list)list.removeEventListener("scroll",rememberMetrics);
    window.removeEventListener("resize",schedule);
    if(window.visualViewport)window.visualViewport.removeEventListener("resize",schedule);
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
