// src/legacy/sidebarResize.ts — Phase C-2.1 extraction
// Drag the 10px-wide strip on the right edge of the sidebar to
// change its width. Range: 200–480 px. Persists in localStorage.
// The sidebar overlays the main content when wider than 18rem.
//
// The panel tracks the pointer 1:1, coalesced to one width write per frame.
// A spring chasing a moving target always trails the cursor by a few pixels,
// which reads as input lag on a direct-manipulation handle; the compositor
// already coalesces pointer moves, so the direct value is the honest one.
// Keyboard steps remain discrete commands.
//
// Sidebar open state is published through sidebar.store so React-owned
// chrome can render the correct controls after a viewport transition.

import { reportSwallow } from '../util/reportSwallow.ts';
import { useSidebarStore } from '../sidebar/sidebar.store.ts';
import { projectSidebarOpen } from '../sidebar/sidebar.service.ts';
import { isMobileViewport } from '../sidebar/breakpoints.ts';

const SIDEBAR_MIN_PX = 200;
const SIDEBAR_MAX_PX = 480;
const SIDEBAR_DEFAULT_PX = 260; /* ChatGPT-style desktop shell */
const STORAGE_KEY = 'socrates-sidebar-width';

let sidebarWidthPx = SIDEBAR_DEFAULT_PX;
let dragging = false;
let startX = 0;
let startW = 0;
let dragTargetPx = SIDEBAR_DEFAULT_PX;
let dragFrame = 0;

export function loadSidebarWidth() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const n = parseInt(raw, 10);
      if (n >= SIDEBAR_MIN_PX && n <= SIDEBAR_MAX_PX) sidebarWidthPx = n;
    }
  } catch (error) {
    reportSwallow(error, 'legacy/sidebarResize.ts:45', 'expected');
  }
  applySidebarWidth();
}

export function applySidebarWidth() {
  document.documentElement.style.setProperty('--app-sidebar-width', sidebarWidthPx + 'px');
}

export function saveSidebarWidth(width?: number) {
  const value = width == null ? Math.round(sidebarWidthPx) : width;
  try {
    localStorage.setItem(STORAGE_KEY, String(value));
  } catch (error) {
    reportSwallow(error, 'legacy/sidebarResize.ts:55', 'expected');
  }
}

export function getSidebarWidthPx() {
  return sidebarWidthPx;
}
export function getSidebarMinPx() {
  return SIDEBAR_MIN_PX;
}
export function getSidebarMaxPx() {
  return SIDEBAR_MAX_PX;
}

/* One width write per frame. The width is written straight to
   --app-sidebar-width, because a panel that tracks the pointer has to
   change its own box — there is no transform that widens a content column
   without stretching its text. */
function paintDragFrame() {
  dragFrame = 0;
  if (!dragging || dragTargetPx === sidebarWidthPx) return;
  sidebarWidthPx = dragTargetPx;
  applySidebarWidth();
}

function scheduleDragFrame() {
  if (dragFrame) return;
  dragFrame = requestAnimationFrame(paintDragFrame);
}

/* Wire mouse + touch + keyboard drag. Idempotent: a second call
   from app entry's hot-reload no-ops the listeners. */
export function initSidebarDrag() {
  const handle = document.getElementById('sidebarResizeHandle');
  if (!handle) return;
  loadSidebarWidth();

  function onDown(e: { clientX: number; preventDefault?: () => void }) {
    if (isMobileViewport()) return; /* mobile: no resize */
    dragging = true;
    startX = e.clientX;
    startW = sidebarWidthPx;
    dragTargetPx = startW;
    handle!.classList.add('dragging');
    document.body.classList.add('sidebar-resizing');
    e.preventDefault?.();
    scheduleDragFrame();
  }
  function onMove(e: { clientX: number }) {
    if (!dragging) return;
    const dx = e.clientX - startX;
    let w = startW + dx;
    if (w < SIDEBAR_MIN_PX) w = SIDEBAR_MIN_PX;
    if (w > SIDEBAR_MAX_PX) w = SIDEBAR_MAX_PX;
    dragTargetPx = w;
    scheduleDragFrame();
  }
  function onUp() {
    if (!dragging) return;
    dragging = false;
    handle!.classList.remove('dragging');
    document.body.classList.remove('sidebar-resizing');
    /* Commit the value under the pointer, not a later animation target. */
    if (dragFrame) {
      cancelAnimationFrame(dragFrame);
      dragFrame = 0;
    }
    sidebarWidthPx = dragTargetPx;
    applySidebarWidth();
    saveSidebarWidth(dragTargetPx);
  }
  handle.addEventListener('mousedown', onDown);
  window.addEventListener('mousemove', onMove);
  window.addEventListener('mouseup', onUp);
  /* A release that lands outside the window never reaches the mouseup
     listener, and a drag that stays "held" would keep the frame loop
     running forever. Treat losing the pointer or the window as a release. */
  window.addEventListener('blur', onUp);
  document.addEventListener('mouseleave', onUp);
  /* Touch support so tablets can drag too. */
  handle.addEventListener(
    'touchstart',
    function (e) {
      if (e.touches.length !== 1) return;
      onDown({
        clientX: e.touches[0].clientX,
        preventDefault: function () {
          e.preventDefault();
        },
      });
    },
    { passive: false },
  );
  window.addEventListener(
    'touchmove',
    function (e) {
      if (!dragging || e.touches.length !== 1) return;
      onMove({ clientX: e.touches[0].clientX });
    },
    { passive: true },
  );
  window.addEventListener('touchend', onUp);
  window.addEventListener('touchcancel', onUp);
  /* Keyboard: focused handle, arrow keys nudge. A keyboard step is a
     discrete command and lands at once. */
  handle.tabIndex = 0;
  handle.addEventListener('keydown', function (e) {
    const step = e.shiftKey ? 32 : 8;
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      /* A keyboard step takes over from the pointer: drop the pending
       * drag write and take the drag chrome off. */
      cancelDragFrame();
      handle.classList.remove('dragging');
      document.body.classList.remove('sidebar-resizing');
      sidebarWidthPx =
        e.key === 'ArrowLeft'
          ? Math.max(SIDEBAR_MIN_PX, sidebarWidthPx - step)
          : Math.min(SIDEBAR_MAX_PX, sidebarWidthPx + step);
      applySidebarWidth();
      saveSidebarWidth();
      e.preventDefault();
    }
  });
}

/* Drop a running drag (a keyboard nudge takes over from the pointer). */
function cancelDragFrame() {
  if (dragFrame) {
    cancelAnimationFrame(dragFrame);
    dragFrame = 0;
  }
  dragging = false;
}

/* Auto-collapse on viewport shrink to mobile width, expand on grow
   to desktop. The handler is exported so app entrypoint can register it
   from its central keyboard/resize dispatcher.

   Track the last known width so we only act when the width actually
   changes.  On Android, opening the virtual keyboard fires a resize
   event with the same innerWidth, and without this guard the sidebar
   would close every time the user taps the search input. */
let _lastResizeWidth = typeof window !== 'undefined' ? window.innerWidth : 1024;
export function onViewportResize() {
  const w = window.innerWidth;
  const sameWidth = w === _lastResizeWidth;
  _lastResizeWidth = w;
  /* If the width did not change, this is a height-only resize
     (e.g. keyboard open/close on Android). Do not touch the sidebar. */
  if (sameWidth) return;
  const bd = document.getElementById('sidebarBackdrop');
  /* The store is the open-state truth; the projection writes the class and
     the persisted preference from one place (sidebar.service.projectSidebarOpen). */
  if (isMobileViewport()) {
    if (useSidebarStore.getState().isOpen) {
      projectSidebarOpen(false, { persist: true });
    }
    if (bd) bd.classList.remove('show');
  } else if (bd) {
    bd.classList.remove('show');
  }
}

// Side-effect: this ESM module has one canonical importer in main.ts, so its
// viewport listener is registered once without a window-level sentinel.
// (Other listeners on `window` resize lives in application bootstrap for now.)
if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
  window.addEventListener('resize', onViewportResize);
}
