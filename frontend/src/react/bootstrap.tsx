import type { Root } from 'react-dom/client';

import { installChatRuntimeBridge } from './chatRuntime.bridge';
import { configureMountRegistry, runMountRegistry } from './lib/boot/registry';
import { mountRegistryList } from './lib/boot/specs';
import { mountAssistantTurn, releaseAssistantTurns } from './tool-run';
import type { LegacyChatMessage } from './types/domain';

export function bootstrapReactCompatibilityRuntime(): Root {
  window.__socratesMountAssistantTurn = (container, message, options) =>
    mountAssistantTurn(container, message as LegacyChatMessage, options);
  window.__socratesReleaseAssistantTurns = releaseAssistantTurns;
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
  (window as any).__socratesMountReactCompatibility = () => {
    runMountRegistry(document);
  };
  return (window as any).__socratesPillRoot ?? null;
}
