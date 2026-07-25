/* src/ui/delegate.js — Global inline-handler delegation.
 *
 * Replaces every `onclick`, `oninput`, `onkeydown`, `onchange`, `onfocus`,
 * `onsubmit` attribute in index.html with a single event-delegation
 * listener on `document.body`. Elements declare intent via `data-action`
 * attributes; this module maps those to the real `window.*` functions.
 *
 * This is the last step before deleting src/windowExports.js (C4).
 *
 * Usage in HTML:
 *   <button data-action="resetApp">New Chat</button>
 *   <button data-action="openNav" data-action-arg="library">Library</button>
 *   <input  data-action="setRecentsSearch" data-action-arg="value">
 *   <form   data-action="submitAuthSignin" data-action-submit="true">
 *   <div    data-action="closeCmdK"        data-action-self-only="true">
 *   <button data-action="closeMorePopover;openSettings">Settings</button>
 *
 * Argument tokens (data-action-arg):
 *   "value"  → passes this.value (the element's current value)
 *   "event"  → passes the event object
 *   any other literal → passes that literal as a string
 *
 * Multi-action: separate names with `;`.
 *
 * data-action-submit="true":
 *   Used on <form> elements. Calls preventDefault() first, then dispatches
 *   each action. The listener is bound to `submit` (not `click`), so the
 *   document.body delegation still works (submit bubbles to body).
 *
 * data-action-self-only="true":
 *   Used on overlay backdrop elements. The action only fires when the
 *   event target is the element itself (i.e. the backdrop was clicked,
 *   not a child). Lets us drop `if(event.target===this)closeX()` patterns.
 */

var DELEGATE_ACTIONS = {};

// Register a handler for a data-action value.
// handler receives (element, event, ...args).
function registerAction(name, handler) {
  DELEGATE_ACTIONS[name] = handler;
}

// Built-in actions registered by buildActionMap().
function registerBuiltinActions() {
  // Prevent-default-only (used as the first link in a chain on a form).
  registerAction('preventDefault', function (el, e) {
    e.preventDefault();
  });
  // stopPropagation-only; replaces `onclick="event.stopPropagation()"` on
  // overlay containers so clicks inside the overlay don't bubble to the
  // backdrop's "self-only" close handler.
  registerAction('__stop', function (el, e) {
    e.stopPropagation();
  });
  // this.select() / this.blur() — convenience for inputs.
  registerAction('select', function (el) { el.select(); });
  registerAction('blur', function (el) { el.blur(); });
  // Toggle password visibility is a tiny JS primitive that doesn't
  // need a window.X bridge; keep it here.
  registerAction('togglePasswordVisibility', function (el) {
    var input = el.previousElementSibling;
    if (!input || input.tagName !== 'INPUT') return;
    if (input.type === 'password') {
      input.type = 'text';
      el.textContent = 'Hide';
    } else {
      input.type = 'password';
      el.textContent = 'Show';
    }
  });
}

// Build the action map from all window.* functions that inline handlers
// currently reference. This is the single source of truth for the bridge.
function buildActionMap() {
  registerBuiltinActions();
  var w = window;

  // Auth
  registerAction('switchAuthTab', function (el, e, tab) { w.switchAuthTab(tab); });
  registerAction('showAuthForgotPassword', function () { w.showAuthForgotPassword(); });
  registerAction('showAuthCodeLogin', function () { w.showAuthCodeLogin(); });
  registerAction('resendVerification', function () { w.resendVerification(); });
  registerAction('showAuthSignin', function () { w.showAuthSignin(); });
  registerAction('submitAuthSendCode', function () { w.submitAuthSendCode(); });
  registerAction('submitAuthLoginWithCode', function () { w.submitAuthLoginWithCode(); });
  registerAction('resendAuthCode', function () { w.resendAuthCode(); });
  registerAction('submitAuthSignin', function () { w.submitAuthSignin(); });
  registerAction('submitAuthRegister', function () { w.submitAuthRegister(); });
  registerAction('submitAuthForgotPassword', function () { w.submitAuthForgotPassword(); });
  registerAction('submitAuthResetPassword', function () { w.submitAuthResetPassword(); });

  // Display / Theme
  registerAction('toggleGrid', function () { w.toggleGrid(); });
  registerAction('setAccentColor', function (el, e, hue) { w.setAccentColor(parseInt(hue, 10)); });
  registerAction('toggleDisplayPrefs', function () { w.toggleDisplayPrefs(); });
  registerAction('toggleTheme', function () { w.toggleTheme(); });
  registerAction('resetAccentColor', function () { w.resetAccentColor(); });
  registerAction('setAccentCustom', function (el) { w.setAccentCustom(el.value); });
  registerAction('setBackgroundDark', function (el) { w.setBackgroundDark(el.value); });
  registerAction('setBackgroundLight', function (el) { w.setBackgroundLight(el.value); });
  registerAction('resetBackgroundDark', function () { w.resetBackgroundDark(); });
  registerAction('resetBackgroundLight', function () { w.resetBackgroundLight(); });

  // Sidebar / Navigation
  registerAction('resetApp', function () { w.resetApp(); });
  registerAction('toggleSidebar', function () { w.toggleSidebar(); });
  registerAction('openNav', function (el, e, nav) { w.openNav(nav); });
  registerAction('closeMorePopover', function () { w.closeMorePopover(); });
  registerAction('openPromptTemplatesModal', function () { w.openPromptTemplatesModal(); });
  registerAction('openSettings', function () { w.openSettings(); });
  registerAction('openCheatsheet', function () { w.openCheatsheet(); });
  registerAction('signOut', function () { w.signOut(); });
  registerAction('toggleSidebarView', function (el, e, view) { w.toggleSidebarView(view); });
  registerAction('openLibraryUpload', function () { w.openLibraryUpload(); });
  registerAction('switchLibraryTab', function (el, e, tab) { w.switchLibraryTab(tab); });
  registerAction('openCreateProject', function () { w.openCreateProject(); });
  registerAction('openCreateScheduledTask', function () { w.openCreateScheduledTask(); });
  registerAction('openPluginMarketplace', function () { w.openPluginMarketplace(); });
  registerAction('filterLibrary', function (el) { w.filterLibrary(el.value); });
  registerAction('switchTab', function (el, e, tab) { w.switchTab(tab || 'recents'); });
  registerAction('setRecentsSearch', function (el) { w.setRecentsSearch(el.value); });

  // Mode toggles — guarded by window.appMode so the inline-only state
  // (currently "chat" / "tutor") only triggers when the user wants to
  // actually switch. These used to be `if(window.appMode!=='chat')...`
  // expressions; we now encode the guard in data-action-guard.
  registerAction('toggleAppMode', function () {
    if (typeof w.toggleAppMode === 'function') w.toggleAppMode();
  });
  registerAction('toggleMobileModeMenu', function () {
    if (typeof w.toggleMobileModeMenu === 'function') w.toggleMobileModeMenu();
  });
  registerAction('selectAppMode', function (el, e, mode) {
    if (typeof w.selectAppMode === 'function') w.selectAppMode(mode);
  });
  registerAction('toggleIncognito', function () {
    if (typeof w.toggleIncognito === 'function') w.toggleIncognito();
  });

  // Topic / Chat input
  registerAction('startSession', function () { w.startSession(); });
  registerAction('handleSendClick', function () { w.handleSendClick(); });
  registerAction('handleChatKey', function (el, e) {
    if (typeof w.handleChatKey === 'function') w.handleChatKey(e);
  });
  registerAction('autoResize', function (el) {
    if (typeof w.autoResize === 'function') w.autoResize(el);
  });
  registerAction('updateStartBtn', function () {
    if (typeof w.updateStartBtn === 'function') w.updateStartBtn();
  });
  registerAction('updateSendBtn', function () {
    if (typeof w.updateSendBtn === 'function') w.updateSendBtn();
  });
  registerAction('toggleComposerTools', function (el, e, target) {
    if (typeof w.toggleComposerTools === 'function') w.toggleComposerTools(el, target);
  });

  // Effort Picker
  registerAction('toggleEffortPicker', function (el) {
    if (typeof w.toggleEffortPicker === 'function') w.toggleEffortPicker(el);
  });
  registerAction('setReasoningEffort', function (el, e, level) {
    if (typeof w.setReasoningEffort === 'function') w.setReasoningEffort(level);
  });

  // Find in session
  registerAction('openFindInSession', function () { w.openFindInSession(); });
  registerAction('closeFindInSession', function () { w.closeFindInSession(); });
  registerAction('onFindInput', function (el) { w.onFindInput(el.value); });
  registerAction('onFindKey', function (el, e) { w.onFindKey(e); });
  registerAction('findNext', function () { w.findNext(); });
  registerAction('findPrev', function () { w.findPrev(); });

  // Share
  registerAction('openShareModal', function () { w.openShareModal(); });
  registerAction('closeShareModal', function () { w.closeShareModal(); });
  registerAction('selectShareVis', function (el, e, vis) { w.selectShareVis(vis); });
  registerAction('copyShareLink', function () { w.copyShareLink(); });
  registerAction('revokeShareLink', function () { w.revokeShareLink(); });
  registerAction('createShareLink', function () { w.createShareLink(); });

  // Profile
  registerAction('closeProfile', function () { w.closeProfile(); });
  registerAction('setLang', function (el, e, lang) { w.setLang(lang); });
  registerAction('toggleProfileWebSearch', function () { w.toggleProfileWebSearch(); });
  registerAction('openUsageModal', function () { w.openUsageModal(); });
  registerAction('openStorageModal', function () { w.openStorageModal(); });
  registerAction('confirmClearCache', function () { w.confirmClearCache(); });
  registerAction('confirmClearSettings', function () { w.confirmClearSettings(); });
  registerAction('confirmDeleteAccount', function () { w.confirmDeleteAccount(); });
  registerAction('saveProfileName', function (el) { w.saveProfileName(el.value); });
  registerAction('onCustomInstructionsChange', function () { w.onCustomInstructionsChange(); });

  // Cmd-K
  registerAction('closeCmdK', function () { w.closeCmdK(); });
  registerAction('onCmdKInput', function (el) { w.onCmdKInput(el.value); });
  registerAction('onCmdKKey', function (el, e) { w.onCmdKKey(e); });
  registerAction('openCmdK', function () { w.openCmdK(); });

  // Confirm dialog
  registerAction('closeConfirm', function () { w.closeConfirm(); });

  // Exam
  registerAction('openExamPanel', function () { w.openExamPanel(); });
  registerAction('toggleExamType', function (el, e, type) { w.toggleExamType(type); });
  registerAction('toggleExamModelMenu', function () { w.toggleExamModelMenu(); });
  registerAction('selectExamModel', function (el, e, id) { w.selectExamModel(id); });
  registerAction('selectExamDifficulty', function (el, e, val) { w.selectExamDifficulty(parseInt(val, 10)); });
  registerAction('adjustExamCount', function (el, e, delta) { w.adjustExamCount(parseInt(delta, 10)); });
  registerAction('startExamGeneration', function () { w.startExamGeneration(); });
  registerAction('cancelExamGeneration', function () { w.cancelExamGeneration(); });
  registerAction('selectExamOpt', function (el, e, qidx, oidx) {
    w.selectExamOpt(parseInt(qidx, 10), parseInt(oidx, 10));
  });
  registerAction('examNavJump', function (el, e, idx) { w.examNavJump(parseInt(idx, 10)); });
  registerAction('examNavStep', function (el, e, dir) { w.examNavStep(parseInt(dir, 10)); });
  registerAction('submitExam', function () { w.submitExam(); });
  registerAction('closeExamView', function () { w.closeExamView(); });

  // Quick actions
  registerAction('composeAction', function () { w.composeAction(); });
  registerAction('researchAction', function () { w.researchAction(); });

  // Others
  registerAction('openKnowledge', function () { w.openKnowledge(); });
  registerAction('closeUsageModal', function () { w.closeUsageModal(); });
  registerAction('openProfile', function () { w.openProfile(); });

  // KB detail (dynamic innerHTML)
  registerAction('toggleKBDetail', function (el, e, idx) {
    if (typeof w.toggleKBDetail === 'function') w.toggleKBDetail(parseInt(idx, 10));
  });
}

// Resolve the guard expression encoded in `data-action-guard`.
// Syntax (compact, single-purpose):
//   "var:literal:neq" → if (window.var !== 'literal') run the action chain.
//   "var:literal:eq"  → if (window.var === 'literal') run the action chain.
//   "var:truthy"      → if (!!window.var) run the action chain.
//   "var:falsy"       → if (!window.var) run the action chain.
// Returns true if the action chain should run.
function resolveGuard(guardExpr, w) {
  if (!guardExpr) return true;
  var parts = guardExpr.split(':');
  var varName = parts[0];
  var cur = w[varName];
  if (parts.length === 2) {
    var op = parts[1];
    if (op === 'truthy') return !!cur;
    if (op === 'falsy') return !cur;
    return true;
  }
  if (parts.length === 3) {
    var literal = parts[2];
    var op2 = parts[1];
    if (op2 === 'neq') return cur !== literal;
    if (op2 === 'eq') return cur === literal;
  }
  return true;
}

// Resolve the arg token in data-action-arg to a real value.
//   "value" → el.value
//   "event" → event
//   any other literal → the literal as-is
function resolveArg(argToken, el, event) {
  if (argToken == null) return undefined;
  if (argToken === 'value') return el.value;
  if (argToken === 'event') return event;
  return argToken;
}

// Run a single action chain against an element+event. Returns true if the
// chain was handled. Handlers must call e.preventDefault() themselves
// when they need to suppress default behaviour — the chain never does it
// automatically (matches the inline-handler contract, where some sites
// had `event.preventDefault()` as the first statement and others did not).
function runActionChain(el, event, actionStr, eventType) {
  var actions = actionStr.split(';');
  var handled = false;
  for (var i = 0; i < actions.length; i++) {
    var act = actions[i].trim();
    if (!act) continue;
    var parts = act.split(':');
    var name = parts[0].trim();
    var argToken = parts[1] ? parts[1].trim() : null;
    var handler = DELEGATE_ACTIONS[name];
    if (!handler) continue;
    handled = true;
    var arg = resolveArg(argToken, el, event);
    if (argToken !== null) {
      handler(el, event, arg);
    } else {
      handler(el, event);
    }
  }
  return handled;
}

// Walk up from the event target looking for a data-action attribute.
function findActionTarget(target) {
  while (target && target !== document.body) {
    if (target.dataset && target.dataset.action) return target;
    target = target.parentElement;
  }
  return null;
}

function matchesKeys(event, keysSpec) {
  if (!keysSpec) return true;
  if (!event || !event.key) return false;
  var alternatives = keysSpec.split('|');
  for (var i = 0; i < alternatives.length; i++) {
    var parts = alternatives[i].split(':');
    var key = parts[0].trim();
    var mod = parts[1] ? parts[1].trim() : null;
    if (event.key !== key) continue;
    if (mod && mod.indexOf('!') === 0) {
      var modName = mod.slice(1);
      if (event[modName]) return false;
    }
    return true;
  }
  return false;
}

// Dispatch a bubbling event by walking up to the nearest [data-action]
// element. selfOnly means "only fire when the event target is the
// data-action element itself" (used for backdrop-click-to-close).
function dispatchEvent(event, eventType) {
  var target = findActionTarget(event.target);
  if (!target) return;
  var selfOnly = target.getAttribute('data-action-self-only') === 'true';
  if (selfOnly && event.target !== target) return;
  var w = window;
  var guard = target.getAttribute('data-action-guard');
  if (!resolveGuard(guard, w)) return;
  var keysSpec = target.getAttribute('data-action-keys');
  if (!matchesKeys(event, keysSpec)) return;
  // Per-event-type action string lets a single element declare different
  // actions for input vs focus, click vs keydown, etc. Falls back to
  // data-action for any event without a specific override.
  var actionStr = target.getAttribute('data-action-' + eventType)
    || target.dataset.action;
  if (actionStr) runActionChain(target, event, actionStr, eventType);
}

// Set up the single delegation listener
function installDelegate() {
  if (document.__socratesDelegateInstalled) return;
  document.__socratesDelegateInstalled = true;

  buildActionMap();

  document.body.addEventListener('click', function (e) {
    dispatchEvent(e, 'click');
  });

  document.body.addEventListener('input', function (e) {
    dispatchEvent(e, 'input');
  });

  document.body.addEventListener('keydown', function (e) {
    dispatchEvent(e, 'keydown');
  });

  document.body.addEventListener('change', function (e) {
    dispatchEvent(e, 'change');
  });

  document.body.addEventListener('focus', function (e) {
    dispatchEvent(e, 'focus');
  }, true); // capture — focus doesn't bubble

  // <form onsubmit=...> bubbles to document.body as a `submit` event.
  document.body.addEventListener('submit', function (e) {
    var form = e.target;
    if (!form || !form.dataset || !form.dataset.action) return;
    if (form.getAttribute('data-action-submit') !== 'true') return;
    // data-action-submit="true" replaces onsubmit="event.preventDefault();fn()"
    e.preventDefault();
    dispatchEvent(e, 'submit');
  }, true); // capture phase — submit does not bubble
}

export { registerAction, installDelegate };