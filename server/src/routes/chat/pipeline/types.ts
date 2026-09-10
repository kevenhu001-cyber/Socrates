/**
 * Shared types for the chat stream pipeline (M2 of the LobeHub-alignment
 * plan). Extracted verbatim from `routes/chat/stream.ts` so each pipeline
 * stage can import them without depending on the route file.
 */

import type { Request } from 'express';

/** A fully-streamed tool call as delivered by streamChatCompletion's onToolUse. */
export type ToolCall = { id: string; type: 'function'; function: { name: string; arguments: string } };

/** A partial tool_call delta delivered by streamChatCompletion's onToolCallDelta. */
export type ToolCallDelta = {
  index: number;
  id?: string | null;
  name?: string | null;
  argumentsDelta?: string;
  arguments?: string;
  final?: boolean;
};

/** Structured result bag shared by every tool executor in the dispatch loop. */
export type ToolResult = {
  status?: string;
  error?: string | null;
  errorCode?: string | null;
  errorMessage?: string | null;
  retryable?: boolean;
  userMessage?: string | null;
  detail?: unknown;
  /** Schema + example text handed to the model when a call was rejected. */
  correction?: string | null;
  output?: string;
  stdout?: string;
  stderr?: string;
  exitCode?: number | null;
  durationMs?: number;
  artifactFileIds?: Array<{ name?: string; mimeType?: string | null }>;
  executionId?: string | null;
  visualization?: { template?: string; title?: string } | null;
  plan?: { title?: string; steps?: unknown[] } | null;
  spec?: { title?: string; requirements?: unknown[] } | null;
  results?: unknown;
  [key: string]: unknown;
};

/** A single web-search result row. */
export type SearchResult = {
  title?: string;
  url?: string;
  snippet?: string;
  date?: string;
  source?: string | null;
  matchedQuery?: string;
};

/** The error shape thrown by the webSearch service. */
export type WebSearchError = { code?: string; message?: string; diagnostics?: unknown; retryable?: boolean };

/**
 * Messages flowing through the tool-calling loop: the prepared request
 * messages plus the assistant/tool messages the loop appends between hops.
 * Kept structurally loose to match the legacy `finalMessages` shape.
 */
export type StreamMessage =
  | Record<string, unknown>
  | { role: 'assistant'; content: string; tool_calls: Array<{ id: string; type: 'function'; function: { name: string; arguments: string } }> }
  | { role: 'tool'; tool_call_id: string; content: string };

/** A call after canonical-name resolution + argument repair. */
export interface PreparedCall {
  call: ToolCall;
  /** Canonical registry name when resolved, else the requested name. */
  toolName: string;
  registryEntry: ReturnType<ReturnType<typeof import('../../../services/toolRegistry.js').createToolRegistry>['get']> | null;
  args: Record<string, any>;
  rejection: { code: string; retryable: boolean; hint?: string } | null;
}

/** Per-request pipeline context handed to every stage. */
export interface ChatStreamPipelineContext {
  req: Request & { userId?: string; user?: { tier?: string } | null };
  res: import('express').Response;
  /** The successful prepareChatRequest result. */
  prep: Exclude<Awaited<ReturnType<typeof import('../helpers.js').prepareChatRequest>>, { ok: false }>;
  sessionIdFromQuery: string | null;
  projectIdFromBody: string | null;
  /**
   * M1 async — detached turn binding. When set, the pipeline mirrors
   * content/reasoning/tool lifecycle frames into chat_turn_events,
   * checkpoints fullText/fullReasoning onto the turn row, and keeps
   * running detached when the SSE socket closes (the client re-attaches
   * with GET /api/chat-turns/:id/events?after=). Ownership is validated
   * in the route before the pipeline starts.
   */
  turnId?: string | null;
}
