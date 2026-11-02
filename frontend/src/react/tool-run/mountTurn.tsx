/** Independent read-only tool turns share the ordinary root lifecycle. */
import { createRootGroup } from '../lib/boot/ownedRoot';
import { lazy, Suspense } from 'react';
import { ErrorBoundary } from '../ErrorBoundary';
import { restoredToolCalls, sortableToolCalls } from './toolRunLayout.js';
import type { LegacyChatMessage } from '../types/domain';

const roots = createRootGroup('assistant-turn');
const AssistantTurn = lazy(() => import('./AssistantTurn').then((module) => ({ default: module.AssistantTurn })));

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
  /* A restored turn keeps calls whose offset was never persisted; the
     restored layout anchors them at the end of the prose so the row still
     reaches the transcript. */
  const turnCalls = message.restoredFromHistory
    ? restoredToolCalls(rawText, calls)
    : sortableToolCalls(rawText, calls);
  if (turnCalls.length === 0) {
    // The caller may now write fallback markup into this same host.
    roots.release(container);
    return false;
  }
  // Keep public prose available while the tool renderer loads or fails.
  const fallback = <div className="msg-text">{rawText}</div>;
  roots.render(container, (
    <ErrorBoundary fallback={fallback}>
      <Suspense fallback={fallback}>
        <AssistantTurn message={message} readOnly={options.readOnly !== false} />
      </Suspense>
    </ErrorBoundary>
  ));
  return true;
}

/** Release the roots before their legacy parent clears its child containers. */
export function releaseAssistantTurns(): void {
  roots.releaseAll();
}
