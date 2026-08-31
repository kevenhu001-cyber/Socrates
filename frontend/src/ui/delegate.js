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
// Resolve a legacy function, preferring the typed __socratesLegacy bridge
// over the raw window.X alias. This lets delegate.js follow the same
// access path React uses while keeping backward compatibility for any
// function not yet migrated into the bridge.
function byLegacy(domain, name) {
  var w = window;
  var fn = w.__socratesLegacy && w.__socratesLegacy[domain] && w.__socratesLegacy[domain][name];
  return typeof fn === 'function' ? fn : w[name];
}

function buildActionMap() {
  registerBuiltinActions();
  var w = window;

  // Auth
  registerAction('switchAuthTab', function (el, e, tab) { w.switchAuthTab(tab); });
  registerAction('focusAuthTab', function (el, e) {
    if (typeof w.focusAuthTab === 'function') w.focusAuthTab(el, e);
  });
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

  registerAction('toggleGrid', function () { w.toggleGrid(); });
  registerAction('setAccentColor', function (el, e, hue) { w.setAccentColor(parseInt(hue, 10)); });
  registerAction('toggleDisplayPrefs', function () { byLegacy('navigation', 'toggleDisplayPrefs')(); });
  registerAction('toggleTheme', function () { w.toggleTheme(); });
  registerAction('resetAccentColor', function () { w.resetAccentColor(); });
  registerAction('setAccentCustom', function (el) { w.setAccentCustom(el.value); });
  registerAction('setBackgroundDark', function (el) { w.setBackgroundDark(el.value); });
  registerAction('setBackgroundLight', function (el) { w.setBackgroundLight(el.value); });
  registerAction('resetBackgroundDark', function () { w.resetBackgroundDark(); });
  registerAction('resetBackgroundLight', function () { w.resetBackgroundLight(); });

  // Sidebar / Navigation
  registerAction('resetApp', function () { byLegacy('navigation', 'resetApp')(); });
  registerAction('toggleSidebar', function () { byLegacy('navigation', 'toggleSidebar')(); });
  registerAction('openNav', function (el, e, nav) { byLegacy('navigation', 'openNav')(nav); });
  registerAction('closeMorePopover', function () { byLegacy('navigation', 'closeMorePopover')(); });
  registerAction('openPromptTemplatesModal', function () { byLegacy('navigation', 'openPromptTemplatesModal')(); });
  registerAction('openSettings', function () { byLegacy('navigation', 'openSettings')(); });
  registerAction('openCheatsheet', function () { byLegacy('navigation', 'openCheatsheet')(); });
  registerAction('signOut', function () { byLegacy('navigation', 'signOut')(); });
  registerAction('toggleSidebarView', function (el, e, view) { w.toggleSidebarView(view); });
  registerAction('openLibraryUpload', function () { w.openLibraryUpload(); });
  registerAction('switchLibraryTab', function (el, e, tab) { byLegacy('workspace', 'switchLibraryTab')(tab); });
  registerAction('openCreateProject', function () { byLegacy('workspace', 'openCreateProject')(); });
  registerAction('openCreateScheduledTask', function () { byLegacy('scheduled', 'openCreateScheduledTask')(); });
  registerAction('openPluginMarketplace', function () { w.openPluginMarketplace(); });
  registerAction('filterLibrary', function (el) { byLegacy('workspace', 'filterLibrary')(el.value); });
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

  registerAction('startSession', function (el, e) {
    if (e && e.type === 'keydown') e.preventDefault();
    if (!el.classList.contains('active') && typeof w.toggleSpeechInput === 'function') {
      w.toggleSpeechInput('topic');
      return;
    }
    w.startSession();
  });
  registerAction('handleSendClick', function (el) {
    if (!el.classList.contains('active') &&
        !el.classList.contains('chat-stop') &&
        !el.classList.contains('agent-stop') &&
        typeof w.toggleSpeechInput === 'function') {
      w.toggleSpeechInput('chat');
      return;
    }
    w.handleSendClick();
  });
  registerAction('toggleSpeechInput', function (el, e, surface) {
    if (typeof w.toggleSpeechInput === 'function') w.toggleSpeechInput(surface || 'topic');
  });
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

  registerAction('toggleEffortPicker', function (el) {
    if (typeof w.toggleEffortPicker === 'function') w.toggleEffortPicker(el);
  });
  registerAction('setReasoningEffort', function (el, e, level) {
    if (typeof w.setReasoningEffort === 'function') w.setReasoningEffort(level);
  });
  registerAction('openFindInSession', function () { w.openFindInSession(); });
  registerAction('closeFindInSession', function () { w.closeFindInSession(); });
  registerAction('onFindInput', function (el) { w.onFindInput(el.value); });
  registerAction('onFindKey', function (el, e) { w.onFindKey(e); });
  registerAction('findNext', function () { w.findNext(); });
  registerAction('findPrev', function () { w.findPrev(); });

  // Share
  registerAction('openShareModal', function () { byLegacy('messages', 'openShareModal')(); });
  registerAction('closeShareModal', function () { byLegacy('share', 'closeShareModal')(); });
  registerAction('selectShareVis', function (el, e, vis) { byLegacy('share', 'selectShareVis')(vis); });
  registerAction('copyShareLink', function () { byLegacy('share', 'copyShareLink')(); });
  registerAction('revokeShareLink', function () { byLegacy('share', 'revokeShareLink')(); });
  registerAction('createShareLink', function () { byLegacy('share', 'createShareLink')(); });

  // Profile
  registerAction('closeProfile', function () { byLegacy('navigation', 'closeProfile')(); });
  registerAction('setLang', function (el, e, lang) { byLegacy('profile', 'setLang')(lang); });
  registerAction('toggleProfileWebSearch', function () { byLegacy('profile', 'toggleProfileWebSearch')(); });
  registerAction('openUsageModal', function () { byLegacy('navigation', 'openUsageModal')(); });
  registerAction('openStorageModal', function () { byLegacy('navigation', 'openStorageModal')(); });
  registerAction('confirmClearCache', function () { byLegacy('profile', 'confirmClearCache')(); });
  registerAction('confirmClearSettings', function () { byLegacy('profile', 'confirmClearSettings')(); });
  registerAction('confirmDeleteAccount', function () { byLegacy('profile', 'confirmDeleteAccount')(); });
  registerAction('saveProfileName', function (el) { byLegacy('profile', 'saveProfileName')(el.value); });
  registerAction('onCustomInstructionsChange', function () { byLegacy('profile', 'onCustomInstructionsChange')(); });

  // Cmd-K
  registerAction('closeCmdK', function () { byLegacy('cmdK', 'closeCmdK')(); });
  registerAction('onCmdKInput', function (el) { byLegacy('cmdK', 'onCmdKInput')(el.value); });
  registerAction('onCmdKKey', function (el, e) { byLegacy('cmdK', 'onCmdKKey')(e); });
  registerAction('openCmdK', function () { byLegacy('cmdK', 'openCmdK')(); });

  registerAction('closeConfirm', function () { w.closeConfirm(); });

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
  registerAction('composeAction', function () { byLegacy('composer', 'composeAction')(); });
  registerAction('researchAction', function () { byLegacy('composer', 'researchAction')(); });

  // Others
  registerAction('openKnowledge', function () { w.openKnowledge(); });
  registerAction('closeUsageModal', function () { byLegacy('navigation', 'closeUsageModal')(); });
  registerAction('openProfile', function () { byLegacy('navigation', 'openProfile')(); });

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
    } else if (el.getAttribute('data-action-arg') != null) {
      /* Fallback to data-action-arg attribute when the action name
         (e.g. "setAccentColor") doesn't carry an inline :arg token.
         Buttons using separate data-action-arg keep the HTML declarative
         while still getting the right argument through. */
      var dtArg = resolveArg(el.getAttribute('data-action-arg'), el, event);
      handler(el, event, dtArg);
    } else {
      handler(el, event);
    }
  }
  return handled;
}

// Walk up from the event target looking for either the shared data-action
// attribute or the action dedicated to this event type. Most form controls
// use data-action-input / data-action-keydown without a shared data-action.
function findActionTarget(target, eventType) {
  var perEventAttr = eventType ? 'data-action-' + eventType : null;
  while (target && target !== document.body) {
    if (target.dataset && (
      target.dataset.action ||
      (perEventAttr && target.hasAttribute(perEventAttr))
    )) return target;
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
  var target = findActionTarget(event.target, eventType);
  if (!target) return;
  var selfOnly = target.getAttribute('data-action-self-only') === 'true';
  if (selfOnly && event.target !== target) return;
  var w = window;
  var guard = target.getAttribute('data-action-guard');
  if (!resolveGuard(guard, w)) return;
  var keysSpec = target.getAttribute('data-action-' + eventType + '-keys')
    || target.getAttribute('data-action-keys');
  if (!matchesKeys(event, keysSpec)) return;
  var perEventAction = target.getAttribute('data-action-' + eventType);
  var actionStr = perEventAction && perEventAction !== 'true' ? perEventAction : null;
  // The generic data-action attribute only fires for click/submit. Firing it
  // on focus/input/keydown/change double-dispatched handlers: a mousedown
  // focuses the button, the focus event ran the action early, and the DOM
  // mutated before the real click landed (e.g. confirm OK resolving false).
  if (!actionStr && (eventType === 'click' || eventType === 'submit' || perEventAction === 'true')) {
    actionStr = target.dataset.action;
  }
  if (actionStr) runActionChain(target, event, actionStr, eventType);
}

// Set up the single delegation listener
function installDelegate() {
  if (document.__socratesDelegateInstalled) return;
  document.__socratesDelegateInstalled = true;

  buildActionMap();

  // P_send-race — pressing the send/start button must not steal focus from
  // the composer editor on pointerdown: the blur-driven `:has(:focus)`
  // collapse re-lays-out the footer mid-click and moves the button out from
  // under the pointer, so mouseup lands elsewhere and the click (the actual
  // send) never fires — the user saw only the collapse "morph".
  // preventDefault() keeps the editor focused through the click;
  // submitChatMessage then blurs explicitly (blurAfterSend), so the send
  // and the collapse animation start in the same interaction frame.
  document.body.addEventListener('pointerdown', function (e) {
    var btn = e.target && e.target.closest && e.target.closest('.send-btn, .start-btn');
    if (btn) e.preventDefault();
  });

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
