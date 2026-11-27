/**
 * toolTurnPolicy.ts — per-turn budget and degradation policy for tool calls.
 *
 * The chat route used to keep four independent failure counters inline, and
 * one of them (`invalidToolArgumentFailures`) disabled *every* tool for the
 * rest of the turn after two malformed argument objects. A model that
 * mis-shaped one call therefore lost access to search, code, and the
 * workspace agent for the whole answer, which is the behaviour users saw as
 * "the AI keeps getting banned from using tools".
 *
 * This module replaces those counters with one explicit policy object:
 *
 *   - an effort-scaled iteration budget: High keeps the generous 12 hops
 *     that genuine multi-step work needs, while Low and Instant get short
 *     budgets so a simple question cannot spend the whole turn in the tool
 *     loop,
 *   - failure accounting per tool, so a broken call only ever costs the
 *     tool that broke, never the whole toolset,
 *   - a duplicate-call guard, because an identical retry cannot make
 *     progress and would otherwise burn the larger budget, and
 *   - absolute call and wall-clock ceilings that keep a bigger iteration
 *     budget from turning into a runaway turn.
 *
 * Every threshold is environment-tunable so operators can tighten or relax
 * the loop without a code change. An explicit environment value wins over
 * the effort-derived default.
 */

import { createHash } from 'node:crypto';

/** Consecutive same-tool failures tolerated before that tool steps aside. */
const DEFAULT_PER_TOOL_FAILURE_LIMIT = 3;

export type ToolReasoningEffort = 'none' | 'low' | 'medium' | 'high';

interface EffortBudget {
  maxIterations: number;
  maxCallsPerIteration: number;
  maxTotalCalls: number;
  wallClockMs: number;
}

/**
 * A low-effort turn should not behave like a high-effort one. The model may
 * still choose tools, but it cannot keep discovering, retrying and
 * synthesizing for a dozen hops after the user asked for a quick answer.
 *
 * `high` is also the fallback for callers that send no effort (an undeclared
 * model or an older client), so the previous default budget is preserved.
 */
const EFFORT_BUDGETS: Record<ToolReasoningEffort, EffortBudget> = {
  none: { maxIterations: 2, maxCallsPerIteration: 4, maxTotalCalls: 4, wallClockMs: 2 * 60_000 },
  low: { maxIterations: 4, maxCallsPerIteration: 6, maxTotalCalls: 8, wallClockMs: 5 * 60_000 },
  medium: {
    maxIterations: 8,
    maxCallsPerIteration: 8,
    maxTotalCalls: 16,
    wallClockMs: 10 * 60_000,
  },
  high: { maxIterations: 12, maxCallsPerIteration: 8, maxTotalCalls: 24, wallClockMs: 15 * 60_000 },
};

function effortBudget(effort: string | undefined): EffortBudget {
  if (effort === 'none' || effort === 'low' || effort === 'medium' || effort === 'high') {
    return EFFORT_BUDGETS[effort];
  }
  return EFFORT_BUDGETS.high;
}

function envInt(name: string, fallback: number, min: number, max: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

export interface ToolTurnPolicyOptions {
  /** User-selected thinking level; scales the default budgets. */
  reasoningEffort?: string;
  maxIterations?: number;
  maxCallsPerIteration?: number;
  maxTotalCalls?: number;
  perToolFailureLimit?: number;
  wallClockMs?: number;
  /** Injectable clock for tests. */
  now?: () => number;
}

export interface DisabledTool {
  name: string;
  reason: string;
}

export interface ToolTurnPolicySnapshot {
  maxIterations: number;
  iterationsUsed: number;
  maxCallsPerIteration: number;
  maxTotalCalls: number;
  callsUsed: number;
  perToolFailureLimit: number;
  disabled: DisabledTool[];
}

export interface ToolTurnPolicy {
  readonly maxIterations: number;
  readonly maxCallsPerIteration: number;
  /** Tools may be offered on this hop. */
  toolsAllowed(iteration: number): boolean;
  /** Mark the start of a provider hop. */
  noteIteration(): void;
  /** `all` minus the tools that have stepped aside this turn. */
  enabledToolNames(all: readonly string[]): string[];
  disabledTools(): DisabledTool[];
  /** Reason a tool was withdrawn, or null when it is still callable. */
  disabledReason(tool: string): string | null;
  /** True when this exact (tool, arguments) pair already ran this turn. */
  isDuplicate(tool: string, argumentsHash: string): boolean;
  /** Reserve one unique call within the remaining turn budget; null on success. */
  registerCall(tool: string, argumentsHash: string): { code: string; message: string } | null;
  /* Reverse of registerCall for a call that FAILED: the (tool,args)
     pair must not stay in seenCalls or a legitimate same-arguments
     retry after a transient error gets rejected as a duplicate.
     callsUsed stays incremented — the budget was spent either way. */
  unmarkCall(tool: string, argumentsHash: string): void;
  /** Feed back the outcome so failures accumulate per tool. */
  recordResult(tool: string, ok: boolean, reason?: string): void;
  /** Corrected attempts the model still has for this tool. */
  remainingRetries(tool: string): number;
  /** Milliseconds to wait before this tool's next attempt — exponential
   * backoff after consecutive failures so a rate-limited upstream is not
   * hammered on every hop. 0 means "run now". */
  retryDelayMs(tool: string): number;
  /** Non-null when the turn must stop offering tools. */
  budgetExhausted(): { code: string; message: string } | null;
  snapshot(): ToolTurnPolicySnapshot;
}

export function createToolTurnPolicy(options: ToolTurnPolicyOptions = {}): ToolTurnPolicy {
  const defaults = effortBudget(options.reasoningEffort);
  const maxIterations =
    options.maxIterations ?? envInt('CHAT_MAX_TOOL_ITERATIONS', defaults.maxIterations, 1, 40);
  const maxCallsPerIteration =
    options.maxCallsPerIteration ??
    envInt('CHAT_MAX_TOOL_CALLS_PER_TURN', defaults.maxCallsPerIteration, 1, 16);
  const maxTotalCalls =
    options.maxTotalCalls ?? envInt('CHAT_MAX_TOOL_CALLS_TOTAL', defaults.maxTotalCalls, 1, 200);
  const perToolFailureLimit =
    options.perToolFailureLimit ??
    envInt('CHAT_TOOL_FAILURE_LIMIT', DEFAULT_PER_TOOL_FAILURE_LIMIT, 1, 10);
  const wallClockMs =
    options.wallClockMs ??
    envInt('CHAT_TOOL_WALL_CLOCK_MS', defaults.wallClockMs, 30_000, 60 * 60_000);
  const backoffBaseMs = envInt('CHAT_TOOL_BACKOFF_BASE_MS', 1_500, 0, 60_000);
  const backoffMaxMs = envInt('CHAT_TOOL_BACKOFF_MAX_MS', 15_000, 1_000, 120_000);
  const now = options.now || (() => Date.now());

  const startedAt = now();
  const consecutiveFailures = new Map<string, number>();
  const lastFailureAt = new Map<string, number>();
  const disabled = new Map<string, string>();
  const seenCalls = new Set<string>();
  let iterationsUsed = 0;
  let callsUsed = 0;

  const budgetExhausted = (): { code: string; message: string } | null => {
    if (callsUsed >= maxTotalCalls) {
      return {
        code: 'tool_budget_exhausted',
        message: `Tool call budget reached (${maxTotalCalls} calls this turn); finishing in prose.`,
      };
    }
    if (now() - startedAt >= wallClockMs) {
      return {
        code: 'tool_time_budget_exhausted',
        message: 'Tool time budget reached for this turn; finishing in prose.',
      };
    }
    return null;
  };

  return {
    get maxIterations() {
      return maxIterations;
    },
    get maxCallsPerIteration() {
      return maxCallsPerIteration;
    },

    toolsAllowed(iteration: number) {
      if (iteration >= maxIterations) return false;
      return budgetExhausted() === null;
    },

    noteIteration() {
      iterationsUsed += 1;
    },

    enabledToolNames(all: readonly string[]) {
      return all.filter((name) => !disabled.has(name));
    },

    disabledTools() {
      return Array.from(disabled.entries()).map(([name, reason]) => ({ name, reason }));
    },

    disabledReason(tool: string) {
      return disabled.get(tool) ?? null;
    },

    isDuplicate(tool: string, argumentsHash: string) {
      return seenCalls.has(`${tool}:${argumentsHash}`);
    },

    registerCall(tool: string, argumentsHash: string) {
      const key = `${tool}:${argumentsHash}`;
      if (seenCalls.has(key)) {
        return {
          code: 'duplicate_tool_call',
          message:
            'This exact call already ran in this turn, so it was not executed again. Use the previous result, change the arguments materially, or continue in prose.',
        };
      }
      const exhausted = budgetExhausted();
      if (exhausted) return exhausted;
      seenCalls.add(key);
      callsUsed += 1;
      return null;
    },

    unmarkCall(tool: string, argumentsHash: string) {
      seenCalls.delete(`${tool}:${argumentsHash}`);
    },

    recordResult(tool: string, ok: boolean, reason?: string) {
      if (!tool) return;
      if (ok) {
        consecutiveFailures.delete(tool);
        lastFailureAt.delete(tool);
        return;
      }
      const failures = (consecutiveFailures.get(tool) || 0) + 1;
      consecutiveFailures.set(tool, failures);
      lastFailureAt.set(tool, now());
      if (failures >= perToolFailureLimit && !disabled.has(tool)) {
        disabled.set(tool, reason || 'repeated_failures');
      }
    },

    remainingRetries(tool: string) {
      if (disabled.has(tool)) return 0;
      return Math.max(0, perToolFailureLimit - (consecutiveFailures.get(tool) || 0));
    },

    retryDelayMs(tool: string) {
      const failures = consecutiveFailures.get(tool) || 0;
      if (failures <= 0 || backoffBaseMs <= 0) return 0;
      /* Exponential: 1.5s, 3s, 6s, 12s … capped. The next model hop
         usually lands seconds after the failure anyway, so we subtract
         the elapsed wait and only sleep the remainder. */
      const target = Math.min(backoffBaseMs * Math.pow(2, failures - 1), backoffMaxMs);
      const elapsed = now() - (lastFailureAt.get(tool) || 0);
      return Math.max(0, Math.ceil(target - elapsed));
    },

    budgetExhausted,

    snapshot() {
      return {
        maxIterations,
        iterationsUsed,
        maxCallsPerIteration,
        maxTotalCalls,
        callsUsed,
        perToolFailureLimit,
        disabled: Array.from(disabled.entries()).map(([name, reason]) => ({ name, reason })),
      };
    },
  };
}

/**
 * Stable, order-insensitive fingerprint of a parsed argument object.
 *
 * Used for the duplicate-call guard, so `{"a":1,"b":2}` and `{"b":2,"a":1}`
 * are recognised as the same call. Falls back to the raw string form when a
 * value cannot be serialized.
 *
 * Hash the entire canonical value, not a prefix or head/tail sample.
 * Middle edits in long Python programs must not be mistaken for duplicates.
 * Only the fixed-size digest is retained in the per-turn seen-call set.
 */
export function hashToolArguments(value: unknown): string {
  let serialized: string;
  try {
    serialized = stableStringify(value);
  } catch {
    serialized = String(value);
  }
  return createHash('sha256').update(serialized).digest('hex');
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null';
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, item]) => item !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([key, item]) => `${JSON.stringify(key)}:${stableStringify(item)}`);
  return `{${entries.join(',')}}`;
}
