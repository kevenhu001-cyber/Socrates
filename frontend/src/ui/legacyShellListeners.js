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
    const button = byId('composerPrimaryBtn');
    if (button && button.disabled) return;
    let surface = 'topic';
    try { surface = readComposerSurface(); } catch (_) { /* default above */ }
    const streaming = button?.dataset.stop === '1' || button?.classList.contains('chat-stop') || button?.classList.contains('agent-stop');
    if (button && !button.classList.contains('active') && !streaming) {
      window.toggleSpeechInput?.(surface);
      return;
    }
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
  click('mobileConfigBtn', () => {
    byId('mobileMode')?.setAttribute('data-open', 'false');
    byId('mobileModeTrigger')?.setAttribute('aria-expanded', 'false');
    actions.toggleEffort(byId('mobileModeTrigger'));
  });
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
  /* The top-bar Chat/Tutor pill was removed; the dropdown items in
     #mobileModeMenu are the remaining in-shell mode affordance. */
  document.querySelectorAll('#mobileModeMenu .mobile-mode-item[data-mode]').forEach((element) => {
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
