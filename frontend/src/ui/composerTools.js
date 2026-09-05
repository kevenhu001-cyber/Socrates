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
  /* Drops the mobile bottom-sheet scrim (body.composer-tools-open::after). */
  document.body.classList.remove("composer-tools-open");
  _publishComposerTools();
}

function position(el, trigger) {
  var r = trigger.getBoundingClientRect();
  var viewport = window.visualViewport;
  var viewportTop = viewport ? Math.max(0, viewport.offsetTop || 0) : 0;
  var viewportBottom = viewport ? (viewportTop + viewport.height) : window.innerHeight;
  var viewportWidth = viewport ? viewport.width : window.innerWidth;
  el.style.maxHeight = Math.max(120, viewportBottom - viewportTop - 16) + "px";
  el.style.left = "0px";
  el.style.top = "0px";
  var width = el.offsetWidth || 260;
  var height = el.offsetHeight || 300;
  /* The mobile reference card sits a few pixels to the left of the circular
     plus control, so the card edge aligns with the composer instead of
     looking like it is attached to the icon's center. Desktop keeps the
     trigger edge alignment. */
  var anchorLeft = viewportWidth <= 768 ? r.left - 12 : r.left;
  var left = Math.max(8, Math.min(anchorLeft, viewportWidth - width - 8));
  /* ChatGPT places the add-content menu below the composer whenever the
     viewport has room. Falling back above is only necessary near the bottom
     edge (most often on a phone), which keeps the desktop landing state from
     covering the greeting. */
  var belowTop = r.bottom + 8;
  var aboveTop = r.top - height - 8;
  var belowSpace = viewportBottom - belowTop - 8;
  var aboveSpace = r.top - viewportTop - 8;
  var top;
  if (belowSpace >= height) {
    top = belowTop;
  } else if (aboveSpace >= height) {
    top = aboveTop;
  } else if (viewportWidth <= 768) {
    /* Mobile CSS pins the menu to the bottom edge. Leave the inline
       coordinates harmless; the fixed sheet rule owns the final geometry. */
    top = belowTop;
  } else if (belowSpace >= 120 && belowSpace >= aboveSpace) {
    /* A short desktop viewport may not have room for the full directory.
       Prefer a scrollable menu below the composer so selected chips and the
       trigger never become an accidental hit-test target underneath it. */
    el.style.maxHeight = belowSpace + "px";
    top = belowTop;
  } else if (aboveSpace >= 120) {
    el.style.maxHeight = aboveSpace + "px";
    top = r.top - aboveSpace - 8;
  } else {
    el.style.maxHeight = Math.max(120, Math.max(belowSpace, aboveSpace)) + "px";
    top = belowSpace >= aboveSpace ? belowTop : viewportTop + 8;
  }
  top = Math.max(viewportTop + 8, Math.min(viewportBottom - (el.offsetHeight || height) - 8, top));
  el.style.left = left + "px";
  el.style.top = top + "px";
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
  /* On phones the menu renders as a bottom sheet (CSS overrides the inline
     left/top); this class shows the scrim behind it. */
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
