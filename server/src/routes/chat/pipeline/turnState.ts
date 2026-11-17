/**
 * Mutable state shared by the tool loop and finalisation.
 *
 * One chat turn can make several upstream hops. `fullText`/`fullReasoning`
 * and the accumulated usage totals therefore live in one object rather than
 * in a dozen closure variables.
 */
import type { TurnRuntime } from '@socrates/contracts';
import { normalizeProviderUsage } from '../../../services/core/usageTracker.js';

export interface ExecutedToolCall {
  id: string;
  name: string;
  input: unknown;
  output?: unknown;
  isError?: boolean;
  status?: string;
  errorCode?: string | null;
}

export interface TurnUsageState {
  completionTokens: number;
  sawProviderUsage: boolean;
  usagePromptTotal: number;
  usageCompletionTotal: number;
}

export interface ToolLoopState extends TurnUsageState {
  fullText: string;
  fullReasoning: string;
  turnRuntime: TurnRuntime | null | undefined;
  executedToolCalls: ExecutedToolCall[];
}

export function createToolLoopState(): ToolLoopState {
  return {
    fullText: '',
    fullReasoning: '',
    turnRuntime: null,
    executedToolCalls: [],
    completionTokens: 0,
    sawProviderUsage: false,
    usagePromptTotal: 0,
    usageCompletionTotal: 0,
  };
}

export function addProviderUsage(state: TurnUsageState, raw: unknown): void {
  const usage = normalizeProviderUsage(raw);
  if (!usage) return;
  state.sawProviderUsage = true;
  state.usagePromptTotal += usage.promptTokens;
  state.usageCompletionTotal += usage.completionTokens;
}

/** Shaped like a provider usage object so `resolveUsage` can consume it. */
export function accumulatedProviderUsage(
  state: TurnUsageState,
): { prompt_tokens: number; completion_tokens: number } | null {
  if (!state.sawProviderUsage) return null;
  return { prompt_tokens: state.usagePromptTotal, completion_tokens: state.usageCompletionTotal };
}
