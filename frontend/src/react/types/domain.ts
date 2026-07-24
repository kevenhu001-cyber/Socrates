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
  arguments?: string;
  status?: 'pending' | 'running' | 'completed' | 'failed';
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
    kind?: string;
    name?: string;
    dataUrl?: string;
    size?: number;
  }>;
  modelInfo?: { label?: string; model?: string } | null;
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
  | { type: 'stream-failed'; messageId: string; textLength: number; error?: string };
