/**
 * Client-side chat contracts.
 *
 * Persisted fields come from `@socrates/contracts`; this module only adds the
 * ephemeral fields the web transcript and streaming runtime keep in memory.
 */
import type {
  Attachment as ContractAttachment,
  Message as ContractMessage,
  ToolCall as ContractToolCall,
  TurnRuntime,
} from '@socrates/contracts';

export type ChatRole = 'user' | 'assistant' | 'system';

export interface ChatAttachment extends Omit<
  ContractAttachment,
  'id' | 'kind' | 'name' | 'mime' | 'size'
> {
  id?: string;
  kind?: string;
  name?: string;
  mime?: string;
  size?: number;
  /** Upload pipeline state, never persisted. */
  pending?: boolean;
  progress?: number;
  thumbnailUrl?: string;
  error?: string;
}

export interface ToolCall extends Omit<
  ContractToolCall,
  | 'input'
  | 'results'
  | 'visualizations'
  | 'detail'
  | 'artifacts'
  | 'durationMs'
  | 'argumentsText'
  | 'stderr'
  | 'errorText'
  | 'userMessage'
> {
  input?: unknown;
  durationMs?: number;
  argumentsText?: string;
  stderr?: string;
  errorText?: string | null;
  userMessage?: string;
  results?: ReadonlyArray<Record<string, unknown>>;
  artifacts?: ReadonlyArray<{ id: string; name?: string; mimeType?: string }>;
  detail?: unknown;
  visualizations?: unknown[];
  phase?: 'queued' | 'preparing' | 'running' | 'succeeded' | 'failed' | 'cancelled' | 'timed_out';
  error?: string | null;
  status?: string;
  /** Live, client-only run record from chat/toolRunState.ts. */
  _run?: { phase?: string; durationMs?: number; startedAt?: number; endedAt?: number };
  /** Last `tool_progress` phase (`stdout` / `stderr` / `queued` / …). */
  _progressPhase?: string;
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

export type ChatStreamStatus = 'idle' | 'streaming' | 'completed' | 'aborted' | 'failed';

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
 * One transcript row: the persisted `@socrates/contracts` Message plus the
 * ephemeral fields owned by the web streaming runtime.
 */
export interface ChatMessage extends Omit<
  ContractMessage,
  'role' | 'attachments' | 'toolCalls' | 'turnRuntime'
> {
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
  attachments?: ReadonlyArray<ChatAttachment>;
  /** Ephemeral preview cards for links fetched from the just-sent user turn. */
  pageLinkPreviews?: ReadonlyArray<import('../../ui/linkPreviews.ts').LinkPreviewItem>;
  /** The user mentioned a site but did not include a fetchable URL. */
  pageLinkHint?: boolean;
  modelInfo?: { label?: string; model?: string } | null;
  toolCalls?: ReadonlyArray<ToolCall>;
  restoredFromHistory?: boolean;
  /* ExtensionDefinition.outputMode carried onto the
     finalized message entry. 'canvas' tells React's MessageItem to
     mount <CanvasBlock> instead of falling through to dangerouslySetInnerHTML. */
  outputMode?: 'chat' | 'canvas' | null;
  canvasId?: string | null;
  /* User-edited HTML inside the canvas block. Sanitized via DOMPurify
     before write; stored on the in-memory session message entry. */
  editedText?: string | null;
  /* Inline SVG of the active extension (chip icon in the canvas header). */
  _extensionIcon?: string | null;
  /* Provider reasoning retained for session persistence and progressive thought disclosure. */
  reasoningContent?: string | null;
  /** Seconds spent in thinking / reasoning phase. */
  reasoningDurationSec?: number | null;
  /**
   * Internal tool-runtime revision used by projection/write coordination.
   * React no longer depends on this scalar for row invalidation; immutable
   * session-message identity is the rendering signal.
   */
  _toolRunRev?: number;
  /** Revisions from the legacy math renderer, read by the memoized message row. */
  _katexRenderedRev?: number;
  _renderRev?: number;
  /**
   * The one live status line for this turn, written by app entry while the
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
  /**
   * the playback clock's current state, mirrored onto the
   * message by chat/turn/streaming.ts so the cursor can animate:
   * 'playing' (breathing dot), 'starved' (upstream stalled, buffer empty —
   * pulse / three dots), 'draining' (finish flushing the buffer — breathing),
   * 'done'/'idle' otherwise. Not persisted.
   */
  _playbackState?: 'idle' | 'playing' | 'starved' | 'draining' | 'done';
  /** Completed activity/outcome observation. Never a public reasoning summary. */
  summary?: string | null;
  /** Transient live task preview from turn_summary initial frames. Not persisted. */
  _taskSummary?: string | null;
  /** Server-owned public progress; private reasoning is never used as copy. */
  _activity?: import('@socrates/contracts').PublicTurnActivity;
  turnRuntime?: TurnRuntime | null;
  /** In-place message branching variants and active index (< 1 / 2 >). */
  branchInfo?: {
    currentIndex: number;
    variants: ReadonlyArray<{
      clientId?: string;
      id?: string;
      role?: string;
      rawText?: string;
      html?: string | null;
      type?: string | null;
      attachments?: ReadonlyArray<unknown>;
      toolCalls?: ReadonlyArray<unknown>;
      turnRuntime?: unknown;
      reasoningContent?: string | null;
      followingMessages?: ReadonlyArray<ChatMessage>;
    }>;
  } | null;
}

/**
 * What the assistant is doing right now, as far as the reader needs to know.
 * `waiting` = no token yet; `thinking` = reasoning arrived but no answer text;
 * `retrying` = a transient upstream failure is being retried; `error` = the
 * turn ended without an answer (the retry affordance lives here too);
 * `stopped` = the user stopped it, with a Resend affordance instead.
 *
 * `error` and `stopped` outlive the stream — app entrypoint clears the field at
 * finish(), so anything still set on a finalized entry is a turn that ended
 * broken, and AssistantTurn keeps drawing it.
 *
 * `tool-running` = a tool call is executing but its row is deferred behind
 * an unfinished paragraph (). AssistantTurn hides this
 * line as soon as the real row mounts, so the two never appear together.
 */
export interface LiveTurnStatus {
  phase:
    'waiting' | 'thinking' | 'synthesizing' | 'retrying' | 'error' | 'stopped' | 'tool-running';
  toolName?: string;
  /** Already-translated copy — the writer knows the app language. */
  label?: string;
  /** Pill state: '' keeps the shimmer, 'done' / 'error' stop it. */
  state?: '' | 'done' | 'error';
  /** appMode at turn start — styles the waiting dot's chat-mode variant. */
  mode?: string;
  /** Elapsed whole seconds, shown only after the status has run for a while. */
  elapsedSec?: number;
  /** Timeout / failure copy shown in place of the answer. */
  error?: string | null;
  retryable?: boolean;
  /** Retry callback belongs to a restored transcript row, not a live turn owner. */
  retryMode?: 'restored';
}

export interface ChatRuntimeSnapshot {
  revision: number;
  currentSessionId: string | null;
  phase: string;
  messageCount: number;
  messages: ReadonlyArray<ChatMessage>;
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
  | { type: 'stream-retry-replaced'; messageId: string; messageIndex: number }
  /* A tool call on this message changed state (progress / result / approval
     / delta arguments) without any text delta to ride on. The session domain
     publishes a new immutable message identity for that write; this event
     coalesces the notification so React observes it on the next paint. */
  | { type: 'tool-run-updated'; messageId: string };
