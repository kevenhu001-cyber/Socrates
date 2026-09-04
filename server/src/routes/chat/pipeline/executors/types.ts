/**
 * Tool executor contract (LobeHub-alignment: self-registering tools).
 *
 * Each callable tool owns an executor module under `executors/`; the
 * pipeline dispatcher (`toolExecutors.ts`) resolves the canonical tool
 * name against the registry here and never branches on tool names itself.
 * Adding a tool means adding one module + one registry entry.
 */

import type { Request } from 'express';
import type { ToolTurnPolicy } from '../../../../services/toolTurnPolicy.js';
import type { JsonSchemaNode } from '../../../../services/toolCallSafety.js';
import type { SseEmitter } from '../sseEmitter.js';
import type { ToolCall, ToolResult } from '../types.js';

export interface ToolExecutorContext {
  req: Request & { userId?: string; user?: { tier?: string } | null };
  sessionIdFromQuery: string | null;
  projectIdFromBody: string | null;
  mode: string;
  emitter: SseEmitter;
  abortSignal: AbortSignal;
  toolPolicy: ToolTurnPolicy;
  schemaForTool: (name: string) => JsonSchemaNode | null;
  connectorConnectionsByProvider: Record<string, any>;
  projectConnectorConnectionsByProvider: Record<string, any>;
}

/** Per-iteration info executors may need (e.g. the available tool list in feedback). */
export interface ToolIterationInfo {
  activeToolNames: string[];
}

export interface ToolExecutionResult {
  result: ToolResult;
  /** Set when the executor already recorded its outcome on the turn
   * policy (it needed the post-failure retry count itself); the
   * dispatcher then skips the generic accounting. */
  outcomeRecorded?: boolean;
}

export type ToolExecutor = (
  args: Record<string, any>,
  call: ToolCall,
  ctx: ToolExecutorContext,
  iteration: ToolIterationInfo,
) => Promise<ToolExecutionResult>;
