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
  /* During chat/tutor, #msgList is the designated scroll surface
     (overflow-y:auto). The old scrollHeight>clientHeight+2 guard
     caused issues during initial streaming when content hadn't yet
     overflowed — it returned #mainContent (overflow:hidden) which
     silently dropped all scroll operations. As long as msgList
     exists and is connected to the document, it is the right target. */
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
  var pinFrame=0;
  var lastHeight=0;
  function measure(){
    frame=0;
    var height=Math.ceil(bar.getBoundingClientRect().height);
    if(height<=0||height===lastHeight)return;

    /* Measure pin state before changing the CSS reserve. Expanding the
       mobile composer or adding attachment chips increases padding-bottom;
       without restoring the bottom anchor, the latest reply is immediately
       pushed underneath the composer and the scroll listener marks the user
       as having moved away. */
    var wasPinned=!!list&&
      (!window.state||!window.state._userScrolledAway)&&
      list.scrollHeight-list.scrollTop-list.clientHeight<=96;

    lastHeight=height;
    host.style.setProperty("--chat-input-bar-height",height+"px");

    if(wasPinned&&list){
      if(pinFrame)cancelAnimationFrame(pinFrame);
      pinFrame=requestAnimationFrame(function(){
        pinFrame=0;
        if(!window.state||!window.state._userScrolledAway){
          list.scrollTop=list.scrollHeight;
        }
      });
    }
  }
  function schedule(){
    if(frame)return;
    frame=requestAnimationFrame(measure);
  }

  var observer=typeof ResizeObserver==="function"
    ?new ResizeObserver(schedule)
    :null;
  if(observer)observer.observe(bar);
  window.addEventListener("resize",schedule,{passive:true});
  if(window.visualViewport){
    window.visualViewport.addEventListener("resize",schedule,{passive:true});
  }
  schedule();

  return function(){
    if(frame)cancelAnimationFrame(frame);
    if(pinFrame)cancelAnimationFrame(pinFrame);
    if(observer)observer.disconnect();
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
