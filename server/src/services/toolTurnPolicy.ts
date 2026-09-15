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
 *   - a generous iteration budget (12 hops by default) so genuine
 *     multi-step work fits inside a single turn,
 *   - failure accounting per tool, so a broken call only ever costs the
 *     tool that broke, never the whole toolset,
 *   - a duplicate-call guard, because an identical retry cannot make
 *     progress and would otherwise burn the larger budget, and
 *   - absolute call and wall-clock ceilings that keep a bigger iteration
 *     budget from turning into a runaway turn.
 *
 * Every threshold is environment-tunable so operators can tighten or relax
 * the loop without a code change.
 */

/** Consecutive same-tool failures tolerated before that tool steps aside. */
const DEFAULT_PER_TOOL_FAILURE_LIMIT = 3;

function envInt(name: string, fallback: number, min: number, max: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

export interface ToolTurnPolicyOptions {
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
  /** Count a call that is about to execute. */
  registerCall(tool: string, argumentsHash: string): void;
  /** Feed back the outcome so failures accumulate per tool. */
  recordResult(tool: string, ok: boolean, reason?: string): void;
  /** Corrected attempts the model still has for this tool. */
  remainingRetries(tool: string): number;
  /** Non-null when the turn must stop offering tools. */
  budgetExhausted(): { code: string; message: string } | null;
  snapshot(): ToolTurnPolicySnapshot;
}

export function createToolTurnPolicy(options: ToolTurnPolicyOptions = {}): ToolTurnPolicy {
  const maxIterations = options.maxIterations
    ?? envInt('CHAT_MAX_TOOL_ITERATIONS', 12, 1, 40);
  const maxCallsPerIteration = options.maxCallsPerIteration
    ?? envInt('CHAT_MAX_TOOL_CALLS_PER_TURN', 8, 1, 16);
  const maxTotalCalls = options.maxTotalCalls
    ?? envInt('CHAT_MAX_TOOL_CALLS_TOTAL', 24, 1, 200);
  const perToolFailureLimit = options.perToolFailureLimit
    ?? envInt('CHAT_TOOL_FAILURE_LIMIT', DEFAULT_PER_TOOL_FAILURE_LIMIT, 1, 10);
  const wallClockMs = options.wallClockMs
    ?? envInt('CHAT_TOOL_WALL_CLOCK_MS', 15 * 60_000, 30_000, 60 * 60_000);
  const now = options.now || (() => Date.now());

  const startedAt = now();
  const consecutiveFailures = new Map<string, number>();
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
    get maxIterations() { return maxIterations; },
    get maxCallsPerIteration() { return maxCallsPerIteration; },

    toolsAllowed(iteration: number) {
      if (iteration >= maxIterations) return false;
      return budgetExhausted() === null;
    },

    noteIteration() { iterationsUsed += 1; },

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
      seenCalls.add(`${tool}:${argumentsHash}`);
      callsUsed += 1;
    },

    recordResult(tool: string, ok: boolean, reason?: string) {
      if (!tool) return;
      if (ok) {
        consecutiveFailures.delete(tool);
        return;
      }
      const failures = (consecutiveFailures.get(tool) || 0) + 1;
      consecutiveFailures.set(tool, failures);
      if (failures >= perToolFailureLimit && !disabled.has(tool)) {
        disabled.set(tool, reason || 'repeated_failures');
      }
    },

    remainingRetries(tool: string) {
      if (disabled.has(tool)) return 0;
      return Math.max(0, perToolFailureLimit - (consecutiveFailures.get(tool) || 0));
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
 * The key is bounded but NOT a bare prefix: large argument objects
 * (code bodies up to 80 KB, agent tasks up to 20 KB) that differ only
 * past the 4 KB mark would otherwise collide and get wrongly rejected
 * as duplicates. Length plus a head/tail sample keeps the key short
 * while still distinguishing tail edits.
 */
export function hashToolArguments(value: unknown): string {
  try {
    const serialized = stableStringify(value);
    return serialized.length <= 4096
      ? serialized
      : `${serialized.length}:${serialized.slice(0, 3584)}…${serialized.slice(-512)}`;
  } catch {
    const raw = String(value);
    return raw.length <= 4096 ? raw : `${raw.length}:${raw.slice(0, 3584)}…${raw.slice(-512)}`;
  }
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
