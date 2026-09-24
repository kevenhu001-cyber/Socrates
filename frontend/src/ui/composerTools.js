import { openPromptTemplatesModal } from '../ui/promptTemplates.js';
/* Compact, ChatGPT-style action menu for both composers.  Keeping the menu
 * in a body portal prevents the rounded input surface from clipping it. */

var MENU_ID = "composerToolsMenu";
var activeTrigger = null;

function menu() {
  var el = document.getElementById(MENU_ID);
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
    var el = document.getElementById(MENU_ID);
    var bridge = window.__socratesComposerToolsBridge;
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
  var el = document.getElementById(MENU_ID);
  if (el) el.classList.add("hidden");
  if (activeTrigger) activeTrigger.setAttribute("aria-expanded", "false");
  activeTrigger = null;
  /* Clears the mobile open marker used by menu styling and outside-click logic. */
  document.body.classList.remove("composer-tools-open");
  _publishComposerTools();
}

function position(el, trigger) {
  /* Clear measurements from a prior viewport before calculating this pass. */
  el.style.removeProperty('top');
  el.style.removeProperty('bottom');
  el.style.removeProperty('left');
  el.style.removeProperty('right');
  var r = trigger.getBoundingClientRect();
  var viewport = window.visualViewport;
  var viewportTop = viewport ? Math.max(0, viewport.offsetTop || 0) : 0;
  var viewportBottom = viewport ? (viewportTop + viewport.height) : window.innerHeight;
  var viewportWidth = viewport ? viewport.width : window.innerWidth;
  var mode = trigger.dataset ? trigger.dataset.composerMode : null;
  /* The expanded card never grows past ~62vh on desktop (560px absolute
     ceiling) so it reads as a menu next to the capsule, not a second panel.
     With nine grouped rows the directory needs ~565px — a shorter cap hides
     trailing groups behind scroll. When the space beside the composer is
     smaller the list still scrolls, keeping the greeting visible. */
  var menuHeightCap = viewportWidth > 768
    ? Math.max(120, Math.min(560, (viewportBottom - viewportTop) * 0.62))
    : Math.max(120, (viewportBottom - viewportTop) / 2);

  /* The landing reference anchors the popover to the composer's left edge
     and always opens downward. Connected plugin rows scroll inside the card
     instead of making the card jump above the prompt. */
  if (mode === "topic" && viewportWidth > 768) {
    var wrap = trigger.closest ? trigger.closest("#topicInputWrap") : null;
    var wrapRect = wrap ? wrap.getBoundingClientRect() : r;
    var menuTop = r.bottom + 8;
    var room = Math.max(120, viewportBottom - menuTop - 16);
    el.style.width = "220px";
    el.style.maxHeight = Math.min(room, menuHeightCap) + "px";
    el.style.left = Math.max(8, Math.min(wrapRect.left, viewportWidth - 228)) + "px";
    el.style.top = menuTop + "px";
    el.dataset.menuSide = "below";
    return;
  }

  el.style.width = viewportWidth > 768 ? "220px" : "";
  el.style.maxHeight = menuHeightCap + "px";
  el.style.left = "0px";
  el.style.top = "0px";
  var width = el.offsetWidth || 260;
  var height = el.offsetHeight || 300;
  /* The mobile reference card sits a few pixels to the left of the circular
     plus control, so the card edge aligns with the composer instead of
     looking like it is attached to the icon's center. Desktop keeps the
     trigger edge alignment. */
  /* The menu floats above the whole composer capsule, not the trigger
     button — the plus control lives on the capsule's second row, so
     anchoring to the trigger would overlap the editor row. */
  var wrap = trigger.closest ? trigger.closest('#topicInputWrap, #chatInputWrap') : null;
  var wrapRect = wrap ? wrap.getBoundingClientRect() : r;
  var anchorLeft = viewportWidth <= 768 ? wrapRect.left : r.left;
  /* Phones keep a 12px gutter so the card never sits flush against the
     viewport edge even when the composer itself is only 8–16px inset. */
  var minLeft = viewportWidth <= 768 ? 12 : 8;
  var left = Math.max(minLeft, Math.min(anchorLeft, viewportWidth - width - 8));
  /* On phones the reference card shares the composer's bottom edge and
     covers its left half; the mic and primary control remain visible on the
     right. This is a deliberate stacked state, not an above-composer gap. */
  if (viewportWidth <= 768) {
    var mobileTop = Math.max(viewportTop + 8, wrapRect.bottom - height);
    /* Restore sheets include `top:auto` and `bottom` overrides from an older
       bottom-sheet layout. Inline important placement keeps the current
       floating card anchored to the composer's measured bottom edge. */
    el.style.setProperty('left', left + "px", 'important');
    el.style.setProperty('right', 'auto', 'important');
    el.style.setProperty('top', mobileTop + "px", 'important');
    el.style.setProperty('bottom', 'auto', 'important');
    el.dataset.menuSide = "above";
    return;
  }
  var anchorTop = wrapRect.top;
  /* ChatGPT places the add-content menu below the composer whenever the
     viewport has room. Falling back above is only necessary near the bottom
     edge (most often on a phone), which keeps the desktop landing state from
     covering the greeting. */
  var belowTop = wrapRect.bottom + 8;
  var aboveTop = anchorTop - height - 8;
  var belowSpace = viewportBottom - belowTop - 8;
  var aboveSpace = anchorTop - viewportTop - 8;
  var top;
  var side;
  if (belowSpace >= height) {
    top = belowTop;
    side = "below";
  } else if (aboveSpace >= height) {
    top = aboveTop;
    side = "above";
  } else if (belowSpace >= 120 && belowSpace >= aboveSpace) {
    /* A short desktop viewport may not have room for the full directory.
       Prefer a scrollable menu below the composer so selected chips and the
       trigger never become an accidental hit-test target underneath it. */
    el.style.maxHeight = Math.min(belowSpace, menuHeightCap) + "px";
    top = belowTop;
    side = "below";
  } else if (aboveSpace >= 120) {
    el.style.maxHeight = Math.min(aboveSpace, menuHeightCap) + "px";
    top = anchorTop - aboveSpace - 8;
    side = "above";
  } else {
    el.style.maxHeight = Math.min(Math.max(120, Math.max(belowSpace, aboveSpace)), menuHeightCap) + "px";
    top = belowSpace >= aboveSpace ? belowTop : viewportTop + 8;
    side = belowSpace >= aboveSpace ? "below" : "above";
  }
  top = Math.max(viewportTop + 8, Math.min(viewportBottom - (el.offsetHeight || height) - 8, top));
  el.style.left = left + "px";
  el.style.top = top + "px";
  el.dataset.menuSide = side;
}

function reposition() {
  var el = document.getElementById(MENU_ID);
  if (activeTrigger && el && !el.classList.contains("hidden")) position(el, activeTrigger);
}

/* React-owned disclosure rows can change the menu's height after the legacy
 * open/position pass has already run. Expose the same geometry pass so the
 * expanded list stays inside the visual viewport on short phones. */
export function repositionComposerTools() {
  reposition();
}

export function toggleComposerTools(trigger, mode) {
  var el = menu();
  if (activeTrigger === trigger && !el.classList.contains("hidden")) { close(); return; }
  close();
  activeTrigger = trigger;
  trigger.dataset.composerMode = mode;
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
    var el = document.getElementById(MENU_ID);
    if (!el || el.classList.contains("hidden")) return;
    var action = event.target.closest && event.target.closest("[data-action],[data-composer-action]");
    if (action && el.contains(action)) {
      var mode = activeTrigger && activeTrigger.dataset.composerMode;
      var kind = action.dataset.composerAction || action.dataset.action;
      close();
      /* 'upload' opens the native attachment picker directly; 'skills'
         opens the prompt-templates modal. Both are not regular
         ExtensionDefinitions — they don't run through dispatchExtension.
         Everything else routes through the single dispatcher installed
         by installWindowExtensionDelegates() (extensions/index.ts:99). */
      if (kind === "upload") {
        if (typeof window.openAttachmentPicker === "function") {
          window.openAttachmentPicker(mode === "topic" ? "topicAttachInput" : "attachInput");
        }
      } else if (kind === "skills") {
        if (typeof openPromptTemplatesModal === "function") openPromptTemplatesModal();
      } else if (typeof window.__socratesExtensionDispatch === "function") {
        window.__socratesExtensionDispatch(kind);
      }
      return;
    }
    if (!event.target.closest || !event.target.closest(".composer-tools-trigger")) close();
  });
  document.addEventListener("keydown", function (event) { if (event.key === "Escape") close(); });
  window.addEventListener("resize", reposition);
  if (window.visualViewport) {
    window.visualViewport.addEventListener("resize", reposition);
    window.visualViewport.addEventListener("scroll", reposition);
  }
}
