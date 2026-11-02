import { configureMountRegistry, runMountRegistry, type MountRegistryOptions } from './lib/boot/registry';
import { mountRegistryList } from './lib/boot/specs';
import { mountAssistantTurn, releaseAssistantTurns } from './tool-run/mountTurn';
import { registerAssistantTurnRenderer } from '../ui/assistantTurnRenderer';
import { publishReactChatRuntime } from '../ui/reactBridge';
import { showMountRecovery } from './ui/mountRecovery';
import { i18n } from './legacy/gateway';
import { preloadAssistantTurn } from './tool-run/LazyAssistantTurn';
import { reportSwallow } from '../util/reportSwallow.ts';

const RECOVERY_MESSAGES: Record<string, [string, string]> = {
  'sidebar-nav': ['boot.navigationUnavailable', 'The navigation could not load.'],
  'sidebar-chrome': ['boot.navigationUnavailable', 'The navigation could not load.'],
  'composer-shell': ['boot.composerUnavailable', 'The message editor could not load. Your saved draft has not been changed.'],
  'top-bar': ['boot.headerUnavailable', 'The conversation controls could not load.'],
  'msg-list': ['boot.messagesUnavailable', 'The conversation could not load. Your messages have not been changed.'],
};

const mountOptions: MountRegistryOptions = {
  onFailure: (failure) => {
    const message = RECOVERY_MESSAGES[failure.spec.label];
    if (message) return showMountRecovery(failure, i18n(...message), i18n('error.retry', 'Try again'), message[0]);
  },
};

export function bootstrapReactCompatibilityRuntime(): void {
  registerAssistantTurnRenderer({ mount: mountAssistantTurn, releaseAll: releaseAssistantTurns });
  publishReactChatRuntime({ type: 'state-synced', reason: 'react-bootstrap' });
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
    /* RN-13 — the assistant turn renderer left the entry closure; fetch it
       once the authenticated shell is up so the first answer (or a restored
       session) does not wait on it. */
    const warm = () => { preloadAssistantTurn().catch((error: unknown) => reportSwallow(error, 'react:preload-assistant-turn')); };
    if (typeof window.requestIdleCallback === 'function') window.requestIdleCallback(warm, { timeout: 1500 });
    else window.setTimeout(warm, 1);
  };
}
