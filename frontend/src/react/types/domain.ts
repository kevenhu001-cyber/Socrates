/**
 * Shared contracts for the React migration boundary.
 *
 * These types intentionally mirror the existing wire and persistence shapes;
 * they do not change the legacy application's runtime representation.
 */

export type ChatRole = 'user' | 'assistant' | 'system';

export interface ChatAttachment {
  id?: string;
  name: string;
  mimeType?: string;
  size?: number;
  url?: string;
}

export interface ToolCall {
  id: string;
  name: string;
  input?: unknown;
  output?: string | null;
  phase?: 'queued' | 'preparing' | 'running' | 'succeeded' | 'failed' | 'cancelled' | 'timed_out';
  durationMs?: number;
  error?: string | null;
  isError?: boolean;
  results?: ReadonlyArray<Record<string, unknown>>;
  artifacts?: ReadonlyArray<{
    id: string;
    name?: string;
    mimeType?: string;
  }>;
  /**
   * Fields the chat runtime and the persistence layer already write but that
   * the typed boundary had not exposed. The declarative tool renderer
   * (react/tool-run) reads all of them, so they are part of the contract:
   *
   *  - `textOffset` — index into the assistant `rawText` where this call
   *    fired. `segBase` in the streaming controller guarantees these are
   *    strictly increasing per turn; persisted via sessions.ts.
   *  - `_run` — live, client-only run record from chat/toolRunState.ts.
   *  - `errorCode` / `retryable` / `userMessage` / `detail` / `stderr` —
   *    structured failure surface from the backend.
   *  - `status` — 'awaiting_approval' | 'timeout' | 'completed' | 'failed'.
   *  - `argumentsText` — cumulative streamed `arguments` while in flight.
   *  - `visualization` — persisted chart spec for the attached viz card.
   */
  textOffset?: number;
  _run?: { phase?: string; durationMs?: number; startedAt?: number; endedAt?: number };
  errorCode?: string | null;
  retryable?: boolean;
  userMessage?: string;
  detail?: unknown;
  stderr?: string;
  status?: string;
  argumentsText?: string;
  /** Last `tool_progress` phase (`stdout` / `stderr` / `queued` / …). */
  _progressPhase?: string;
  visualization?: Record<string, unknown> | null;
}

export interface ChatMessage {
  clientId: string;
  role: ChatRole;
  rawText: string;
  html?: string;
  type?: string;
  actions?: string[];
  attachments?: ChatAttachment[];
  toolCalls?: ToolCall[];
}

export interface ChatSession {
  id: string;
  title: string | null;
  projectId: string | null;
  archivedAt?: number | null;
  messages: ChatMessage[];
}

export interface TextDeltaFrame {
  type: 'text_delta';
  text: string;
}

export interface ToolCallDeltaFrame {
  type: 'tool_call_delta';
  id: string;
  index: number;
  arguments?: string;
  final?: boolean;
}

export interface StreamTerminalFrame {
  type: 'done' | 'error';
  error?: string;
}

export type ChatStreamFrame = TextDeltaFrame | ToolCallDeltaFrame | StreamTerminalFrame;

export type ChatStreamStatus =
  | 'idle'
  | 'streaming'
  | 'completed'
  | 'aborted'
  | 'failed';

export interface ChatStreamSnapshot {
  messageId: string | null;
  status: ChatStreamStatus;
  textLength: number;
}

export interface ChatMessageSummary {
  id: string | null;
  role: string | null;
}

/**
 * Mirror of the legacy `state.messages` entry shape. Kept loose on
 * purpose: the legacy state-machine mutates entries in place (rawText
 * during streaming, html on finish) and we don't want to gate every
 * mutation through a strict TypeScript type. React-side renderers
 * narrow per-role before reading fields.
 */
export interface LegacyChatMessage {
  clientId?: string;
  id?: string;
  role?: 'user' | 'assistant' | 'system' | string;
  rawText?: string;
  html?: string | null;
  type?: string | null;
  actions?: ReadonlyArray<{
    text?: string;
    primary?: boolean;
    action?: string;
  }> | null;
  attachments?: ReadonlyArray<{
    id?: string;
    kind?: string;
    docKind?: string;
    name?: string;
    mime?: string;
    /** Durable files-table id — resolves against /api/v2/files/:id/raw
        and feeds the model's read_attachment pointer. */
    fileId?: string;
    dataUrl?: string;
    text?: string;
    truncated?: boolean;
    error?: string;
    pending?: boolean;
    progress?: number;
    thumbnailUrl?: string;
    size?: number;
  }>;
  modelInfo?: { label?: string; model?: string } | null;
  toolCalls?: ReadonlyArray<ToolCall>;
  restoredFromHistory?: boolean;
  /* P_canvas-mode — ExtensionDefinition.outputMode carried onto the
     finalized message entry. 'canvas' tells React's MessageItem to
     mount <CanvasBlock> instead of falling through to dangerouslySetInnerHTML. */
  outputMode?: 'chat' | 'canvas' | null;
  canvasId?: string | null;
  /* User-edited HTML inside the canvas block. Sanitized via DOMPurify
     before write; persisted on state.messages[idx] for reload durability. */
  editedText?: string | null;
  /* Inline SVG of the active extension (chip icon in the canvas header). */
  _extensionIcon?: string | null;
  /* Chain-of-thought text from `reasoning_content`, kept on the entry so a
     reload can rebuild the thinking block. */
  reasoningContent?: string | null;
  /**
   * Bumped by chat/toolRuntime.ts on every tool-lifecycle mutation. The
   * runtime mutates `toolCalls[]` in place, so object identity and array
   * identity both survive a status change — without a revision the memoized
   * row would keep painting the state it first saw. Transient: saveCurrentSession
   * projects an explicit field list (and skips `type: 'streaming'` entries
   * entirely), so this never reaches a persisted payload.
   */
  _toolRunRev?: number;
  /**
   * The one live status line for this turn, written by main.js while the
   * stream is in flight. Previously three DOM surfaces competed for it (the
   * "thinking" placeholder, the reasoning pill, the retry notice); a
   * declarative turn renders at most one, from here.
   */
  _liveStatus?: LiveTurnStatus | null;
  /**
   * Set true on the streaming entry when finish() has produced the final
   * html. `type` flips to "assistant" one microtask later; this flag keeps
   * the same React tree mounted across the boundary so the bubble does not
   * remount and the page does not reload-and-flicker at end of stream.
   */
  _streamSettled?: boolean;
}

/**
 * What the assistant is doing right now, as far as the reader needs to know.
 * `waiting` = no token yet; `thinking` = reasoning arrived but no answer text;
 * `retrying` = a transient upstream failure is being retried; `error` = the
 * turn ended without an answer (the retry affordance lives here too);
 * `stopped` = the user stopped it, with a Resend affordance instead.
 *
 * `error` and `stopped` outlive the stream — main.js clears the field at
 * finish(), so anything still set on a finalized entry is a turn that ended
 * broken, and AssistantTurn keeps drawing it.
 *
 * `tool-running` = a tool call is executing but its row is deferred behind
 * an unfinished paragraph (P_tool-order-defer). AssistantTurn hides this
 * line as soon as the real row mounts, so the two never appear together.
 */
export interface LiveTurnStatus {
  phase: 'waiting' | 'thinking' | 'retrying' | 'error' | 'stopped' | 'tool-running';
  /** Already-translated copy — the writer knows the app language. */
  label?: string;
  /** Pill state: '' keeps the shimmer, 'done' / 'error' stop it. */
  state?: '' | 'done' | 'error';
  /** appMode at turn start — styles the waiting dot's chat-mode variant. */
  mode?: string;
  /** True when clicking the line opens the thinking panel. */
  clickable?: boolean;
  /** Elapsed whole seconds, for the quiet "12s" cue on the waiting dot. */
  elapsedSec?: number;
  /** Timeout / failure copy shown in place of the answer. */
  error?: string | null;
  retryable?: boolean;
}

export interface ChatRuntimeSnapshot {
  revision: number;
  currentSessionId: string | null;
  phase: string;
  messageCount: number;
  messages: ReadonlyArray<LegacyChatMessage>;
  lastMessage: ChatMessageSummary | null;
  isStreaming: boolean;
  stream: ChatStreamSnapshot;
  lastEvent: ChatRuntimeEvent['type'];
}

export type ChatRuntimeEvent =
  | { type: 'state-synced'; reason: string }
  | { type: 'message-added'; messageId: string }
  | { type: 'stream-started'; messageId: string }
  | { type: 'stream-delta'; messageId: string; textLength: number }
  | { type: 'stream-finished'; messageId: string; textLength: number }
  | { type: 'stream-aborted'; messageId: string; textLength: number; reason?: string }
  | { type: 'stream-failed'; messageId: string; textLength: number; error?: string }
  /* A tool call on this message changed state (progress / result / approval
     / delta arguments) without any text delta to ride on. The declarative
     renderer draws rows from `message.toolCalls`, which the runtime mutates
     in place, so React only sees a change if something publishes one. */
  | { type: 'tool-run-updated'; messageId: string };
