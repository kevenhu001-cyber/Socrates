import { installChatRuntimeBridge } from './chatRuntime.bridge';
import { configureMountRegistry, runMountRegistry } from './lib/boot/registry';
import { mountRegistryList } from './lib/boot/specs';
import { mountAssistantTurn, releaseAssistantTurns } from './tool-run/mountTurn';
import { registerAssistantTurnRenderer } from '../ui/assistantTurnRenderer';

export function bootstrapReactCompatibilityRuntime(): void {
  registerAssistantTurnRenderer({ mount: mountAssistantTurn, releaseAll: releaseAssistantTurns });
  installChatRuntimeBridge();
  for (const id of ['newReplyPill', 'composerPrimaryBtnContent']) {
    if (!document.getElementById(id)) throw new Error(`React mount target "#${id}" was not found.`);
  }
  configureMountRegistry(mountRegistryList());
  /* The app shell is hidden until authBoot resolves. Running the full
     registry here used to fetch every lazy overlay plus the TipTap editor
     while an unauthenticated visitor was still looking at the login gate.
     Keep only the lightweight sidebar nav hydrated for shell compatibility;
     mount the visible app surfaces after auth reveals the shell. The
     registry is idempotent, so a second call only mounts hosts that were
     deferred. */
  runMountRegistry(document, { labels: new Set(['sidebar-nav']) });
  const runtime = window as Window & {
    __socratesMountReactCompatibility?: () => void;
  };
  runtime.__socratesMountReactCompatibility = () => {
    runMountRegistry(document);
  };
}
