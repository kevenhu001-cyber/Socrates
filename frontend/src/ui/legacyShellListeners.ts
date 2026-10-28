// Listeners for the shell controls that sit outside React roots. The map is
// explicit — no action-string interpreter — but the topbar controls are
// dispatched from one document-level click listener rather than bound to the
// node: the header chrome is React-owned (src/react/topbar), so the static
// nodes this module would have bound at boot are replaced moments later and
// a direct listener would be dropped with them.
import { readComposerSurface } from '../composer/controller.ts';

let mounted = false;

interface LegacyShellActions {
  toggleSidebar: () => void;
  startNewChat: () => void;
  toggleIncognito: () => void;
  openFind: () => void;
  openShare: () => void;
  openSettings: () => void;
  startSession: () => void;
  sendMessage: () => void;
  toggleComposerTools: (target: HTMLElement | null, surface: string) => void;
  toggleEffort: (target: HTMLElement | null) => void;
  selectMode: (mode: string | undefined) => void;
  toggleMobileMode: () => void;
  searchRecents: (query: string) => void;
  switchTab: (tab: string) => void;
  toggleSidebarView: (view: string) => void;
}

declare global {
  interface Window {
    toggleSpeechInput?: (surface: string) => unknown;
  }
}

type ShellClickAction = (element: HTMLElement, event: Event) => void;

function guardComposerReentry(button: HTMLButtonElement | null, streaming: boolean): void {
  if (streaming || !button?.classList.contains('active')) return;
  button.style.pointerEvents = 'none';
  const raf = typeof requestAnimationFrame === 'function' ? requestAnimationFrame : null;
  if (raf) raf(() => { button.style.pointerEvents = ''; });
  else setTimeout(() => { button.style.pointerEvents = ''; }, 16);
}

export function mountLegacyShellListeners(actions: LegacyShellActions): () => void {
  if (mounted || typeof document === 'undefined') return () => undefined;
  mounted = true;
  const cleanups: Array<() => void> = [];
  const bind = (element: EventTarget | null, type: string, listener: EventListener) => {
    if (!element || typeof listener !== 'function') return;
    element.addEventListener(type, listener);
    cleanups.push(() => element.removeEventListener(type, listener));
  };
  const byId = (id: string): HTMLElement | null => document.getElementById(id);
  const click = (id: string, action: EventListener) => bind(byId(id), 'click', action);

  /* Delegated controls: selector → action, first match wins. `actions` run
     with the matched element, which stands in for `event.currentTarget`. */
  const delegated: Array<{ selector: string; action: ShellClickAction }> = [];
  const onShellClick = (selector: string, action: ShellClickAction) => {
    delegated.push({ selector, action });
  };
  const dispatchShellClick = (event: Event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    for (const entry of delegated) {
      const element = target.closest(entry.selector);
      if (!element) continue;
      entry.action(element as HTMLElement, event);
      return;
    }
  };
  bind(document, 'click', dispatchShellClick as EventListener);

  onShellClick('#sidebarOpenBtn', () => actions.toggleSidebar());
  onShellClick('#mobileIncognitoBtn', () => actions.toggleIncognito());
  onShellClick('#mobileNewChatBtn', () => actions.startNewChat());
  onShellClick('#findBtn', () => actions.openFind());
  onShellClick('#shareBtn', () => actions.openShare());
  onShellClick('#apiSettingsBtn', () => actions.openSettings());
  bind(document, 'socrates:open-settings', actions.openSettings);
  click('composerPrimaryBtn', (() => {
    const button = byId('composerPrimaryBtn') as HTMLButtonElement | null;
    if (button && button.disabled) return;
    let surface = 'topic';
    try { surface = readComposerSurface(); } catch (_) { /* default above */ }
    const streaming = button?.dataset.stop === '1' || button?.classList.contains('chat-stop') || button?.classList.contains('agent-stop');
    /* P_composer-dblclick-guard — a fast double-click on the send
       button used to fire the full click chain twice (addMessage →
       session/append-message → addStreamingMessage → precreate →
       playSendGlyph). The second click is a re-entrancy that doesn't
       produce a usable turn but still pays every cost. Set
       pointer-events:none for one animation frame so the second
       synthetic click cannot land on the same button; the next rAF
       restores it after the React commit. */
    guardComposerReentry(button, Boolean(streaming));
    /* P_composer-primary-split — the primary is submit-only. It used to
       start dictation when the draft was empty, which gave the composer two
       controls that announced the same action ("Voice input"); the
       microphone is the one and only dictation entry point now. */
    if (surface === 'chat') {
      actions.sendMessage();
      return;
    }
    actions.startSession();
  }) as EventListener);
  click('composerMicBtn', () => {
    let surface = 'topic';
    try { surface = readComposerSurface(); } catch (_) { /* default above */ }
    if (typeof window.toggleSpeechInput === 'function') window.toggleSpeechInput(surface);
  });
  onShellClick('#mobileModeTrigger', () => actions.toggleMobileMode());
  onShellClick('#mobileConfigBtn', () => {
    byId('mobileMode')?.setAttribute('data-open', 'false');
    byId('mobileModeTrigger')?.setAttribute('aria-expanded', 'false');
    actions.toggleEffort(byId('mobileModeTrigger'));
  });
  click('sidebarSearchBtn', ((event: Event) => {
    const sidebar = byId('sidebar');
    const input = byId('sidebarSearch');
    const button = event.currentTarget as HTMLElement | null;
    const open = !sidebar?.classList.contains('search-open');
    sidebar?.classList.toggle('search-open', open);
    button?.setAttribute('aria-expanded', String(open));
    if (open) requestAnimationFrame(() => input?.focus());
  }) as EventListener);

  bind(byId('composerToolsBtn'), 'click', ((event: Event) => {
    let surface = 'topic';
    try { surface = readComposerSurface(); } catch (_) { /* default above */ }
    actions.toggleComposerTools(event.currentTarget as HTMLElement | null, surface);
  }) as EventListener);
  document.querySelectorAll<HTMLElement>('.effort-trigger').forEach((element) => {
    bind(element, 'click', () => actions.toggleEffort(element));
  });
  /* The top-bar Chat/Tutor pill was removed; the dropdown items in
     #mobileModeMenu are the remaining in-shell mode affordance. They live in
     the React header, so they are matched by selector at click time. */
  onShellClick('#mobileModeMenu .mobile-mode-item[data-mode]', (element) => {
    actions.selectMode(element.dataset.mode);
  });

  const search = byId('sidebarSearch');
  bind(search, 'input', ((event: Event) => actions.searchRecents((event.currentTarget as HTMLInputElement).value)) as EventListener);
  bind(search, 'focus', () => actions.switchTab('recents'));
  click('tabKnowledge', () => actions.toggleSidebarView('knowledge'));
  click('tabMistakes', () => actions.toggleSidebarView('mistakes'));

  /* The React RecentsHeader owns compose and the organization menu. */

  return function unmountLegacyShellListeners() {
    cleanups.splice(0).forEach((cleanup) => cleanup());
    mounted = false;
  };
}
