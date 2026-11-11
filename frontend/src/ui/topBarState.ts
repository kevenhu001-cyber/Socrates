
function resolveDocument(doc?: Document | null) {
  return doc || (typeof document !== 'undefined' ? document : null);
}

export function setConversationChrome(active: boolean, doc?: Document | null) {
  /* React owns which landing controls are available. Mirror conversation
     visibility synchronously without overriding a control whose own
     data-visible contract keeps it hidden (incognito now lives in More). */
  const d = resolveDocument(doc);
  if (!d) return;

  const desktopActions = d.querySelectorAll<HTMLElement>('.chat-top-bar .btn-group .icon-btn, .chat-top-bar .btn-group .start-btn');
  desktopActions.forEach(function (element) {
    element.style.display = active ? '' : 'none';
  });

  const landingControls = d.querySelectorAll<HTMLElement>('#mobileIncognitoBtn');
  landingControls.forEach(function (element) {
    element.style.display = active || element.dataset.visible === 'false' ? 'none' : '';
  });

}
