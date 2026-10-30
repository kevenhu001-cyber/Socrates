import { openPromptTemplatesModal } from '../ui/promptTemplates.ts';
import { restingRect } from './pressFeedback.ts';
import { runtimeWindow as browserWindow } from "../types/runtimeWindow.ts";

/* Compact, ChatGPT-style action menu for both composers.  Keeping the menu
 * in a body portal prevents the rounded input surface from clipping it. */

const MENU_ID = "composerToolsMenu";
let activeTrigger: HTMLElement | null = null;

function menu() {
  let el = document.getElementById(MENU_ID);
  if (el) return el;
  el = document.createElement("div");
  el.id = MENU_ID;
  el.className = "composer-tools-menu hidden";
  el.setAttribute("role", "menu");
  el.setAttribute("aria-label", "Composer tools");
  document.body.appendChild(el);
  return el;
}

/* Pre-create the menu on module load so the React compatibility root can
   hydrate it eagerly on boot. Stays hidden until the user clicks a
   trigger. */
if (typeof document !== "undefined") menu();

/* React migration bridge — fires whenever the menu opens/closes or
   switches active trigger so the React compatibility root can mirror
   the menu via useSyncExternalStore. Installed by
   frontend/src/react/composer/composerToolsStore.ts under `?react=1`;
   legacy mode never sees a subscriber so the helper is a cheap no-op. */
function _publishComposerTools() {
  try {
    const el = document.getElementById(MENU_ID);
    const bridge = browserWindow.__socratesComposerToolsBridge;
    if (bridge && typeof bridge.publish === "function") {
      bridge.publish({
        isOpen: !!(el && !el.classList.contains("hidden")),
        mode: activeTrigger && activeTrigger.dataset ? activeTrigger.dataset.composerMode : null,
        triggerId: activeTrigger && activeTrigger.id ? activeTrigger.id : null,
      });
    }
  } catch (_) { /* swallow — bridge is best-effort */ }
}

/* React owns the composer-tools menu's children unconditionally under
   the always-on runtime — the menu element is pre-created on module
   load (line above) and hydrated by `bootstrapReactCompatibilityRuntime`.
   The publish helper `_publishComposerTools()` is the only path that
   drives React. */

function close() {
  const el = document.getElementById(MENU_ID);
  if (el) el.classList.add("hidden");
  if (activeTrigger) activeTrigger.setAttribute("aria-expanded", "false");
  activeTrigger = null;
  /* Clears the mobile open marker used by menu styling and outside-click logic. */
  document.body.classList.remove("composer-tools-open");
  _publishComposerTools();
}

function positionTopicMenu(el: HTMLElement, trigger: HTMLElement, rect: Pick<DOMRect, 'bottom' | 'left' | 'top'>, viewportWidth: number, viewportBottom: number, menuHeightCap: number) {
  if (!trigger.dataset || trigger.dataset.composerMode !== "topic" || viewportWidth <= 768) return false;
  const topicWrap = trigger.closest ? trigger.closest("#composerInputWrap") : null;
  const wrapRect = topicWrap ? topicWrap.getBoundingClientRect() : rect;
  const menuTop = rect.bottom + 8;
  const room = Math.max(120, viewportBottom - menuTop - 16);
  el.style.width = "220px";
  el.style.maxHeight = Math.min(room, menuHeightCap) + "px";
  el.style.left = Math.max(8, Math.min(wrapRect.left, viewportWidth - 228)) + "px";
  el.style.top = menuTop + "px";
  el.dataset.menuSide = "below";
  return true;
}

/* Phones get a bottom sheet pinned to the viewport edge. The floating card it
   replaced covered the composer's own `+` trigger and cut a row in half at
   its bottom edge — thirteen actions behind an invisible internal scroll in
   a 360px window. The sheet keeps the whole list in one thumb-reachable
   surface. Placement stays inline `!important` because the restore layer
   still pins the old card geometry for the attachment menu. */
function positionMobileMenu(el: HTMLElement) {
  el.style.setProperty('left', '0px', 'important');
  el.style.setProperty('right', '0px', 'important');
  el.style.setProperty('top', 'auto', 'important');
  el.style.setProperty('bottom', '0px', 'important');
  el.style.removeProperty('max-height');
  el.dataset.menuSide = "sheet";
}

function chooseDesktopMenuPosition(el: HTMLElement, anchorTop: number, anchorBottom: number, viewportTop: number, viewportBottom: number, height: number, cap: number) {
  const belowTop = anchorBottom + 8;
  const aboveTop = anchorTop - height - 8;
  const belowSpace = viewportBottom - belowTop - 8;
  const aboveSpace = anchorTop - viewportTop - 8;
  let top;
  let side;
  if (belowSpace >= height) {
    top = belowTop;
    side = "below";
  } else if (aboveSpace >= height) {
    top = aboveTop;
    side = "above";
  } else if (belowSpace >= 120 && belowSpace >= aboveSpace) {
    el.style.maxHeight = Math.min(belowSpace, cap) + "px";
    top = belowTop;
    side = "below";
  } else if (aboveSpace >= 120) {
    el.style.maxHeight = Math.min(aboveSpace, cap) + "px";
    top = anchorTop - aboveSpace - 8;
    side = "above";
  } else {
    el.style.maxHeight = Math.min(Math.max(120, Math.max(belowSpace, aboveSpace)), cap) + "px";
    top = belowSpace >= aboveSpace ? belowTop : viewportTop + 8;
    side = belowSpace >= aboveSpace ? "below" : "above";
  }
  return { top, side };
}

function clampDesktopMenuTop(top: number, viewportTop: number, viewportBottom: number, menuHeight: any, fallbackHeight: any) {
  return Math.max(viewportTop + 8, Math.min(viewportBottom - (menuHeight || fallbackHeight) - 8, top));
}

function position(el: HTMLElement, trigger: HTMLElement) {
  /* Clear measurements from a prior viewport before calculating this pass. */
  el.style.removeProperty('top');
  el.style.removeProperty('bottom');
  el.style.removeProperty('left');
  el.style.removeProperty('right');
  /* The trigger is usually still mid-press (the click, then this module's
     rAF re-position after React commits): anchor to its resting box. */
  const r = restingRect(trigger);
  const viewport = browserWindow.visualViewport;
  const viewportTop = viewport ? Math.max(0, viewport.offsetTop || 0) : 0;
  const viewportBottom = viewport ? (viewportTop + viewport.height) : browserWindow.innerHeight;
  const viewportWidth = viewport ? viewport.width : browserWindow.innerWidth;
  /* The expanded card never grows past ~62vh on desktop (560px absolute
     ceiling) so it reads as a menu next to the capsule, not a second panel.
     With nine grouped rows the directory needs ~565px — a shorter cap hides
     trailing groups behind scroll. When the space beside the composer is
     smaller the list still scrolls, keeping the greeting visible. */
  const menuHeightCap = viewportWidth > 768
    ? Math.max(120, Math.min(560, (viewportBottom - viewportTop) * 0.62))
    : Math.max(120, (viewportBottom - viewportTop) / 2);

  /* The landing reference anchors the popover to the composer's left edge
     and always opens downward. Connected plugin rows scroll inside the card
     instead of making the card jump above the prompt. */
  if (positionTopicMenu(el, trigger, r, viewportWidth, viewportBottom, menuHeightCap)) return;

  /* Phones pin the menu to the bottom edge; CSS owns its size and shape, so
     the measurement pass below is desktop-only. */
  if (viewportWidth <= 768) {
    el.style.removeProperty('width');
    positionMobileMenu(el);
    return;
  }

  el.style.width = "220px";
  el.style.maxHeight = menuHeightCap + "px";
  el.style.left = "0px";
  el.style.top = "0px";
  const width = el.offsetWidth || 260;
  const height = el.offsetHeight || 300;
  /* The menu floats above the whole composer capsule, not the trigger
     button — the plus control lives on the capsule's second row, so
     anchoring to the trigger would overlap the editor row. */
  const wrap = trigger.closest ? trigger.closest('#composerInputWrap') : null;
  const wrapRect = wrap ? wrap.getBoundingClientRect() : r;
  const left = Math.max(8, Math.min(r.left, viewportWidth - width - 8));
  /* ChatGPT places the add-content menu below the composer whenever the
     viewport has room. Falling back above is only necessary near the bottom
     edge, which keeps the desktop landing state from covering the greeting. */
  /* A short desktop viewport keeps the menu scrollable above or below. */
  const placement = chooseDesktopMenuPosition(
    el, wrapRect.top, wrapRect.bottom, viewportTop, viewportBottom, height, menuHeightCap,
  );
  let top = placement.top;
  const side = placement.side;
  top = clampDesktopMenuTop(top, viewportTop, viewportBottom, el.offsetHeight, height);
  el.style.left = left + "px";
  el.style.top = top + "px";
  el.dataset.menuSide = side;
}

function reposition() {
  const el = document.getElementById(MENU_ID);
  if (activeTrigger && el && !el.classList.contains("hidden")) position(el, activeTrigger);
}

/* React-owned disclosure rows can change the menu's height after the legacy
 * open/position pass has already run. Expose the same geometry pass so the
 * expanded list stays inside the visual viewport on short phones. */
export function repositionComposerTools() {
  reposition();
}

export function toggleComposerTools(trigger: HTMLElement, mode: string) {
  const el = menu();
  if (activeTrigger === trigger && !el.classList.contains("hidden")) { close(); return; }
  close();
  activeTrigger = trigger;
  trigger.dataset.composerMode = mode === 'topic' ? 'topic' : 'chat';
  el.classList.remove("hidden");
  trigger.setAttribute("aria-expanded", "true");
  position(el, trigger);
  /* The phone card follows its measured composer anchor; CSS owns its size
     and appearance. Keep the open marker for dismissal state. */
  document.body.classList.add("composer-tools-open");
  _publishComposerTools();
}

if (typeof document !== "undefined") {
  document.addEventListener("click", function (event) {
    const el = document.getElementById(MENU_ID);
    if (!el || el.classList.contains("hidden")) return;
    const action = (event.target as Element)!.closest && (event.target as Element)!.closest("[data-action],[data-composer-action]");
    if (action && el.contains(action)) {
      const kind = (action as HTMLElement).dataset.composerAction || (action as HTMLElement).dataset.action;
      close();
      /* 'upload' opens the native attachment picker directly; 'skills'
         opens the prompt-templates modal. Both are not regular
         ExtensionDefinitions — they don't run through dispatchExtension.
         Everything else routes through the single dispatcher installed
         by installWindowExtensionDelegates() (extensions/index.ts:99). */
      if (kind === "upload") {
        if (typeof browserWindow.openAttachmentPicker === "function") {
          browserWindow.openAttachmentPicker("composerAttachInput");
        }
      } else if (kind === "skills") {
        if (typeof openPromptTemplatesModal === "function") openPromptTemplatesModal();
      } else if (typeof browserWindow.__socratesExtensionDispatch === "function") {
        browserWindow.__socratesExtensionDispatch(kind!);
      }
      return;
    }
    if (!(event.target as Element)!.closest || !(event.target as Element)!.closest(".composer-tools-trigger")) close();
  });
  document.addEventListener("keydown", function (event) { if (event.key === "Escape") close(); });
  browserWindow.addEventListener("resize", reposition);
  if (browserWindow.visualViewport) {
    browserWindow.visualViewport.addEventListener("resize", reposition);
    browserWindow.visualViewport.addEventListener("scroll", reposition);
  }
}
