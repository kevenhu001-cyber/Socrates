/* chat/liveTurn.ts — extracted from main.js (B5 batch).
 * Live-turn registries: retry owner, runtime map for Codex approvals,
 * message lookup, approval checks, search-retry wiring.
 * Zero-behavior-change lift; state lives in turnState.ts.
 */
import { stateStore } from '../state/store.js';
import { turnState } from './turnState.ts';
import type { ActiveChatController, LiveTurnRuntime } from './turnState.ts';

/** The store message the registries look turns up by. */
export interface LiveTurnMessage {
  clientId?: string;
  id?: string;
  toolCalls?: Array<{ approval?: { status?: string } | null } | null>;
  [key: string]: unknown;
}

/** Detail carried by the document-level `tool-retry` event. */
export interface ToolRetryDetail {
  query?: string;
  [key: string]: unknown;
}

/** Legacy bridge for surfaces that install their own tool-retry handler. */
interface LiveTurnWindow extends Window {
  __socratesToolRetry?: ((query: string, detail: ToolRetryDetail) => void) | null;
}

/* P_react-live-turn — one live turn may be retried, and only its own
   streaming closure knows how (it holds the prompt, the retry budget, and the
   viewport to re-anchor). React's status line and the legacy timeout block
   therefore both route through this registry instead of each owning a click
   handler. The newest stream claims it; finish()/abort() release it. */
export function claimLiveRetry(owner: ActiveChatController | null, run: () => void): void {
  turnState.liveRetryOwner = owner ? { owner, run } : null;
}

export function retryLiveTurn(messageId?: string | null): boolean {
  const owner = turnState.liveRetryOwner;
  if (!owner) return false;
  // Streaming controllers expose identity through their public accessor.
  // Restored/legacy owners can still supply a clientId field.
  const ownerId = typeof owner.owner.getClientId === 'function'
    ? owner.owner.getClientId() : owner.owner.clientId;
  if (messageId && String(ownerId || '') !== String(messageId)) return false;
  try { owner.run(); } catch { /* the retry handler threw — the turn is unchanged */ }
  return true;
}

/* P_react-live-turn — a declarative row answers a Codex approval through
   __socratesLegacy.liveTurn, and the only code that can POST a decision lives
   inside the runtime that recorded it (chat/toolRuntime.ts needs the message
   closure to write the outcome back onto toolCalls[].approval). */
export function registerLiveTurnRuntime(messageId: string | null | undefined, runtime: LiveTurnRuntime | null | undefined): void {
  if (!messageId || !runtime) return;
  turnState.liveTurnRuntimes.set(String(messageId), runtime);
  if (turnState.liveTurnRuntimes.size > 16) {
    const oldest = turnState.liveTurnRuntimes.keys().next().value;
    if (oldest !== undefined) turnState.liveTurnRuntimes.delete(oldest);
  }
}

export function liveTurnMessage(messageId?: string | null): LiveTurnMessage | null {
  const key = String(messageId || '');
  const msgs = stateStore.read('messages');
  if (!key || !Array.isArray(msgs)) return null;
  for (let i = msgs.length - 1; i >= 0; i--) {
    const m = msgs[i] as LiveTurnMessage | null | undefined;
    if (m && (String(m.clientId || '') === key || String(m.id || '') === key)) return m;
  }
  return null;
}

export function approvalStillPending(message: LiveTurnMessage | null): boolean {
  const calls = message && Array.isArray(message.toolCalls) ? message.toolCalls : [];
  for (let i = 0; i < calls.length; i++) {
    const call = calls[i];
    const ap = call && call.approval;
    if (ap && (!ap.status || ap.status === 'pending')) return true;
  }
  return false;
}

export function decideLiveApproval(
  messageId: string | null | undefined,
  toolCallId: string,
  decision: string,
): Promise<void> | null {
  const key = String(messageId || '');
  const runtime = turnState.liveTurnRuntimes.get(key);
  const message = liveTurnMessage(key);
  if (!runtime || !approvalStillPending(message)) {
    turnState.liveTurnRuntimes.delete(key);
    return null;
  }
  if (typeof runtime.decideApproval !== 'function') return null;
  /* The runtime records a failed POST into approval.ui (which the row paints)
     and re-enables the buttons, so the rejection has nowhere useful left to
     go — swallow it rather than leave an unhandled promise. */
  return Promise.resolve(runtime.decideApproval(toolCallId, decision)).then(() => undefined, () => undefined);
}

/* P_tool_retry_button — Retry on a failed search row re-issues the query
   through the streaming closure that owns the prompt (`onSearchRetry`). */
export function claimLiveSearchRetry(handler: ((query: string, detail?: unknown) => void) | null): void {
  turnState.liveSearchRetry = typeof handler === 'function' ? handler : null;
}

/* One-shot wiring guard: the document-level tool-retry listener must only
   be registered once. */
export function installLiveTurnRetryListener(): void {
  if (typeof document !== 'undefined' && !turnState.toolRetryWired) {
    turnState.toolRetryWired = true;
    document.addEventListener('tool-retry', (ev: Event) => {
      const detail = ((ev as CustomEvent<ToolRetryDetail>).detail || {}) as ToolRetryDetail;
      /* share.js / history replay install their own handler for the same event. */
      const win = window as LiveTurnWindow;
      const handler = (typeof win.__socratesToolRetry === 'function')
        ? win.__socratesToolRetry : turnState.liveSearchRetry;
      if (typeof handler !== 'function') return;
      /* P_tool_retry_prompt — pass the whole detail so repair prompts
         (viz-failure "Fix with AI") reach the handler alongside the
         legacy `query` field. */
      try { handler(detail.query || '', detail); } catch { /* a failed retry is just a missed click */ }
    });
  }
}
