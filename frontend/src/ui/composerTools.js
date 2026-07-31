/* Compact, ChatGPT-style action menu for both composers.  Keeping the menu
 * in a body portal prevents the rounded input surface from clipping it. */

var MENU_ID = "composerToolsMenu";
var activeTrigger = null;

function label(key, fallback) {
  try {
    var value = window.t && window.t(key);
    return value && value !== key ? value : fallback;
  } catch (_) { return fallback; }
}

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

function item(action, icon, title) {
  return '<button type="button" class="composer-tools-item" role="menuitem" data-action="' + action + '">' +
    '<span class="composer-tools-icon">' + icon + '</span><span class="composer-tools-copy"><span>' + title +
    '</span></span></button>';
}

function render(el) {
  var upload = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9"><path d="M12 16V4M7.5 8.5 12 4l4.5 4.5"/><path d="M5 14v4a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-4"/></svg>';
  var pen = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4z"/></svg>';
  var search = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9"><circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/></svg>';
  var telescope = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="m10.065 12.493-6.18 1.318a.934.934 0 0 1-1.108-.702l-.537-2.15a1.07 1.07 0 0 1 .691-1.265l13.504-4.44"/><path d="m13.56 11.747 4.332-.924"/><path d="m16 21-3.105-6.21"/><path d="M16.485 5.94a2 2 0 0 1 1.455-2.425l1.09-.272a1 1 0 0 1 1.212.727l1.515 6.06a1 1 0 0 1-.727 1.213l-1.09.272a2 2 0 0 1-2.425-1.455z"/><path d="m6.158 8.633 1.114 4.456"/><path d="m8 21 3.105-6.21"/><circle cx="12" cy="13" r="2"/></svg>';
  var compass = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76"/></svg>';
  var exam = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9"><path d="M4 3h16v18H4z"/><path d="M8 8h8M8 12h5M8 16h3"/><path d="m15 15 1.5 1.5L20 13"/></svg>';
  var analyze = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9"><path d="M4 19V9M10 19V5M16 19v-7M22 19H2"/><path d="m4 7 6-4 6 7 5-4"/></svg>';
  var skills = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9"><rect x="4" y="4" width="6" height="6" rx="1.5"/><rect x="14" y="4" width="6" height="6" rx="1.5"/><rect x="4" y="14" width="6" height="6" rx="1.5"/><path d="M17 14v6M14 17h6"/></svg>';
  /* ChatGPT-style minimal list — keep in sync with the React renderer in
     react/composer/ComposerToolsMenu.tsx (which owns this menu at runtime):
     one icon + one label per row, no headings/descriptions/dividers. */
  el.innerHTML =
    item("upload", upload, label("composer.menu.upload", "Upload files")) +
    item("write", pen, label("composer.write", "Write or edit")) +
    item("research", search, label("composer.research", "Find resources")) +
    item("explore", compass, label("composer.explore", "Explore")) +
    item("deepResearch", telescope, label("composer.deepResearch", "Deep Research")) +
    item("analyze", analyze, label("composer.analyze", "Analyze data")) +
    item("exam", exam, label("composer.exam", "Generate exam")) +
    item("skills", skills, label("composer.menu.skills", "Skills & shortcuts"));
}

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
   The legacy `render(el)` mutation is never reachable; the publish
   helper `_publishComposerTools()` is the only path that drives React. */

function close() {
  var el = document.getElementById(MENU_ID);
  if (el) el.classList.add("hidden");
  if (activeTrigger) activeTrigger.setAttribute("aria-expanded", "false");
  activeTrigger = null;
  _publishComposerTools();
}

function position(el, trigger) {
  var r = trigger.getBoundingClientRect();
  el.style.left = "0px";
  el.style.top = "0px";
  var width = el.offsetWidth || 260;
  var height = el.offsetHeight || 300;
  var left = Math.max(8, Math.min(r.left, window.innerWidth - width - 8));
  var top = r.top - height - 10;
  if (top < 8) top = Math.min(window.innerHeight - height - 8, r.bottom + 10);
  el.style.left = left + "px";
  el.style.top = Math.max(8, top) + "px";
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
      if (kind === "upload" && typeof window.openAttachmentPicker === "function") window.openAttachmentPicker(mode === "topic" ? "topicAttachInput" : "attachInput");
      if (kind === "write" && typeof window.composeAction === "function") window.composeAction();
      if (kind === "research" && typeof window.researchAction === "function") window.researchAction();
      if (kind === "explore" && typeof window.exploreAction === "function") window.exploreAction();
      if (kind === "analyze" && typeof window.analyzeAction === "function") window.analyzeAction();
      if (kind === "deepResearch" && typeof window.deepResearchAction === "function") window.deepResearchAction();
      if (kind === "exam" && typeof window.toggleExtensionByKey === "function") window.toggleExtensionByKey(kind);
      if (kind === "skills" && typeof window.openPromptTemplatesModal === "function") window.openPromptTemplatesModal();
      return;
    }
    if (!event.target.closest || !event.target.closest(".composer-tools-trigger")) close();
  });
  document.addEventListener("keydown", function (event) { if (event.key === "Escape") close(); });
  window.addEventListener("resize", close);
}
