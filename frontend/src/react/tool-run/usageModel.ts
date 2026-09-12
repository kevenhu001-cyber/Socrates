/**
 * react/tool-run/usageModel.ts — pure formatters for the assistant usage
 * footer. Split from TurnUsage.tsx so Node's type-stripping test runner
 * can import the math without touching JSX.
 */

export interface TurnUsageData {
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
  durationMs?: number;
  ttftMs?: number | null;
}

export interface UsageSummary {
  /** Completion tokens per second, one decimal (null when unmeasurable). */
  speed: string | null;
  /** Combined turn time in seconds, one decimal. */
  duration: string | null;
  promptTokens: number | null;
  completionTokens: number | null;
  totalTokens: number | null;
}

const finite = (value: unknown): number | null => (
  typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null
);

/** 1234 → "1.2k"; keeps exact counts under 1000. */
export function formatTokenCount(value: unknown): string | null {
  const count = finite(value);
  if (count === null) return null;
  if (count < 1000) return String(Math.round(count));
  if (count < 1_000_000) {
    const k = count / 1000;
    return `${k >= 100 ? Math.round(k) : Number(k.toFixed(1))}k`;
  }
  const m = count / 1_000_000;
  return `${m >= 100 ? Math.round(m) : Number(m.toFixed(1))}M`;
}

/** 1234 → "1.2s"; 65000 → "1m 05s". */
export function formatDuration(ms: unknown): string | null {
  const duration = finite(ms);
  if (duration === null || duration <= 0) return null;
  const seconds = duration / 1000;
  if (seconds >= 60) {
    const minutes = Math.floor(seconds / 60);
    const rest = Math.round(seconds % 60);
    return `${minutes}m ${String(rest).padStart(2, '0')}s`;
  }
  return `${Number(seconds.toFixed(1))}s`;
}

/**
 * Derive the display pieces from the raw usage record. Speed needs both
 * the completion tokens and a positive wall-clock time; anything less
 * degrades to the pieces that are actually measurable.
 */
export function usageSummary(usage?: TurnUsageData | null): UsageSummary | null {
  if (!usage || typeof usage !== 'object') return null;
  const promptTokens = finite(usage.promptTokens);
  const completionTokens = finite(usage.completionTokens);
  const totalTokens = finite(usage.totalTokens)
    ?? ((promptTokens ?? 0) + (completionTokens ?? 0) || null);
  const durationMs = finite(usage.durationMs);

  let speed: string | null = null;
  if (completionTokens && completionTokens > 0 && durationMs && durationMs > 0) {
    speed = String(Number((completionTokens / (durationMs / 1000)).toFixed(1)));
  }

  if (!totalTokens || totalTokens <= 0) return null;
  return {
    speed,
    duration: durationMs ? formatDuration(durationMs) : null,
    promptTokens,
    completionTokens,
    totalTokens,
  };
}
