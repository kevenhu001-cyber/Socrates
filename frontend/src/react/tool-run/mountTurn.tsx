/** Independent read-only tool turns share the ordinary root lifecycle. */
import { createRootGroup } from '../lib/boot/ownedRoot';
import { AssistantTurn } from './AssistantTurn.js';
import { hasTurnStructure } from './toolRunModel.js';
import type { LegacyChatMessage } from '../types/domain';

const roots = createRootGroup('assistant-turn');

export interface MountAssistantTurnOptions {
  /** Share / replay: hides Retry and approval. Default true here. */
  readOnly?: boolean;
}

/**
 * Render `message` into `container`, which this module then owns.
 *
 * @returns whether the declarative renderer took the turn. `false` means
 *   nothing was mounted — the message has no tool call with a usable
 *   `textOffset` (a session stored before split points were persisted), so the
 *   caller should keep its own markup rather than show an answer with no rows.
 */
export function mountAssistantTurn(
  container: HTMLElement,
  message: LegacyChatMessage,
  options: MountAssistantTurnOptions = {},
): boolean {
  const calls = Array.isArray(message.toolCalls) ? message.toolCalls : [];
  const rawText = typeof message.rawText === 'string' ? message.rawText : '';
  if (!hasTurnStructure(rawText, calls)) {
    // The caller may now write fallback markup into this same host.
    roots.release(container);
    return false;
  }
  roots.render(container, <AssistantTurn message={message} readOnly={options.readOnly !== false} />);
  return true;
}

/** Release the roots before their legacy parent clears its child containers. */
export function releaseAssistantTurns(): void {
  roots.releaseAll();
}
