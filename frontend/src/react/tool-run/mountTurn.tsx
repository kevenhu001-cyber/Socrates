/**
 * react/tool-run/mountTurn.tsx — imperative entry point for React-free surfaces.
 *
 * The read-only share view renders `#msgList` itself: `ui/share.js` sets
 * `window.__socratesShareMsgListTakeover` so `mountMessageList` never runs, and
 * fills it with DOM strings. Its tool rows used to be another copy of the
 * layout rule (rebuildAssistantHtmlWithInlineTools over the projection's
 * strings, or the rows baked into the stored HTML). This hands one message to
 * the same declarative renderer the chat uses, in a root of its own, with no
 * retry/approval affordances.
 *
 * Both globals are published from react/bootstrap.tsx, which main.js calls in
 * its module body — before auth/boot.js's `?share=` branch can reach its first
 * fetch. The legacy caller still checks for them and keeps its own fallback, so
 * a React runtime that never came up degrades to prose instead of a blank turn.
 */
import { createRoot, type Root } from 'react-dom/client';

import { AssistantTurn } from './AssistantTurn.js';
import { hasTurnStructure } from './toolRunModel.js';
import type { LegacyChatMessage } from '../types/domain';

/** Containers this module has taken over, so a re-render can release them. */
const ROOTS = new Map<Element, Root>();

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
  container: Element,
  message: LegacyChatMessage,
  options: MountAssistantTurnOptions = {},
): boolean {
  const calls = Array.isArray(message.toolCalls) ? message.toolCalls : [];
  const rawText = typeof message.rawText === 'string' ? message.rawText : '';
  if (!hasTurnStructure(rawText, calls)) return false;

  const readOnly = options.readOnly !== false;
  const node = <AssistantTurn message={message} readOnly={readOnly} />;
  const existing = ROOTS.get(container);
  if (existing) {
    existing.render(node);
    return true;
  }
  const root = createRoot(container);
  ROOTS.set(container, root);
  try {
    root.render(node);
  } catch (error) {
    /* A turn that cannot render must not take the rest of the page with it:
       drop the root and let the caller fall back to its own markup. */
    ROOTS.delete(container);
    try { root.unmount(); } catch (_) { /* partially mounted */ }
    throw error;
  }
  return true;
}

/** Release every container — call before the host wipes the list it owns. */
export function releaseAssistantTurns(): void {
  for (const root of ROOTS.values()) {
    try { root.unmount(); } catch (_) { /* already gone */ }
  }
  ROOTS.clear();
}
