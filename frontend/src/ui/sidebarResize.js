// src/ui/sidebarResize.js — Phase C-2.1 extraction
// Drag the 10px-wide strip on the right edge of the sidebar to
// change its width. Range: 200–480 px. Persists in localStorage.
// The sidebar overlays the main content when wider than 18rem.
//
// The drag is driven by the shared spring solver (packages/core): the panel
// chases the pointer with an overdamped spring — stiffness 1200 / damping
// 80, ζ = 1.16 — so it converges without a wobble, and the same spring
// settles the panel after the release. The curve is analytic, so a dropped
// frame cannot shift it and the Web panel and the Universal app play the
// same motion.
//
// `syncSidebarBtns` (still defined in main.js) and `toggleSidebar`
// (sidebar resize bindings) are imported lazily to avoid a hard dep cycle:
// the resize listener below calls syncSidebarBtns only after the
// module has wired up.

import { createSpring, SPRING_PRESETS } from '@socrates/core/motion/spring';
import { reportSwallow } from '../util/reportSwallow.ts';

const SIDEBAR_MIN_PX = 200;
const SIDEBAR_MAX_PX = 480;
const SIDEBAR_DEFAULT_PX = 260;   /* ChatGPT-style desktop shell */
const STORAGE_KEY = "socrates-sidebar-width";

/* A quarter of a pixel is below the threshold of visibility, so the spring
   may call itself at rest there. */
const DRAG_REST_DELTA = 0.25;

let sidebarWidthPx = SIDEBAR_DEFAULT_PX;
let dragging = false;
let startX = 0;
let startW = 0;
/* The spring that chases the pointer, and the width it is heading for. */
let dragSpring = null;
let dragTargetPx = SIDEBAR_DEFAULT_PX;
let dragFrame = 0;

export function loadSidebarWidth(){
  try{
    const raw = localStorage.getItem(STORAGE_KEY);
    if(raw){
      const n = parseInt(raw, 10);
      if(n >= SIDEBAR_MIN_PX && n <= SIDEBAR_MAX_PX) sidebarWidthPx = n;
    }
  }catch (error) { reportSwallow(error, 'ui/sidebarResize.js:45', 'expected'); }
  applySidebarWidth();
}

export function applySidebarWidth(){
  document.documentElement.style.setProperty("--app-sidebar-width", sidebarWidthPx + "px");
}

export function saveSidebarWidth(width){
  const value = width == null ? Math.round(sidebarWidthPx) : width;
  try{ localStorage.setItem(STORAGE_KEY, String(value)); }catch (error) { reportSwallow(error, 'ui/sidebarResize.js:55', 'expected'); }
}

export function getSidebarWidthPx(){ return sidebarWidthPx; }
export function getSidebarMinPx(){ return SIDEBAR_MIN_PX; }
export function getSidebarMaxPx(){ return SIDEBAR_MAX_PX; }

/* Paint the spring's current value and keep painting until it comes to
   rest. The width is written straight to --app-sidebar-width, because a
   panel that tracks the pointer has to change its own box — there is no
   transform that widens a content column without stretching its text. */
function paintDragFrame(now){
  dragFrame = 0;
  const spring = dragSpring;
  if(!spring) return;
  const value = spring.valueAt(now);
  if(value !== sidebarWidthPx){
    sidebarWidthPx = value;
    applySidebarWidth();
  }
  if(dragging || !spring.settled(now)){
    dragFrame = requestAnimationFrame(paintDragFrame);
    return;
  }
  /* At rest the spring only approaches its target asymptotically, so the
     committed width is the target itself — an integer, and exactly what
     gets persisted. */
  sidebarWidthPx = dragTargetPx;
  applySidebarWidth();
  dragSpring = null;
  saveSidebarWidth(dragTargetPx);
}

function scheduleDragFrame(){
  if(dragFrame) return;
  dragFrame = requestAnimationFrame(paintDragFrame);
}

/* Wire mouse + touch + keyboard drag. Idempotent: a second call
   from main.js's hot-reload no-ops the listeners. */
export function initSidebarDrag(){
  const handle = document.getElementById("sidebarResizeHandle");
  if(!handle) return;
  loadSidebarWidth();

  function onDown(e){
    if(window.innerWidth <= 768) return; /* mobile: no resize */
    dragging = true;
    startX = e.clientX;
    startW = sidebarWidthPx;
    dragTargetPx = startW;
    dragSpring = createSpring(SPRING_PRESETS.dragRelease, startW, {
      restDelta: DRAG_REST_DELTA,
      now: performance.now(),
    });
    handle.classList.add("dragging");
    document.body.classList.add("sidebar-resizing");
    e.preventDefault();
    scheduleDragFrame();
  }
  function onMove(e){
    if(!dragging) return;
    const dx = e.clientX - startX;
    let w = startW + dx;
    if(w < SIDEBAR_MIN_PX) w = SIDEBAR_MIN_PX;
    if(w > SIDEBAR_MAX_PX) w = SIDEBAR_MAX_PX;
    dragTargetPx = w;
    if(dragSpring) dragSpring.setTarget(w, performance.now());
    scheduleDragFrame();
  }
  function onUp(){
    if(!dragging) return;
    dragging = false;
    handle.classList.remove("dragging");
    document.body.classList.remove("sidebar-resizing");
    /* The spring keeps running: it converges on the width the pointer left
       behind and commits it when it comes to rest. */
    saveSidebarWidth(dragTargetPx);
    scheduleDragFrame();
  }
  handle.addEventListener("mousedown", onDown);
  window.addEventListener("mousemove", onMove);
  window.addEventListener("mouseup", onUp);
  /* A release that lands outside the window never reaches the mouseup
     listener, and a drag that stays "held" would keep the frame loop
     running forever. Treat losing the pointer or the window as a release. */
  window.addEventListener("blur", onUp);
  document.addEventListener("mouseleave", onUp);
  /* Touch support so tablets can drag too. */
  handle.addEventListener("touchstart", function(e){
    if(e.touches.length !== 1) return;
    onDown({clientX: e.touches[0].clientX, preventDefault: function(){ e.preventDefault(); }});
  }, {passive: false});
  window.addEventListener("touchmove", function(e){
    if(!dragging || e.touches.length !== 1) return;
    onMove({clientX: e.touches[0].clientX});
  }, {passive: true});
  window.addEventListener("touchend", onUp);
  window.addEventListener("touchcancel", onUp);
  /* Keyboard: focused handle, arrow keys nudge. A keyboard step is a
     discrete command and lands at once — the spring belongs to the
     pointer, where the lag reads as weight rather than as delay. */
  handle.tabIndex = 0;
  handle.addEventListener("keydown", function(e){
    const step = e.shiftKey ? 32 : 8;
    if(e.key === "ArrowLeft" || e.key === "ArrowRight"){
      /* A keyboard step takes over from the pointer: the running spring is
       * dropped and the drag chrome comes off with it. */
      cancelDragSpring();
      handle.classList.remove("dragging");
      document.body.classList.remove("sidebar-resizing");
      sidebarWidthPx = e.key === "ArrowLeft"
        ? Math.max(SIDEBAR_MIN_PX, sidebarWidthPx - step)
        : Math.min(SIDEBAR_MAX_PX, sidebarWidthPx + step);
      applySidebarWidth();
      saveSidebarWidth();
      e.preventDefault();
    }
  });
}

/* Drop a running drag (a keyboard nudge takes over from the pointer). */
function cancelDragSpring(){
  if(dragFrame){ cancelAnimationFrame(dragFrame); dragFrame = 0; }
  dragSpring = null;
  dragging = false;
}

/* Auto-collapse on viewport shrink to mobile width, expand on grow
   to desktop. The handler is exported so main.js can register it
   from its central keyboard/resize dispatcher.

   Track the last known width so we only act when the width actually
   changes.  On Android, opening the virtual keyboard fires a resize
   event with the same innerWidth, and without this guard the sidebar
   would close every time the user taps the search input. */
let _lastResizeWidth = window.innerWidth;
export function onViewportResize(){
  const w = window.innerWidth;
  const sameWidth = w === _lastResizeWidth;
  _lastResizeWidth = w;
  /* If the width did not change, this is a height-only resize
     (e.g. keyboard open/close on Android). Do not touch the sidebar. */
  if(sameWidth) return;
  const bd = document.getElementById("sidebarBackdrop");
  const s = document.getElementById("sidebar");
  const open = s && !s.classList.contains("collapsed");
  if(w < 768 && open){
    if(s) s.classList.add("collapsed");
    if(window.sidebarOpen !== undefined) window.sidebarOpen = false;
    if(bd) bd.classList.remove("show");
    // Persist so a mobile refresh restores the collapsed state.
    try{ localStorage.setItem("socrates-sb", "0"); }catch (error) { reportSwallow(error, 'ui/sidebarResize.js:207', 'expected'); }
  } else if(w >= 768 && bd){
    bd.classList.remove("show");
  }
  /* syncSidebarBtns is still in main.js — call it via window so the
     coupling is one-directional. */
  if(typeof window.syncSidebarBtns === "function") window.syncSidebarBtns();
}

// Side-effect: register the viewport-resize listener exactly once.
// (Other listeners on `window` resize live in main.js for now.)
if(typeof window !== "undefined" && !window.__sidebarResizeWired){
  window.__sidebarResizeWired = true;
  window.addEventListener("resize", onViewportResize);
}
