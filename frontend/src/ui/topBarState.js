function resolveDocument(doc) {
  return doc || (typeof document !== 'undefined' ? document : null);
}

export function setConversationChrome(active, doc) {
  /* P_mobile-topbar — the mobile mode switcher (#mobileMode) and the
     incognito toggle (#mobileIncognitoBtn) live in the new top-bar, not
     in the legacy .chat-top-bar selectors below. They are only useful
     while the user is composing the first message (topic-setup screen);
     once a conversation starts they should be hidden so the chat-view
     header reads cleanly. Both are also hidden by the canonical
     body[data-conversation-active="true"] rule in styles/legacy/
     00-foundations.css; this inline pass is the same belt-and-braces
     fallback syncConversationActive() applies. */
  var d = resolveDocument(doc);
  if (!d) return;

  var desktopActions = d.querySelectorAll('.chat-top-bar .btn-group .icon-btn, .chat-top-bar .btn-group .start-btn');
  desktopActions.forEach(function (element) {
    element.style.display = active ? '' : 'none';
  });

  var landingControls = d.querySelectorAll('#mobileMode, #mobileIncognitoBtn');
  landingControls.forEach(function (element) {
    element.style.display = active ? 'none' : '';
  });

  var view = d.defaultView || (typeof window !== 'undefined' ? window : null);
  if (view && typeof view.syncConversationActive === 'function') {
    try { view.syncConversationActive(); } catch (_) {}
  }
}

export function toggleChatTopBarEls(show, doc) {
  setConversationChrome(show, doc);
}
