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
  for (const id of ['newReplyPill', 'sendBtnContent']) {
    if (!document.getElementById(id)) throw new Error(`React mount target "#${id}" was not found.`);
  }
  configureMountRegistry(mountRegistryList());
  runMountRegistry(document);
  try { (window as any).syncWorkspaceRoute?.(); } catch (_) { /* optional legacy route sync */ }
  return (window as any).__socratesPillRoot ?? null;
}
