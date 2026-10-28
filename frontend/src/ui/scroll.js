import { planMotionForUser, easeOutHouse } from './motion.js';
import { isPinnedToBottom, shouldAutoScroll, SCROLL_SLACK } from './scrollDecision.ts';
import { beginScrollOwner, endScrollOwner, writeScrollTop } from './scrollCoordinator.ts';
import { stateStore } from '../state/store.js';

/* Re-export the pure auto-scroll decision predicates through scroll.js so
   the DOM-wiring callers (main.js) import the "where do I scroll" surface
   and the "should I scroll" decision from one place. The predicates stay
   pure in scrollDecision.ts (unit/property tested there); scroll.js and
   main.js only apply them to live DOM geometry. */
export { isPinnedToBottom, shouldAutoScroll, SCROLL_SLACK };

// src/ui/scroll.js — Phase 1.4 extraction (main.js A.4)
// scrollContainer() returns whichever element is currently the
// scrollable surface (#msgList when chat/tutor active, else
// #mainContent for start screen / settings). Centralises the
// "where do I scroll" question for ~12 callers across main.js.
//
// velocityScrollTo() is the lower-level primitive: it scrolls an
// arbitrary target in `distance` px using the velocity-based duration
// planner in ui/motion.js. smoothScrollToBottom() is layered on top of
// velocityScrollTo() so the data-auto-scrolling flag and cancellation
// semantics are written once. Keyboard geometry itself is handled by
// ui/keyboard/index.ts; this module only re-anchors a pinned transcript
// after the browser applies that geometry.
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
// are measured by ui/keyboard/index.ts and re-anchor the transcript after
// the flex layout settles.

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

/* Cancel any velocityScrollTo animation currently running on `list`.
   Shared by velocityScrollTo itself (a newer motion supersedes an older
   one) and by the composer-geometry pin watch, which needs to stop a
   stale content-follow motion before snapping the reader to a new
   bottom. */
function cancelScrollAnimationFor(list){
  if(!list||!activeScrollAnims||!activeScrollAnims.has(list))return;
  try{activeScrollAnims.get(list).cancel();}catch(_){/* detached node */}
  activeScrollAnims.delete(list);
}

/* Public cancellation hook: the send path (chat/turnAnchor.ts) takes the
   transcript over the moment a turn is submitted, so any content-follow or
   bottom glide still in flight must stop before the send glide starts. */
export function cancelScrollAnimation(list){
  cancelScrollAnimationFor(list);
}

/* `easeOutQuint` lives in ui/motion.js alongside the velocity planner
   so the per-frame interpolation matches the curve used by scroll
   consumers. */

/* Glide the chat container from its current `scrollTop` to
   `targetTop` using the velocity-based duration planner from
   ui/motion.js. Honours prefers-reduced-motion (snaps) and
   `opts.smooth:false` (snaps). Returns a Promise that resolves when
   the animation settles, or immediately when snapping.

   The planner guarantees a constant perceived velocity regardless of
   the distance. Keyboard inset geometry is deliberately not animated by
   this function; ui/keyboard applies the measured CSS inset directly
   and only asks this function to restore a pinned transcript after layout.

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
  const options=opts||{};
  const active=activeBottomFollowAnimation(list,options);
  return active||startScroll(list,targetTop,options);
}

function activeBottomFollowAnimation(list,options){
  const active=activeScrollAnims&&activeScrollAnims.get(list);
  return options.retarget===true&&active&&active.retargetKey==='bottom-follow'
    ?active.promise:null;
}

function startScroll(list,targetTop,options){
  const owner=options.owner||'content';
  const startTop=list.scrollTop;
  /* `opts.target` — a live target. Re-read every frame (and clamped to the
     reachable range) so a layout that settles mid-glide (a React commit, a
     reserve repaint, a late image) bends the motion toward the real
     destination instead of landing on a stale one and snapping. */
  const liveTarget=typeof options.target==='function'?options.target:null;
  const resolveTarget = targetResolver(list, targetTop, liveTarget);
  const initialTarget = resolveTarget();
  const distance = initialTarget - startTop;
  if (!isFinite(distance) || distance === 0) return Promise.resolve();
  const ownerToken = beginScrollOwner(list, owner);
  if (ownerToken == null) return Promise.resolve();
  const absDistance = Math.abs(distance);
  const reduced = prefersReducedMotion();
  /* `opts.plan` — a caller-planned motion ({duration, ease, snap}), e.g.
     ui/motion.js planSendGlide. Without it the velocity planner decides. */
  const injectedPlan=options.plan&&typeof options.plan==='object'?options.plan:null;
  const snap=shouldSnapScroll(options,reduced,absDistance,injectedPlan);
  if (snap) {
    snapScrollToTarget(list, liveTarget ? resolveTarget() : targetTop, owner, ownerToken);
    return Promise.resolve();
  }
  return animateScroll(list, {
    owner, ownerToken, startTop, targetTop, distance, liveTarget, resolveTarget,
    options, plan: injectedPlan,
  });
}

function targetResolver(list, targetTop, liveTarget){
  if (!liveTarget) return function(){ return targetTop; };
  return function(){
    let next=Number(liveTarget());
    if(!isFinite(next))next=Number(targetTop);
    if(!isFinite(next))next=list.scrollTop;
    const max=Math.max(0,(list.scrollHeight||0)-(list.clientHeight||0));
    return Math.max(0,Math.min(max,next));
  };
}

function shouldSnapScroll(options, reduced, distance, injectedPlan){
  return reduced||options.smooth===false||distance<=24||
    typeof requestAnimationFrame!=='function'||
    !!(injectedPlan&&(injectedPlan.snap||!(injectedPlan.duration>0)));
}

function beginAutoScrollState(list){
  const previous=list.dataset.autoScrolling;
  list.dataset.autoScrolling='true';
  return function(){
    try{
      if(previous===undefined)delete list.dataset.autoScrolling;
      else list.dataset.autoScrolling=previous;
    }catch(_){ /* detached node */ }
  };
}

function snapScrollToTarget(list, targetTop, owner, ownerToken){
  cancelScrollAnimationFor(list);
  const settle=beginAutoScrollState(list);
  writeScrollTop(list,targetTop,owner);
  settle();
  endScrollOwner(list,ownerToken);
}

function animateScroll(list, config){
  const { owner, ownerToken, startTop, targetTop, distance, liveTarget, resolveTarget, options, plan: injectedPlan }=config;
  const plan=injectedPlan||planMotionForUser(Math.abs(distance),options.motion);
  const duration=plan.duration;
  const ease=typeof plan.ease==='function'?plan.ease:easeOutHouse;
  cancelScrollAnimationFor(list);
  const settle=beginAutoScrollState(list);
  let resolvePromise;
  const promise=new Promise(function(resolve){resolvePromise=resolve;});
  const animation={
    list,owner,ownerToken,startTop,targetTop,distance,liveTarget,resolveTarget,
    duration,ease,settle,promise,resolvePromise,
    direction:distance>0?1:-1,
    startedAt:0,handle:0,cancelled:false,lastWrittenTop:startTop,
    stop:null,onScroll:null,
  };
  animation.stop=function(){stopScrollAnimation(animation);};
  animation.onScroll=function(){cancelOnForeignScroll(animation);};
  list.addEventListener('scroll',animation.onScroll,{passive:true});
  if(activeScrollAnims)activeScrollAnims.set(list,{
    cancel:animation.stop,
    retargetKey:options.retarget===true?'bottom-follow':null,
    promise,
  });
  animation.handle=requestAnimationFrame((now)=>advanceScrollAnimation(animation,now));
  return promise;
}

function cancelOnForeignScroll(animation){
  if(animation.cancelled)return;
  if(Math.abs(animation.list.scrollTop-animation.lastWrittenTop)>1)animation.stop();
}

function stopScrollAnimation(animation){
  if(animation.cancelled)return;
  animation.cancelled=true;
  if(animation.handle)cancelAnimationFrame(animation.handle);
  animation.list.removeEventListener('scroll',animation.onScroll);
  if(activeScrollAnims)activeScrollAnims.delete(animation.list);
  endScrollOwner(animation.list,animation.ownerToken);
  animation.settle();
  animation.resolvePromise();
}

function advanceScrollAnimation(animation,now){
  if(animation.cancelled)return;
  const {list}=animation;
  if((list.dataset&&list.dataset.turnViewportOwner==='turn')||
      (typeof window!=='undefined'&&window.stateStore.read('_userScrolledAway'))){
    animation.stop();
    return;
  }
  if(!animation.startedAt)animation.startedAt=now;
  const elapsed=now-animation.startedAt;
  if(elapsed>=animation.duration){
    writeScrollTop(list,animation.liveTarget?animation.resolveTarget():animation.targetTop,animation.owner);
    animation.stop();
    return;
  }
  const next=nextScrollPosition(animation,elapsed/animation.duration);
  writeScrollTop(list,next,animation.owner);
  animation.lastWrittenTop=list.scrollTop;
  animation.handle=requestAnimationFrame((frameTime)=>advanceScrollAnimation(animation,frameTime));
}

function nextScrollPosition(animation,progress){
  const {startTop,distance,ease,liveTarget,resolveTarget,direction,lastWrittenTop}=animation;
  if(!liveTarget)return startTop+distance*ease(progress);
  const target=resolveTarget();
  let next=startTop+(target-startTop)*ease(progress);
  if(direction>0){
    next=Math.max(next,lastWrittenTop);
    if(next>target)next=target;
  }else{
    next=Math.min(next,lastWrittenTop);
    if(next<target)next=target;
  }
  return next;
}

function measureContentGrowth(previous,current,list){
  var sameMessage=!!(previous&&current&&previous.msg&&
    previous.msg===current.msg&&
    previous.msgHeight!=null&&current.msgHeight!=null);
  var growth=sameMessage?current.msgHeight-previous.msgHeight:null;
  var grew=!!current&&(growth!=null
    ?growth>1
    :(!!previous&&current.scrollHeight>previous.scrollHeight+1));
  var beforeGrowth=previous&&list?{
    scrollHeight:growth!=null?current.scrollHeight-growth:previous.scrollHeight,
    scrollTop:list.scrollTop,
    clientHeight:previous.clientHeight
  }:null;
  return {grew:grew,beforeGrowth:beforeGrowth};
}

function contentFollowIsBlocked(list,lastMessage){
  var retryOwnsViewport=!!(lastMessage&&
    lastMessage.getAttribute("data-viewport-anchor")==="retry");
  var turnAnchorSettling=!!(list&&list.dataset&&list.dataset.turnAnchorSettling==="true");
  var turnAnchorHold=!!(list&&list.dataset&&list.dataset.turnAnchorHold==="true");
  return retryOwnsViewport||turnAnchorSettling||turnAnchorHold;
}

function createMessageObservers(list,hooks){
  var resizeObserver=typeof ResizeObserver==="function"
    ?new ResizeObserver(function(){hooks.scheduleContentFollow();})
    :null;
  var subtreeObserver=typeof MutationObserver==="function"
    ?new MutationObserver(function(){
      var baseline=hooks.getContentBaseline();
      if(hooks.getContentFrame())return;
      hooks.setContentFrame(requestAnimationFrame(function(){
        requestAnimationFrame(function(){
          hooks.setContentFrame(0);
          hooks.scheduleContentFollow(baseline);
        });
      }));
    })
    :null;

  function observeLastMessage(){
    if(!list||!resizeObserver)return;
    var messages=list.querySelectorAll(":scope > .msg");
    var next=messages.length?messages[messages.length-1]:null;
    if(next===hooks.getLastMessage())return;
    resizeObserver.disconnect();
    hooks.setLastMessage(next);
    /* Appending or replacing a row is not in-message content growth. */
    hooks.setContentMetrics(hooks.readMetrics());
    if(next)resizeObserver.observe(next);
    if(subtreeObserver){
      subtreeObserver.disconnect();
      if(next)subtreeObserver.observe(next,{subtree:true,childList:true});
    }
  }

  var mutationObserver=typeof MutationObserver==="function"
    ?new MutationObserver(function(){
      observeLastMessage();
      hooks.rememberMetrics();
    })
    :null;

  function observe(){
    observeLastMessage();
    if(mutationObserver)mutationObserver.observe(list,{childList:true});
  }

  function disconnect(){
    if(resizeObserver)resizeObserver.disconnect();
    if(subtreeObserver)subtreeObserver.disconnect();
    if(mutationObserver)mutationObserver.disconnect();
  }

  return {observe:observe,disconnect:disconnect};
}

/* Glide the scrollable chat container to its current bottom using the
   velocity-based planner. Thin convenience wrapper around
   velocityScrollTo() — the heavy lifting lives there so send-time,
   keyboard-time, and stream-time scroll-to-bottom share one code
   path and consistent cancellation semantics.

   `opts.smooth` defaults to true; setting it to false forces an
   instant snap. Set `retarget: true` for repeated bottom updates so
   one live animation follows the moving scroll boundary. */
export function smoothScrollToBottom(list, opts){
  if(!list)return Promise.resolve();
  const o=opts||{};
  const retarget=o.retarget===true;
  const target=retarget
    ?Math.max(0,list.scrollHeight-list.clientHeight)
    :list.scrollHeight;
  if(typeof target !== 'number' || !isFinite(target)) return Promise.resolve();
  return velocityScrollTo(list,target,retarget?{
    ...o,
    target:function(){return Math.max(0,(list.scrollHeight||0)-(list.clientHeight||0))}
  }:o);
}

function createComposerResizeHandler(list,pinState,hooks,pinSlack){
  return function(){
    var current=hooks.readMetrics();
    var heightBeforeResize=pinState.observedViewportHeight;
    if(current)pinState.observedViewportHeight=current.clientHeight;
    if(hooks.keyboardTransitionActive()||!list||hooks.userScrolledAway())return;

    var pinnedBeforeResize=pinState.lastPinned;
    if(!pinnedBeforeResize&&current){
      var previous=pinState.lastMetrics;
      var heightBefore=heightBeforeResize!=null?heightBeforeResize:
        (previous?previous.clientHeight:null);
      if(heightBefore!=null){
        pinnedBeforeResize=current.scrollHeight-current.scrollTop-heightBefore<=pinSlack;
      }
    }
    if(!pinnedBeforeResize){hooks.rememberMetrics();return;}
    if(list.__socratesTurnViewportOwner===true)return;
    smoothScrollToBottom(list,{smooth:false});
    hooks.rememberMetrics();
    hooks.armComposerFollow();
  };
}

function observeComposerLayout(list,chatView,followResize,keyboardTransitionActive,armComposerFollow){
  var resizeObserver=typeof ResizeObserver==="function"&&chatView
    ?new ResizeObserver(followResize):null;
  if(resizeObserver){
    try{resizeObserver.observe(chatView,{box:"border-box"});}
    catch(_){resizeObserver.observe(chatView);}
    try{resizeObserver.observe(list,{box:"border-box"});}
    catch(_){resizeObserver.observe(list);}
  }

  var keyboardStyleFollowFrame=0;
  var styleObserver=typeof MutationObserver==="function"&&document.documentElement
    ?new MutationObserver(function(){
      var root=document.documentElement;
      var inset=parseFloat(root.style.getPropertyValue("--keyboard-inset"))||0;
      if(inset<=0||root.dataset.keyboardOpen==="true"||keyboardTransitionActive()||keyboardStyleFollowFrame)return;
      keyboardStyleFollowFrame=requestAnimationFrame(function(){
        keyboardStyleFollowFrame=0;
        followResize();
      });
    })
    :null;
  if(styleObserver)styleObserver.observe(document.documentElement,{attributes:true,attributeFilter:["style"]});

  function onTransition(event){
    if(keyboardTransitionActive())return;
    var target=event&&event.target;
    if(target&&target.closest&&target.closest(".composer-input-wrap"))armComposerFollow();
  }
  if(chatView){
    chatView.addEventListener("transitionrun",onTransition);
    chatView.addEventListener("transitionstart",onTransition);
  }

  function disconnect(){
    if(resizeObserver)resizeObserver.disconnect();
    if(keyboardStyleFollowFrame)cancelAnimationFrame(keyboardStyleFollowFrame);
    if(styleObserver)styleObserver.disconnect();
    if(chatView){
      chatView.removeEventListener("transitionrun",onTransition);
      chatView.removeEventListener("transitionstart",onTransition);
    }
  }
  return {disconnect:disconnect};
}

function createPinMetrics(list,pinState,getLastMessage,pinSlack){
  function readMetrics(){
    if(!list)return null;
    var message=getLastMessage();
    return {
      scrollHeight:list.scrollHeight,
      scrollTop:list.scrollTop,
      clientHeight:list.clientHeight,
      msg:message,
      msgHeight:message?message.offsetHeight:null
    };
  }
  function userScrolledAway(){return !!window.stateStore.read("_userScrolledAway")}
  function wasPinned(metrics){
    return !!metrics&&!userScrolledAway()&&
      metrics.scrollHeight-metrics.scrollTop-metrics.clientHeight<=pinSlack;
  }
  function rememberMetrics(){
    var current=readMetrics();
    if(!current)return;
    var previous=pinState.lastMetrics;
    var geometryOnly=pinState.lastPinned&&previous&&
      current.scrollHeight===previous.scrollHeight&&
      current.clientHeight!==previous.clientHeight&&
      Math.abs(current.scrollTop-previous.scrollTop)<=1;
    pinState.lastMetrics=current;
    if(!geometryOnly)pinState.lastPinned=wasPinned(current);
  }
  function rememberScrollPosition(){
    var current=readMetrics();
    if(!current)return;
    var previous=pinState.lastMetrics;
    var previousTop=previous?previous.scrollTop:current.scrollTop;
    var previousHeight=previous&&previous.clientHeight;
    if(previousHeight!=null&&current.clientHeight<previousHeight-1&&current.scrollTop>=previousTop-1)return;
    pinState.lastMetrics=current;
    pinState.lastPinned=wasPinned(current);
  }
  return {readMetrics,userScrolledAway,wasPinned,rememberMetrics,rememberScrollPosition};
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
   ui/keyboard/index.ts, so the browser's layout update owns
   the visual motion and the JS no longer resets scrollTop every
   frame mid-animation. The bounded composer-follow sequence below only
     runs while a focus/composer transition is active. */
export function initChatComposerReserve(options){
  options=options||{};
  var list=options.list||document.getElementById("msgList");
  if(!list)return () => undefined;

  var contentFrame=0;
  var pinSlack=96;
  var pinState={lastMetrics:null,lastPinned:false,observedViewportHeight:null};
  var lastMessage=null;
  var pinMetrics=createPinMetrics(list,pinState,function(){return lastMessage},pinSlack);
  var readMetrics=pinMetrics.readMetrics;
  var userScrolledAway=pinMetrics.userScrolledAway;
  var wasPinned=pinMetrics.wasPinned;
  var rememberMetrics=pinMetrics.rememberMetrics;
  var rememberScrollPosition=pinMetrics.rememberScrollPosition;
  /* Scroll events may arrive after layout growth but before its observer.
     They must not consume the previous message-height measurement. */
  var contentMetrics=null;
  var composerFollowFrame=0;
  var composerFollowUntil=0;
  /* The transcript viewport height as the ResizeObserver last saw it. Only
     this observer writes the value. The shared metrics snapshot
     is refreshed by the content-follow path and by the scroll listener, so by
     the time a composer resize is delivered it can already describe the
     shrunken viewport — and the pin recovery below would read "the reader
     sits 188px above the bottom" and refuse to re-pin a reader who never left
     the bottom. */
  /* A CSS focus transition can resize the flex viewport between two
     ResizeObserver deliveries. Keep the bottom anchor alive only for the
     short, observable composer transition; this is a bounded rAF sequence,
     not a permanent measurement loop or a height reserve. Any wheel/touch
     intent flips _userScrolledAway and stops it on the next frame. */
  function stopComposerFollow(){
    if(composerFollowFrame){cancelAnimationFrame(composerFollowFrame);composerFollowFrame=0;}
    composerFollowUntil=0;
  }
  function keyboardTransitionActive(){
    var phase=document.documentElement&&document.documentElement.dataset
      ?document.documentElement.dataset.keyboardPhase
      :'';
    return phase==='opening'||phase==='closing';
  }
  function runComposerFollow(){
    composerFollowFrame=0;
    if(keyboardTransitionActive()){
      stopComposerFollow();
      return;
    }
    if(!list||userScrolledAway()||!pinState.lastPinned||
       (list.querySelector&&list.querySelector(".turn-viewport-anchor"))){
      stopComposerFollow();
      return;
    }
    smoothScrollToBottom(list,{smooth:false});
    rememberMetrics();
    if(Date.now()<composerFollowUntil){
      composerFollowFrame=requestAnimationFrame(runComposerFollow);
    }else{
      composerFollowUntil=0;
    }
  }
  function armComposerFollow(){
    if(!list||userScrolledAway()||!pinState.lastPinned)return;
    composerFollowUntil=Date.now()+420;
    if(!composerFollowFrame)composerFollowFrame=requestAnimationFrame(runComposerFollow);
  }

  /* Composer geometry is now owned by flex layout and ui/keyboard.
     Observe the resulting chat-column resize once per layout notification;
     this keeps a reader who was already at the bottom at the new bottom on
     desktop focus expansion, while never moving a reader who scrolled away.
     There is intentionally no interval or CSS-variable height measurement;
     the short transition-bound follow sequence only writes scrollTop while
     the composer is visibly changing size. */
  var chatView=typeof document!=="undefined"
    ?document.querySelector("#chatView, .chat-view")
    :null;
  var followComposerResize=createComposerResizeHandler(list,pinState,{
    readMetrics:readMetrics,
    keyboardTransitionActive:keyboardTransitionActive,
    userScrolledAway:userScrolledAway,
    rememberMetrics:rememberMetrics,
    armComposerFollow:armComposerFollow
  },pinSlack);
  var composerLayout=observeComposerLayout(
    list,chatView,followComposerResize,keyboardTransitionActive,armComposerFollow
  );

  /* Rich content can keep changing size after the stream has finished:
     images decode, KaTeX/fonts settle, diagrams mount, and tool cards
     expand. Observe the newest message and keep following only when the
     reader was already pinned before that size change. A reader who
     deliberately moved upward keeps the exact same scrollTop. The
     smooth path is delegated to smoothScrollToBottom() so the same
     motion language (and reduced-motion handling) applies. */
  function scheduleContentFollow(baselineOverride){
    if(contentFrame||!list)return;
    /* The mutation fallback passes the baseline captured BEFORE the DOM
       change; neither path uses a baseline advanced by scroll events. */
    var previous=baselineOverride||contentMetrics||pinState.lastMetrics;
    contentFrame=requestAnimationFrame(function(){
      contentFrame=0;
      /* Read at execution, not notification: more growth may be coalesced into
         this frame, including the final resize of a streamed answer. */
      var current=readMetrics();
      /* The list-level baseline can hold a transient mid-commit height that
         settled with no observer replay (batched React commits, the
         scrollbar-gutter reflow shortening every message, a font swap). A
         stale-high baseline masks real growth: grew and the pre-growth pin
         check both compute against a bottom that no longer exists. When the
         same message element persists between samples, undo just its own
         height delta — an append to it never moves scrollTop, so this
         reconstructs the true pre-growth bottom exactly. */
      var growth=measureContentGrowth(previous,current,list);
      var shouldFollow=growth.grew&&!contentFollowIsBlocked(list,lastMessage)
        &&wasPinned(growth.beforeGrowth);
      if(shouldFollow&&!userScrolledAway()){
        /* Keep one bottom-follow animation active; its live target moves with
           streamed content instead of restarting the easing curve per update. */
        smoothScrollToBottom(list,{smooth:true,retarget:true});
      }
      contentMetrics=current;
      rememberMetrics();
    });
  }

  var messageObservers=createMessageObservers(list,{
    getLastMessage:function(){return lastMessage},
    setLastMessage:function(next){lastMessage=next},
    readMetrics:readMetrics,
    setContentMetrics:function(metrics){contentMetrics=metrics},
    getContentBaseline:function(){return contentMetrics||pinState.lastMetrics},
    getContentFrame:function(){return contentFrame},
    setContentFrame:function(frame){contentFrame=frame},
    scheduleContentFollow:scheduleContentFollow,
    rememberMetrics:rememberMetrics
  });

  pinState.lastMetrics=readMetrics();
  pinState.lastPinned=wasPinned(pinState.lastMetrics);
  list.addEventListener("scroll",rememberScrollPosition,{passive:true});
  messageObservers.observe();

  return function(){
    if(contentFrame)cancelAnimationFrame(contentFrame);
    stopComposerFollow();
    messageObservers.disconnect();
    composerLayout.disconnect();
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
  var wasPinned=isPinnedToBottom(sc.scrollHeight-sc.scrollTop-sc.clientHeight,slack);
  /* Do the scroll on the next frame so the new font-size / width has
     been applied to the layout. */
  requestAnimationFrame(function(){
    var sc2=scrollContainer();
    if(!sc2)return;
    if(wasPinned){
      writeScrollTop(sc2, sc2.scrollHeight, 'content');
    }else{
      /* Even if not pinned, keep the relative position stable. */
      var ratio=sc.scrollTop/Math.max(1,sc.scrollHeight-sc.clientHeight);
      writeScrollTop(sc2, Math.round(ratio*(sc2.scrollHeight-sc2.clientHeight)), 'history');
    }
  });
}

/* Scroll the main transcript to the bottom (send / keyboard-open path).
   Moved from main.js so all scroll ownership lives in this module.
   A forced scroll bypasses the pin check; otherwise the scroll only
   happens when the reader is pinned and has not scrolled away. */
export function scrollMainToBottom(opts){
  opts=opts||{};
  if(!opts.force&&stateStore.read("_userScrolledAway"))return;
  var sc=scrollContainer();
  if(!sc)return;
  /* A send glide (chat/turnAnchor.ts) owns the transcript while it runs.
     Thinking pills, tool cards, and search progress call this on every
     update; starting a bottom glide here would cancel the send glide
     mid-flight and yank the viewport. */
  if(!opts.force&&sc.dataset&&sc.dataset.turnAnchorSettling==="true")return;
  /* Centralise the pin decision behind the pure shouldAutoScroll predicate
     (slack = SCROLL_SLACK = 64) so the "auto-scroll only when pinned and the
     reader has not scrolled away" rule is defined once and unit-tested in
     scrollDecision.ts. */
  var distanceFromBottom=sc.scrollHeight-sc.scrollTop-sc.clientHeight;
  if(opts.force||shouldAutoScroll(distanceFromBottom,stateStore.read("_userScrolledAway"))){
    /* Share one bottom-follow owner across ordinary pinned-reader updates;
       the send-time turn anchor is guarded above. */
    smoothScrollToBottom(sc,{smooth:opts.smooth!==false,retarget:!opts.force&&opts.smooth!==false});
  }
}

/* Wait two animation frames so a freshly added message bubble has
   been measured before asking for scrollHeight. A single rAF is too
   early: the DOM write has not yet completed layout and scrollHeight
   reflects the pre-bubble height, so the smooth scroll targets a stale
   bottom. */
export function scheduleScrollMainToBottom(opts){
  requestAnimationFrame(function(){
    requestAnimationFrame(function(){
      scrollMainToBottom(opts);
    });
  });
}
