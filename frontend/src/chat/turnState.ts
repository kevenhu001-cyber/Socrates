/* chat/turnState.ts — centralized mutable turn/streaming state.
 * Extracted from main.js module-level vars to enable safe function
 * extraction without circular imports. Single mutable object so both
 * main.js (legacy) and new modules share live state.
 * Zero-behavior-change: same initial values, same mutation semantics.
 */
import { createStreamRetryViewport } from './streamRetry.ts';

/** The abort surface every streaming turn exposes to the rest of the app. */
export interface ActiveChatController {
  abort(): void;
}

/** The controller returned by the streaming-turn factory — the full surface
 * the send path, the tool-callback adapter, and the tutor follow-up drive:
 * text/thinking append plus the record* ledger the tool callbacks call. */
export interface StreamingTurnController extends ActiveChatController {
  getClientId(): string;
  isFinished(): boolean;
  append(delta: string): void;
  appendThinking(delta: string): void;
  finish(): void;
  replaceWithError(message: string, retry: () => void): void;
  recordToolUse(call: unknown): void;
  recordToolProgress(progress: unknown): void;
  recordToolCallDelta(delta: unknown): void;
  recordExecutionStart(event: unknown): void;
  recordToolResult(result: unknown): void;
  recordToolApproval(approval: unknown): void;
  recordAgentStep(step: unknown): void;
  recordAgentPlan(plan: unknown): void;
  recordTurnSnapshot(payload: unknown): void;
  recordTurnEvent(payload: unknown): void;
  recordTurnActivity(payload: unknown): void;
  recordTurnSummary(text: string, phase?: string): void;
}

/** The live turn that the status line's Retry affordance would re-run. */
export interface LiveRetryOwner {
  /* Streaming controllers identify themselves with `getClientId`; restored
     and legacy owners carry a plain `clientId`. `abort` is listed only so a
     bare `ActiveChatController` satisfies this weak type. */
  owner: { getClientId?: () => string; clientId?: string; abort?: () => void };
  run: () => void;
}

/** Per-message runtime that can POST a Codex tool-approval decision. */
export interface LiveTurnRuntime {
  decideApproval?(toolCallId: string, decision: unknown): unknown;
}

export interface TurnUiState {
  inProgress: boolean;
  lastUserMessageId: string | null;
}

export interface TurnState {
  activeChatCtl: ActiveChatController | null;
  pendingAttachments: unknown[] | null;
  pendingBranchContext: unknown;
  /** Either a plain string or the multimodal parts array built by
   *  `buildUserContentParts`; both flow into `askChatTurn` unchanged. */
  pendingChatContent: unknown;
  chatStopMode: boolean;
  chatStreaming: boolean;
  turnUi: TurnUiState;
  liveRetryOwner: LiveRetryOwner | null;
  liveTurnRuntimes: Map<string, LiveTurnRuntime>;
  liveSearchRetry: ((query: string, detail?: unknown) => void) | null;
  toolRetryWired: boolean;
  pendingAssistantBranchInfo: unknown | null;
}

/* Active-chat controller + pending-turn payloads. Previously module-local
   vars in main.js with a comment noting window mirrors were removed. */
export const turnState: TurnState = {
  activeChatCtl: null,
  pendingAttachments: null,
  pendingBranchContext: null,
  pendingChatContent: null,
  chatStopMode: false,
  chatStreaming: false,
  turnUi: { inProgress: false, lastUserMessageId: null },
  liveRetryOwner: null,
  liveTurnRuntimes: new Map(),
  liveSearchRetry: null,
  toolRetryWired: false,
  pendingAssistantBranchInfo: null,
};

export function getTurnState(): TurnState {
  return turnState;
}

export function resetTurnState(): void {
  turnState.activeChatCtl = null;
  turnState.pendingAttachments = null;
  turnState.pendingBranchContext = null;
  turnState.pendingChatContent = null;
  turnState.chatStopMode = false;
  turnState.chatStreaming = false;
  turnState.turnUi = { inProgress: false, lastUserMessageId: null };
  turnState.liveRetryOwner = null;
  turnState.pendingAssistantBranchInfo = null;
  if (turnState.liveTurnRuntimes && typeof turnState.liveTurnRuntimes.clear === 'function') {
    turnState.liveTurnRuntimes.clear();
  }
  turnState.liveSearchRetry = null;
}

/* Retry-viewport anchoring (consume/measure/capture/prepare/settle):
   one store per app lifetime. Previously a module-local const in main.js;
   centralized here so extracted message/streaming modules share it. */
export const streamRetryViewport = createStreamRetryViewport();
