import { setConversationChrome } from './topBarState.js';
import { swapComposerSurface } from '../react/composer-input/controller.ts';
import { reportSwallow } from '../util/reportSwallow.ts';

export const CORE_VIEW_IDS = ['topicSetup', 'diagnosticView', 'chatView'];

export const MAIN_PAGE_IDS = [
  'libraryPanel',
  'spacesPanel',
  'scheduledPanel',
  'pluginsPanel',
  'imagesPanel',
  'assistantsPanel',
  'sitesPanel',
  'adminPanel',
  'examView',
];

const WORKSPACE_PAGE_IDS = new Set(MAIN_PAGE_IDS.filter(function (id) { return id !== 'examView'; }));
const CONVERSATION_CHROME_VIEWS = new Set(['chatView', 'examView']);
const VIEW_IDS = new Set(CORE_VIEW_IDS.concat(MAIN_PAGE_IDS));

function resolveDocument(doc) {
  return doc || (typeof document !== 'undefined' ? document : null);
}

function setHidden(doc, ids, hidden) {
  ids.forEach(function (id) {
    var element = doc.getElementById(id);
    if (element) element.classList.toggle('hidden', hidden);
  });
}

function resetShellState(doc) {
  doc.body.classList.remove('workspace-active', 'plugins-active', 'library-active', 'admin-active', 'exam-active');
  var pluginTabs = doc.getElementById('pluginWorkspaceTabs');
  if (pluginTabs) pluginTabs.hidden = true;
  doc.querySelectorAll("[data-exam-only='true']").forEach(function (element) {
    element.classList.add('hidden');
  });
}

/* #chatPage gates the whole chat surface (transcript + composer). The
   controller keeps it in the same hidden state as #chatView so same-task
   layout reads stay correct; layoutStateMirror re-syncs it for writers
   that toggle #chatView directly (legacy paths and test hooks). */
function syncChatPageGate(d) {
  var chatPage = d.getElementById('chatPage');
  var chatView = d.getElementById('chatView');
  if (chatPage && chatView) {
    chatPage.classList.toggle('hidden', chatView.classList.contains('hidden'));
  }
}

export function hideCoreViews(doc) {
  var d = resolveDocument(doc);
  if (!d) return;
  setHidden(d, CORE_VIEW_IDS, true);
  syncChatPageGate(d);
  setConversationChrome(false, d);
}

export function getVisibleCoreView(doc) {
  var d = resolveDocument(doc);
  if (!d) return 'topicSetup';
  for (var i = 0; i < CORE_VIEW_IDS.length; i++) {
    var id = CORE_VIEW_IDS[i];
    var element = d.getElementById(id);
    if (element && !element.classList.contains('hidden')) return id;
  }
  return 'topicSetup';
}

/* P_composer-single — park the single composer shell in the slot that
   belongs to the incoming view, synchronously inside the same task as
   the hidden-class swap so layout settles once. The editor, draft,
   chips and focus travel with the node (React stays mounted on the
   editor host inside it); only the topic/chat slots ever host it —
   every other view leaves a hidden ancestor around it, exactly like
   the two shells behaved before the merge. Returns the surface the
   shell now serves ('topic' | 'chat'). */
var composerParkObserverInstalled = false;
function ensureComposerParkObserver(d) {
  /* Backstop for flip paths that toggle view classes directly instead
     of going through activateMainView (legacy writers, test hooks):
     whenever core-view visibility settles, re-park the shell. Filtered
     to class attributes of the three core views; the move itself
     touches no view classes, so this cannot loop. Mutual with the
     direct call below — whichever runs first wins, the other no-ops. */
  if (composerParkObserverInstalled || !d || typeof MutationObserver !== 'function') return;
  var views = ['topicSetup', 'chatView', 'diagnosticView'].map(function (id) { return d.getElementById(id); });
  if (!views[0] || !views[1]) return;
  composerParkObserverInstalled = true;
  var schedulePark = function () {
    var chatVisible = views[1] && !views[1].classList.contains('hidden');
    var topicVisible = views[0] && !views[0].classList.contains('hidden');
    if (chatVisible) placeComposerForView('chatView', d);
    else if (topicVisible) placeComposerForView('topicSetup', d);
  };
  var mo = new MutationObserver(function () { schedulePark(); });
  views.forEach(function (el) {
    if (el) mo.observe(el, { attributes: true, attributeFilter: ['class'] });
  });
}
export function placeComposerForView(viewId, doc) {
  var d = resolveDocument(doc);
  try { ensureComposerParkObserver(d); } catch (e) { reportSwallow(e, 'mainViewController.ensureComposerParkObserver'); /* observer is best effort */ }
  if (viewId !== 'topicSetup' && viewId !== 'chatView') return 'topic';
  var shell = d && d.getElementById('composerInputWrap');
  var surface = viewId === 'chatView' ? 'chat' : 'topic';
  if (d && shell) {
    var slotId = surface === 'chat' ? 'chatComposerSlot' : 'topicComposerSlot';
    var slot = d.getElementById(slotId);
    if (slot && shell.parentNode !== slot) {
      /* Park the live draft under the surface being left and install the
         arriving surface's draft BEFORE moving, so the first post-flip
         paint is already correct (mirrors the two-box behaviour where
         each surface kept its own text). */
      try {
        var prev = shell.parentNode && shell.parentNode.id === 'chatComposerSlot' ? 'chat' : 'topic';
        swapComposerSurface(prev, surface);
      } catch (e) { reportSwallow(e, 'mainViewController.stashComposerSurface'); /* stash is best effort; the move still lands */ }
      slot.appendChild(shell);
      try {
        d.dispatchEvent(new CustomEvent('socrates:composer-surface', { detail: { surface: surface } }));
      } catch (e) { reportSwallow(e, 'mainViewController.announceViewSwap'); /* event is advisory; the DOM move already landed */ }
    }
  }
  return surface;
}

export function activateMainView(viewId, doc) {
  var d = resolveDocument(doc);
  if (!d || !VIEW_IDS.has(viewId)) return false;

  setHidden(d, CORE_VIEW_IDS, true);
  setHidden(d, MAIN_PAGE_IDS, true);
  resetShellState(d);

  var target = d.getElementById(viewId);
  if (target) target.classList.remove('hidden');
  syncChatPageGate(d);
  /* The single composer shell rides along: park it in the incoming view's
     slot (and swap the per-surface drafts) in the same task as the
     hidden-class swap, so the flip paints once with the right box. */
  try { placeComposerForView(viewId, d); } catch (e) { reportSwallow(e, 'mainViewController.placeComposerForView'); /* composer is best effort here */ }

  var mainInner = d.getElementById('mainInner');
  if (mainInner) mainInner.classList.toggle('hidden', viewId === 'examView');

  if (WORKSPACE_PAGE_IDS.has(viewId)) {
    d.body.classList.add('workspace-active');
    d.body.classList.toggle('plugins-active', viewId === 'pluginsPanel');
    d.body.classList.toggle('library-active', viewId === 'libraryPanel');
    d.body.classList.toggle('admin-active', viewId === 'adminPanel');
    var pluginTabs = d.getElementById('pluginWorkspaceTabs');
    if (pluginTabs) pluginTabs.hidden = viewId !== 'pluginsPanel';
  } else if (viewId === 'examView') {
    d.body.classList.add('exam-active');
  }

  setConversationChrome(CONVERSATION_CHROME_VIEWS.has(viewId), d);
  return Boolean(target);
}

/* Test hook — e2e drives the production flip path (hidden swap +
   composer move) without re-implementing it. */
if (typeof window !== 'undefined') {
  window.__testActivateMainView = function (viewId) { return activateMainView(viewId, document); };
}

/* Install the park backstop at document readiness (same DCL pattern as
   attachments/render.js autoWire): flips that happen before the first
   activateMainView call — including test scaffolding that toggles view
   classes directly — still park the shell. Module evaluation may run
   before the DOM exists, so DCL (not import time) is the trigger. */
function installComposerParkObserver() {
  try {
    ensureComposerParkObserver(typeof document !== 'undefined' ? document : null);
  } catch (e) { reportSwallow(e, 'mainViewController.disconnectComposerParkObserver'); /* observer is best effort */ }
}
if (typeof window !== 'undefined') {
  window.addEventListener('DOMContentLoaded', installComposerParkObserver);
  try {
    if (document.readyState !== 'loading') installComposerParkObserver();
  } catch (e) { reportSwallow(e, 'mainViewController.hideCoreViews'); /* covered by the listener above */ }
}
