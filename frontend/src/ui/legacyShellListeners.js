// Direct listeners for the few static shell controls that sit outside React
// roots. This is intentionally an explicit element map, not an action-string
// interpreter or a document-wide event dispatcher.
import { readComposerSurface } from '../react/composer-input/controller.ts';

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
  click('mobileNewChatBtn', actions.startNewChat);
  click('findBtn', actions.openFind);
  click('shareBtn', actions.openShare);
  click('apiSettingsBtn', actions.openSettings);
  bind(document, 'socrates:open-settings', actions.openSettings);
  click('composerPrimaryBtn', () => {
    /* P_composer-single — one primary control for the single shell.
       P_composer-primary-split (2026-10-04) — the primary is submit-only:
       a draft sends (landing starts a session, chat sends) and a live turn
       falls through to sendMessage → handleSendClick, whose wrapper aborts
       it. The former "empty routes to voice input" branch is gone; voice
       lives on #composerMicBtn below. Keeping both would leave two controls
       calling the same toggleSpeechInput(surface) with the same accessible
       name at both breakpoints. */
    const button = byId('composerPrimaryBtn');
    if (button && button.disabled) return;
    let surface = 'topic';
    try { surface = readComposerSurface(); } catch (_) { /* default above */ }
    if (surface === 'chat') {
      actions.sendMessage();
      return;
    }
    actions.startSession();
  });
  click('composerMicBtn', () => {
    let surface = 'topic';
    try { surface = readComposerSurface(); } catch (_) { /* default above */ }
    if (typeof window.toggleSpeechInput === 'function') window.toggleSpeechInput(surface);
  });
  click('mobileModeTrigger', actions.toggleMobileMode);
  click('sidebarSearchBtn', (event) => {
    const sidebar = byId('sidebar');
    const input = byId('sidebarSearch');
    const button = event.currentTarget;
    const open = !sidebar?.classList.contains('search-open');
    sidebar?.classList.toggle('search-open', open);
    button?.setAttribute('aria-expanded', String(open));
    if (open) requestAnimationFrame(() => input?.focus());
  });

  bind(byId('composerToolsBtn'), 'click', (event) => {
    let surface = 'topic';
    try { surface = readComposerSurface(); } catch (_) { /* default above */ }
    actions.toggleComposerTools(event.currentTarget, surface);
  });
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

  /* Recents header affordances (chatgpt.com drawer): compose starts a new
     chat; ··· opens the Storage modal, which lists archived sessions. */
  click('recentsNewBtn', actions.startNewChat);
  click('recentsMoreBtn', () => {
    try { window.__socratesLegacy?.navigation?.openStorageModal?.(); } catch (_) { /* best effort */ }
  });

  return function unmountLegacyShellListeners() {
    cleanups.splice(0).forEach((cleanup) => cleanup());
    mounted = false;
  };
}
