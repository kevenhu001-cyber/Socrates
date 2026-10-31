
function resolveDocument(doc?: Document | null) {
  return doc || (typeof document !== 'undefined' ? document : null);
}

export function setConversationChrome(active: boolean, doc?: Document | null) {
  /* The incognito toggle is only useful while composing the first message;
     hide it when the chat-view header takes over. The canonical body state
     also drives the corresponding CSS visibility rule. */
  const d = resolveDocument(doc);
  if (!d) return;

  const desktopActions = d.querySelectorAll<HTMLElement>('.chat-top-bar .btn-group .icon-btn, .chat-top-bar .btn-group .start-btn');
  desktopActions.forEach(function (element) {
    element.style.display = active ? '' : 'none';
  });

  const landingControls = d.querySelectorAll<HTMLElement>('#mobileIncognitoBtn');
  landingControls.forEach(function (element) {
    element.style.display = active ? 'none' : '';
  });

}
