/* ui/layoutStateMirror.js — mirror a few shell visibility states onto <html>.
 *
 * Why this exists (P_has-invalidation)
 * ------------------------------------
 * A handful of layout rules used ancestor-level :has() to react to shell
 * state, e.g.
 *
 *   #mainContent:has(> #chatView:not(.hidden)) > #mainInner { display:none }
 *   .main:has(#topicSetup:not(.hidden)) .main-bg { opacity:.1 }
 *
 * Blink marks every ancestor that is the subject of such a rule as "affected
 * by :has", and then re-evaluates the rule — and re-styles the subtree under
 * it — on EVERY node inserted or removed anywhere below it. Because #msgList
 * lives under #mainContent/.main/#appShell/body, each streamed token and every
 * history row committed on a session switch triggered a style recalc of the
 * whole shell (~2 400 elements, sidebar included). The 2026-09-27 trace of a
 * send inside a 200-message session measured 230 such recalcs = 2.4 s of main
 * thread at 4x CPU throttle; an in-page probe put it at 23 ms per inserted node
 * unthrottled vs ~3 ms with these rules gone.
 *
 * The rules now key off attributes on <html> instead. An attribute change on
 * the root only invalidates the elements the matching rules name (all by id),
 * so the cost is paid once per state change instead of once per DOM insertion.
 *
 * Timing: the mirror runs from a MutationObserver (end of the current task,
 * before the next paint) and from focusin/focusout (synchronous). #msgList's
 * display is gated by #chatPage.hidden, which mainViewController toggles in
 * the same task as #chatView — so synchronous callers stay correct, and the
 * sync below re-applies it for writers that bypass the controller.
 */

var MIRRORS = [
  { id: 'chatView', attr: 'data-chat-view-open', on: function (el) { return !el.classList.contains('hidden'); } },
  { id: 'topicSetup', attr: 'data-topic-setup-open', on: function (el) { return !el.classList.contains('hidden'); } },
  { id: 'pluginsPanel', attr: 'data-plugins-panel-open', on: function (el) { return !el.classList.contains('hidden'); } },
  { id: 'sidebar', attr: 'data-sidebar-collapsed', on: function (el) { return el.classList.contains('collapsed'); } },
];

function setFlag(root, attr, value) {
  if (value) {
    if (root.getAttribute(attr) !== 'true') root.setAttribute(attr, 'true');
  } else if (root.hasAttribute(attr)) {
    root.removeAttribute(attr);
  }
}

/** Sync every mirrored flag from the live DOM. Exported for tests. */
export function syncLayoutStateMirror(doc) {
  var d = doc || (typeof document !== 'undefined' ? document : null);
  if (!d || !d.documentElement) return;
  var root = d.documentElement;
  for (var i = 0; i < MIRRORS.length; i++) {
    var m = MIRRORS[i];
    var el = d.getElementById(m.id);
    setFlag(root, m.attr, !!el && m.on(el));
  }
  var wrap = d.getElementById('topicInputWrap');
  setFlag(root, 'data-topic-input-focus', !!wrap && !!d.activeElement && wrap.contains(d.activeElement));
  /* Compat resync: legacy/test writers may toggle #chatView.hidden without
     going through mainViewController — keep #chatPage's gate aligned. */
  var chatView = d.getElementById('chatView');
  var chatPage = d.getElementById('chatPage');
  if (chatView && chatPage) {
    chatPage.classList.toggle('hidden', chatView.classList.contains('hidden'));
  }
}

var installed = false;

export function installLayoutStateMirror(doc) {
  var d = doc || (typeof document !== 'undefined' ? document : null);
  if (!d || installed) return;
  installed = true;
  var root = d.documentElement;
  syncLayoutStateMirror(d);
  if (typeof MutationObserver === 'function') {
    var mo = new MutationObserver(function () { syncLayoutStateMirror(d); });
    for (var i = 0; i < MIRRORS.length; i++) {
      var el = d.getElementById(MIRRORS[i].id);
      if (el) mo.observe(el, { attributes: true, attributeFilter: ['class'] });
    }
  }
  /* :focus-within replacement for #topicInputWrap. focusout fires before the
     new target is focused, so read relatedTarget rather than activeElement. */
  var wrap = d.getElementById('topicInputWrap');
  if (wrap) {
    wrap.addEventListener('focusin', function () { setFlag(root, 'data-topic-input-focus', true); });
    wrap.addEventListener('focusout', function (e) {
      var next = e && e.relatedTarget;
      setFlag(root, 'data-topic-input-focus', !!next && wrap.contains(next));
    });
  }
}
