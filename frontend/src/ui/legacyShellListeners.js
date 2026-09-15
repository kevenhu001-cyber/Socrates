// Direct listeners for the few static shell controls that sit outside React
// roots. This is intentionally an explicit element map, not an action-string
// interpreter or a document-wide event dispatcher.

let mounted = false;

export function mountLegacyShellListeners(actions) {
  if (mounted || typeof document === 'undefined') return function () {};
  mounted = true;
  const cleanups = [];
  const bind = (element, type, listener) => {
    if (!element || typeof listener !== 'function') return;
    element.addEventListener(type, listener);
    cleanups.push(() => element.removeEventListener(type, listener));
  };
  const byId = (id) => document.getElementById(id);
  const click = (id, action) => bind(byId(id), 'click', action);

  click('sidebarOpenBtn', actions.toggleSidebar);
  click('mobileIncognitoBtn', actions.toggleIncognito);
  click('findBtn', actions.openFind);
  click('shareBtn', actions.openShare);
  click('apiSettingsBtn', actions.openSettings);
  bind(document, 'socrates:open-settings', actions.openSettings);
  click('startBtn', () => {
    /* Empty-topic voice input: the old document-wide data-action dispatcher
       routed a non-active start button to toggleSpeechInput('topic'); keep
       that behavior now that the button is bound directly. The dedicated
       mic button next to it is the same entry point — both route here. */
    const button = byId('startBtn');
    if (button && !button.classList.contains('active')
        && typeof window.toggleSpeechInput === 'function') {
      window.toggleSpeechInput('topic');
      return;
    }
    actions.startSession();
  });
  click('sendBtn', () => {
    /* The shared primary control is voice input while empty and send while a
       draft exists. This is identical on the landing and conversation
       surfaces, so moving between them never changes the control contract. */
    const button = byId('sendBtn');
    if (button && !button.classList.contains('active')
        && !button.classList.contains('chat-stop')
        && !button.classList.contains('agent-stop')
        && typeof window.toggleSpeechInput === 'function') {
      window.toggleSpeechInput('chat');
      return;
    }
    actions.sendMessage();
  });
  click('topicMobileMicBtn', () => {
    if (typeof window.toggleSpeechInput === 'function') window.toggleSpeechInput('topic');
  });
  click('chatMobileMicBtn', () => {
    if (typeof window.toggleSpeechInput === 'function') window.toggleSpeechInput('chat');
  });
  click('mobileModeTrigger', actions.toggleMobileMode);

  bind(byId('topicComposerToolsBtn'), 'click', (event) => actions.toggleComposerTools(event.currentTarget, 'topic'));
  bind(byId('chatComposerToolsBtn'), 'click', (event) => actions.toggleComposerTools(event.currentTarget, 'chat'));
  document.querySelectorAll('.effort-trigger').forEach((element) => {
    bind(element, 'click', () => actions.toggleEffort(element));
  });
  document.querySelectorAll('.app-mode-toggle, .mobile-mode-item').forEach((element) => {
    bind(element, 'click', () => actions.selectMode(element.dataset.mode));
  });

  const search = byId('sidebarSearch');
  bind(search, 'input', (event) => actions.searchRecents(event.currentTarget.value));
  bind(search, 'focus', () => actions.switchTab('recents'));
  click('tabKnowledge', () => actions.toggleSidebarView('knowledge'));
  click('tabMistakes', () => actions.toggleSidebarView('mistakes'));

  return function unmountLegacyShellListeners() {
    cleanups.splice(0).forEach((cleanup) => cleanup());
    mounted = false;
  };
}
