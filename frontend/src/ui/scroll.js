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
  if(ml&&ml.offsetParent!==null&&ml.scrollHeight>ml.clientHeight+2){
    return ml;
  }
  return document.getElementById("mainContent");
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

/* Anchor-based scroll preservation for the streaming→finalized
   transition in finish(). The previous approach computed new
   scrollTop from scrollHeight ratios, which broke whenever the
   finalized bubble had a different height than the streamed one
   (KaTeX render, code block copy buttons, mermaid/viz mounts, etc.)
   and the user — who had been reading mid-message — got yanked to
   the top of the freshly-committed bubble, which the comments in
   main.js / MessageList.tsx already call out as the
   "perceived as a spontaneous page refresh" symptom.

   captureScrollAnchor(scroller) finds the topmost message-row whose
   top edge sits inside the scroller's viewport (or just above it,
   for messages whose top has already scrolled off) and records:
     - anchor.clientId: stable message id we can re-locate after
       legacy innerHTML swap / React commit tears the DOM down
     - anchor.viewportTop: px distance from scroller's viewport top
       to the row's top, at capture time (negative if the row has
       already scrolled above the viewport — same shape on restore)
   restoreScrollAnchor(scroller, anchor) walks the scroller after
   the next layout pass to find the row with that clientId and
   re-applies the same viewportTop offset. If the anchor is gone
   (React replaced it with a data-react-owned node, etc.) it walks
   up to the nearest ancestor with [data-client-id] and restores
   from that, so a successful restore is the rule, not the
   exception.

   Usage:
     var anchor = captureScrollAnchor(sc);
     body.innerHTML = finalHtml;        // tears the DOM down
     requestAnimationFrame(function(){
       restoreScrollAnchor(sc, anchor);
     });

   Why not save scrollTop directly? Because the row height can change
   by hundreds of pixels between the streamed and finalized render —
   scrollTop math gives you the wrong number even when the user never
   moved. Anchoring on a row keeps the user's *visible content* in
   place regardless of how much surrounding chrome grew or shrank. */

function pickTopRow(scroller){
  if(!scroller)return null;
  var rows=scroller.querySelectorAll('[data-client-id]');
  if(!rows.length)return null;
  var scRect=scroller.getBoundingClientRect();
  var viewportTop=scRect.top;
  var best=null;
  var bestTop=-Infinity;
  for(var i=0;i<rows.length;i++){
    var row=rows[i];
    if(row.parentNode!==scroller)continue;
    var rowRect=row.getBoundingClientRect();
    if(rowRect.top>viewportTop+1)continue;
    if(rowRect.top>bestTop){
      bestTop=rowRect.top;
      best=row;
    }
  }
  return best;
}

export function captureScrollAnchor(scroller){
  var row=pickTopRow(scroller);
  if(!row)return null;
  var scRect=scroller.getBoundingClientRect();
  var rowRect=row.getBoundingClientRect();
  return {
    clientId:row.getAttribute("data-client-id"),
    viewportTop:rowRect.top-scRect.top
  };
}

function resolveAnchorRow(scroller, anchor){
  if(!scroller||!anchor||!anchor.clientId)return null;
  var sel='[data-client-id="'+anchor.clientId+'"]';
  var cands=scroller.querySelectorAll(sel);
  for(var i=0;i<cands.length;i++){
    if(cands[i].parentNode===scroller)return cands[i];
  }
  return cands[0]||null;
}

export function restoreScrollAnchor(scroller, anchor){
  if(!scroller||!anchor)return false;
  var row=resolveAnchorRow(scroller,anchor);
  if(!row)return false;
  var scRect=scroller.getBoundingClientRect();
  var rowRect=row.getBoundingClientRect();
  var desiredTop=anchor.viewportTop;
  var currentTop=rowRect.top-scRect.top;
  var delta=currentTop-desiredTop;
  if(Math.abs(delta)<0.5)return true;
  scroller.scrollTop=Math.max(0,scroller.scrollTop+delta);
  return true;
}

/* Returns a stop() function. Used after finish() to keep the reader
   glued to the same message while mermaid/viz/widget iframes mount
   asynchronously and grow scrollHeight underneath them.

   P_no-finish-jump — the previous implementation restored for only
   3 frames and then relied on a ResizeObserver attached to the
   scroller element. ResizeObserver only fires when the observed
   element's OWN box changes — children mounting inside it and
   growing scrollHeight never trigger it — so every async mount that
   landed after frame 3 (mermaid render, viz iframe height report,
   image decode, scaffold-widget setTimeout(0) mounts) shifted the
   reader with no correction: perceived as "the page refreshed and
   jumped back to the start of the answer". Restore on every frame
   for the whole window instead; restoreScrollAnchor is a no-op
   (<0.5px delta) when nothing moved, so the loop costs two rect
   reads per idle frame. Any direct user input cancels immediately
   so the anchor never fights an intentional scroll. */
export function watchAnchor(scroller, anchor, opts){
  opts=opts||{};
  var timeoutMs=opts.timeoutMs!=null?opts.timeoutMs:2500;
  if(!scroller||!anchor)return function(){};
  var timer=null;
  var stopped=false;
  function stop(){
    if(stopped)return;
    stopped=true;
    if(timer){clearTimeout(timer);timer=null}
    scroller.removeEventListener("wheel",stop);
    scroller.removeEventListener("touchstart",stop);
    scroller.removeEventListener("pointerdown",stop);
    scroller.removeEventListener("keydown",stop);
  }
  scroller.addEventListener("wheel",stop,{passive:true});
  scroller.addEventListener("touchstart",stop,{passive:true});
  scroller.addEventListener("pointerdown",stop,{passive:true});
  scroller.addEventListener("keydown",stop);
  var tick=function(){
    if(stopped)return;
    restoreScrollAnchor(scroller,anchor);
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
  timer=setTimeout(stop,timeoutMs);
  return stop;
}

/* P_no-finish-jump — bottom-pinned counterpart of watchAnchor. Used
   after the streaming→finalized handoff for readers who were pinned
   at the bottom: the React copy commits before its async content
   (mermaid/viz iframes, images, scaffold widgets) has real heights,
   so a single scrollTop=scrollHeight snap measures a shorter list
   and the reader surfaces mid-answer (or at its very start) once
   the mounts land. Re-snap every frame until layout settles; cancel
   the moment the user scrolls so the pin never fights them. */
export function watchBottomPin(scroller, opts){
  opts=opts||{};
  var timeoutMs=opts.timeoutMs!=null?opts.timeoutMs:2500;
  if(!scroller)return function(){};
  var timer=null;
  var stopped=false;
  function stop(){
    if(stopped)return;
    stopped=true;
    if(timer){clearTimeout(timer);timer=null}
    scroller.removeEventListener("wheel",stop);
    scroller.removeEventListener("touchstart",stop);
    scroller.removeEventListener("pointerdown",stop);
    scroller.removeEventListener("keydown",stop);
  }
  scroller.addEventListener("wheel",stop,{passive:true});
  scroller.addEventListener("touchstart",stop,{passive:true});
  scroller.addEventListener("pointerdown",stop,{passive:true});
  scroller.addEventListener("keydown",stop);
  var tick=function(){
    if(stopped)return;
    var gap=scroller.scrollHeight-scroller.scrollTop-scroller.clientHeight;
    if(gap>1)scroller.scrollTop=scroller.scrollHeight;
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
  timer=setTimeout(stop,timeoutMs);
  return stop;
}