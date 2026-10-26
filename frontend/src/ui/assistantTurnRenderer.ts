import type { LegacyChatMessage } from '../react/types/domain';

interface AssistantTurnRenderer {
  mount: (host: HTMLElement, message: LegacyChatMessage, options: { readOnly: boolean }) => boolean;
  releaseAll: () => void;
}
let renderer: AssistantTurnRenderer | null = null;

/** React installs this at boot. Legacy share rendering keeps a prose fallback
 * until installation, without a runtime import of the React component tree. */
export function registerAssistantTurnRenderer(next: AssistantTurnRenderer): () => void {
  renderer = next;
  return () => { if (renderer === next) renderer = null; };
}

export function renderSharedAssistantTurn(host: HTMLElement, message: LegacyChatMessage): boolean {
  return renderer?.mount(host, message, { readOnly: true }) ?? false;
}

export function releaseSharedAssistantTurns(): void {
  renderer?.releaseAll();
}
