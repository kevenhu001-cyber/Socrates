// src/ui/sidebarResize.ts — Phase C-2.1 extraction
// Drag the 10px-wide strip on the right edge of the sidebar to
// change its width. Range: 200–480 px. Persists in localStorage.
// The sidebar overlays the main content when wider than 18rem.
//
// `syncSidebarBtns` (still defined in main.js) and `toggleSidebar`
// (sidebar/index.js) are imported lazily to avoid a hard dep cycle:
// the resize listener below calls syncSidebarBtns only after the
// module has wired up.
import { toggleSidebar } from '../sidebar/index.js';

const SIDEBAR_MIN_PX = 200;
const SIDEBAR_MAX_PX = 480;
const SIDEBAR_DEFAULT_PX = 288;   /* default ≈ 18rem */
const STORAGE_KEY = "socrates-sidebar-width";

let sidebarWidthPx = SIDEBAR_DEFAULT_PX;
let dragging = false;
let startX = 0;
let startW = 0;

export function loadSidebarWidth(): void {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const n = parseInt(raw, 10);
      if (n >= SIDEBAR_MIN_PX && n <= SIDEBAR_MAX_PX) sidebarWidthPx = n;
    }
  } catch (_) { }
  applySidebarWidth();
}

export function applySidebarWidth(): void {
  document.documentElement.style.setProperty("--app-sidebar-width", sidebarWidthPx + "px");
}

export function saveSidebarWidth(): void {
  try { localStorage.setItem(STORAGE_KEY, String(sidebarWidthPx)); } catch (_) { }
}

export function getSidebarWidthPx(): number { return sidebarWidthPx; }
export function getSidebarMinPx(): number { return SIDEBAR_MIN_PX; }
export function getSidebarMaxPx(): number { return SIDEBAR_MAX_PX; }

/* Wire mouse + touch + keyboard drag. Idempotent: a second call
   from main.js's hot-reload no-ops the listeners. */
export function initSidebarDrag(): void {
  const handle = document.getElementById("sidebarResizeHandle") as HTMLElement | null;
  if (!handle) return;
  // Capture into a non-null local so TypeScript carries the narrowing
  // across the closures defined below.
  const resizeHandle: HTMLElement = handle;
  loadSidebarWidth();

  function onDown(e: { clientX: number; preventDefault: () => void }): void {
    if (window.innerWidth <= 768) return; /* mobile: no resize */
    dragging = true;
    startX = e.clientX;
    startW = sidebarWidthPx;
    resizeHandle.classList.add("dragging");
    document.body.classList.add("sidebar-resizing");
    e.preventDefault();
  }
  function onMove(e: { clientX: number }): void {
    if (!dragging) return;
    const dx = e.clientX - startX;
    let w = startW + dx;
    if (w < SIDEBAR_MIN_PX) w = SIDEBAR_MIN_PX;
    if (w > SIDEBAR_MAX_PX) w = SIDEBAR_MAX_PX;
    sidebarWidthPx = w;
    applySidebarWidth();
  }
  function onUp(): void {
    if (!dragging) return;
    dragging = false;
    resizeHandle.classList.remove("dragging");
    document.body.classList.remove("sidebar-resizing");
    saveSidebarWidth();
  }
  resizeHandle.addEventListener("mousedown", onDown as (e: MouseEvent) => void);
  window.addEventListener("mousemove", onMove as (e: MouseEvent) => void);
  window.addEventListener("mouseup", onUp);
  /* Touch support so tablets can drag too. */
  resizeHandle.addEventListener("touchstart", function (e: TouchEvent) {
    if (e.touches.length !== 1) return;
    onDown({ clientX: e.touches[0].clientX, preventDefault: function () { e.preventDefault(); } });
  }, { passive: false } as AddEventListenerOptions);
  window.addEventListener("touchmove", function (e: TouchEvent) {
    if (!dragging || e.touches.length !== 1) return;
    onMove({ clientX: e.touches[0].clientX });
  }, { passive: true } as AddEventListenerOptions);
  window.addEventListener("touchend", onUp);
  /* Keyboard: focused handle, arrow keys nudge. */
  resizeHandle.tabIndex = 0;
  resizeHandle.addEventListener("keydown", function (e: KeyboardEvent) {
    const step = e.shiftKey ? 32 : 8;
    if (e.key === "ArrowLeft") {
      sidebarWidthPx = Math.max(SIDEBAR_MIN_PX, sidebarWidthPx - step);
      applySidebarWidth();
      saveSidebarWidth();
      e.preventDefault();
    } else if (e.key === "ArrowRight") {
      sidebarWidthPx = Math.min(SIDEBAR_MAX_PX, sidebarWidthPx + step);
      applySidebarWidth();
      saveSidebarWidth();
      e.preventDefault();
    }
  });
}

/* Auto-collapse on viewport shrink to mobile width, expand on grow
   to desktop. The handler is exported so main.js can register it
   from its central keyboard/resize dispatcher.

   Track the last known width so we only act when the width actually
   changes.  On Android, opening the virtual keyboard fires a resize
   event with the same innerWidth, and without this guard the sidebar
   would close every time the user taps the search input. */
let _lastResizeWidth = window.innerWidth;
export function onViewportResize(): void {
  const w = window.innerWidth;
  const sameWidth = w === _lastResizeWidth;
  _lastResizeWidth = w;
  /* If the width did not change, this is a height-only resize
     (e.g. keyboard open/close on Android). Do not touch the sidebar. */
  if (sameWidth) return;
  const bd = document.getElementById("sidebarBackdrop");
  const s = document.getElementById("sidebar");
  const open = s && !s.classList.contains("collapsed");
  if (w < 768 && open) {
    if (s) s.classList.add("collapsed");
    if ((window as any).sidebarOpen !== undefined) (window as any).sidebarOpen = false;
    if (bd) bd.classList.remove("show");
    // Persist so a mobile refresh restores the collapsed state.
    try { localStorage.setItem("socrates-sb", "0"); } catch (_) { }
  } else if (w >= 768 && bd) {
    bd.classList.remove("show");
  }
  /* syncSidebarBtns is still in main.js — call it via window so the
     coupling is one-directional. */
  if (typeof (window as any).syncSidebarBtns === "function") (window as any).syncSidebarBtns();
}

// Side-effect: register the viewport-resize listener exactly once.
// (Other listeners on `window` resize live in main.js for now.)
if (typeof window !== "undefined" && !(window as any).__sidebarResizeWired) {
  (window as any).__sidebarResizeWired = true;
  window.addEventListener("resize", onViewportResize);
}
