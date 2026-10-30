
import { reportSwallow } from '../util/reportSwallow.ts';

function resolveDocument(doc?: Document | null) {
  return doc || (typeof document !== 'undefined' ? document : null);
}

export function setConversationChrome(active: boolean, doc?: Document | null) {
  /* P_mobile-topbar — the mobile mode switcher (#mobileMode) and the
     incognito toggle (#mobileIncognitoBtn) live in the new top-bar, not
     in the legacy .chat-top-bar selectors below. They are only useful
     while the user is composing the first message (topic-setup screen);
     once a conversation starts they should be hidden so the chat-view
     header reads cleanly. Both are also hidden by the canonical
     body[data-conversation-active="true"] rule in styles/legacy/
     00-foundations.css; this inline pass is the same belt-and-braces
     fallback syncConversationActive() applies. */
  const d = resolveDocument(doc);
  if (!d) return;

  const desktopActions = d.querySelectorAll<HTMLElement>('.chat-top-bar .btn-group .icon-btn, .chat-top-bar .btn-group .start-btn');
  desktopActions.forEach(function (element) {
    element.style.display = active ? '' : 'none';
  });

  const landingControls = d.querySelectorAll<HTMLElement>('#mobileMode, #mobileIncognitoBtn');
  landingControls.forEach(function (element) {
    element.style.display = active ? 'none' : '';
  });

  const view = (d.defaultView || (typeof window !== 'undefined' ? window : null)) as (Window & { syncConversationActive?: () => void }) | null;
  if (view && typeof view.syncConversationActive === 'function') {
    try { view.syncConversationActive(); } catch (error) { reportSwallow(error, 'ui/topBarState.ts:30'); }
  }
}
