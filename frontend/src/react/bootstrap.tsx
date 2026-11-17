import { configureMountRegistry, runMountRegistry, type MountRegistryOptions } from './lib/boot/registry';
import { mountRegistryList } from './lib/boot/specs';
import { mountAssistantTurn, releaseAssistantTurns } from './tool-run/mountTurn';
import { registerAssistantTurnRenderer } from '../ui/assistantTurnRenderer';
import { publishReactChatRuntime } from '../ui/reactBridge';
import { mountBasicComposer } from './ui/composerRecovery';
import { showMountRecovery } from './ui/mountRecovery';
import { i18n } from './legacy/gateway';
import { preloadAssistantTurn } from './tool-run/LazyAssistantTurn';
import { reportSwallow } from '../util/reportSwallow.ts';
import { canReloadComposer, reloadWithComposerDrafts } from '../composer/reloadDrafts.ts';
import { isImportLoadError } from './lib/boot/retryImport';
import { mountOwnedRoot } from './lib/boot/ownedRoot';
import { createElement } from 'react';

/**
 * Experimental single-tree entry. It is only reachable when the document
 * ships a `#root` host; `index.html` currently does not, so production keeps
 * using the host registry below. Importing `App` lazily keeps the experimental
 * tree (and its component graph) out of the entry chunk until that switch happens.
 */
export function mountApp(container?: HTMLElement | null): boolean {
  const host = container || document.getElementById('root');
  if (!host) return false;
  void import('./App')
    .then(({ App }) => {
      if (host.isConnected) mountOwnedRoot(host, 'app', createElement(App));
    })
    .catch((error: unknown) => {
      reportSwallow(error, 'react/bootstrap.mountApp', 'invariant');
    });
  return true;
}

const RECOVERY_MESSAGES: Record<string, [string, string]> = {
  'sidebar-nav': ['boot.navigationUnavailable', 'The navigation could not load.'],
  'sidebar-chrome': ['boot.navigationUnavailable', 'The navigation could not load.'],
  'composer-shell': ['boot.composerUnavailable', 'You can keep writing in the basic editor. Retry to restore rich editing.'],
  'top-bar': ['boot.headerUnavailable', 'The conversation controls could not load.'],
  'msg-list': ['boot.messagesUnavailable', 'The conversation could not load. Your messages have not been changed.'],
};

const mountOptions: MountRegistryOptions = {
  onFailure: (failure) => {
    const message = RECOVERY_MESSAGES[failure.spec.label];
    if (!message) return;
    const isComposer = failure.spec.label === 'composer-shell';
    const releaseInput = isComposer ? mountBasicComposer(failure.host) : undefined;
    const reload = isComposer && isImportLoadError(failure.error) && canReloadComposer() ? {
      run: reloadWithComposerDrafts,
      label: i18n('boot.composerReload', 'Reload page and keep draft'),
      failureMessage: i18n('boot.composerReloadFailed', 'Could not save the draft for reload. You can keep editing here.'),
    } : undefined;
    const releaseNotice = showMountRecovery(failure, i18n(...message), i18n('error.retry', 'Try again'), message[0], reload);
    return () => { releaseInput?.(); releaseNotice(); };
  },
};

export function bootstrapReactCompatibilityRuntime(): void {
  registerAssistantTurnRenderer({ mount: mountAssistantTurn, releaseAll: releaseAssistantTurns });
  publishReactChatRuntime({ type: 'state-synced', reason: 'react-bootstrap' });
  const root = document.getElementById('root');
  if (root) {
    mountApp(root);
    return;
  }
  for (const id of ['newReplyPill', 'composerInputWrap']) {
    if (!document.getElementById(id)) throw new Error(`React mount target "#${id}" was not found.`);
  }
  configureMountRegistry(mountRegistryList());
  /* The app shell is hidden until authBoot resolves. Running the full
     registry here used to fetch every lazy overlay plus the TipTap editor
     while an unauthenticated visitor was still looking at the login gate.
     Keep only the lightweight sidebar nav and first-visit consent banner
     hydrated; mount the remaining app surfaces after auth reveals the shell. The
     registry is idempotent, so a second call only mounts hosts that were
     deferred. */
  runMountRegistry(document, { ...mountOptions, labels: new Set(['sidebar-nav', 'cookie-consent']) });
  const runtime = window as Window & {
    __socratesMountReactCompatibility?: () => void;
  };
  runtime.__socratesMountReactCompatibility = () => {
    runMountRegistry(document, mountOptions);
    warmAssistantTurnOnComposerIntent();
  };
}

/**
 * RN-13 — the assistant turn renderer left the entry closure. It used to be
 * preloaded on every authenticated idle boot, which added its chunk (tool
 * rows, evidence, visualization states) to readers who only opened the home
 * page. Start that fetch on the first sign of composer intent instead: by
 * the time the first message is sent the chunk is normally already parsed.
 */
function warmAssistantTurnOnComposerIntent(): void {
  const composerOwns = (target: EventTarget | null): boolean =>
    target instanceof Element
    && target.closest('#composerInputWrap, #composerRoot, #topicComposerSlot, #chatComposerSlot') !== null;
  const warm = (): void => {
    for (const type of COMPOSER_INTENT_EVENTS) document.removeEventListener(type, onIntent, true);
    preloadAssistantTurn().catch((error: unknown) => reportSwallow(error, 'react:preload-assistant-turn'));
  };
  const onIntent = (event: Event): void => {
    /* Modifier keys alone (Tab, Ctrl, …) are not intent to write. */
    if (event instanceof KeyboardEvent && MODIFIER_KEYS.has(event.key)) return;
    if (composerOwns(event.target)) warm();
  };
  for (const type of COMPOSER_INTENT_EVENTS) document.addEventListener(type, onIntent, true);
}

const COMPOSER_INTENT_EVENTS = ['pointerdown', 'focusin', 'keydown'] as const;
const MODIFIER_KEYS = new Set(['Shift', 'Control', 'Alt', 'Meta', 'Tab', 'CapsLock', 'Escape']);
