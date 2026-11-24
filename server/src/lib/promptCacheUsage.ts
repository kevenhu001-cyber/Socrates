import { annotateSpan } from './telemetry.js';

function count(value: unknown): number | null {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : null;
}

/** Cache reads are a subset of input tokens, not additional usage.
 * Absent or inconsistent counters are unknown, not a zero-percent hit rate. */
export function normalizePromptCacheUsage(raw: unknown): {
  inputTokens: number;
  cachedInputTokens: number;
} | null {
  if (!raw || typeof raw !== 'object') return null;
  const u = raw as Record<string, unknown>;
  const details = u.prompt_tokens_details;
  const openAiCached = details && typeof details === 'object'
    ? count((details as Record<string, unknown>).cached_tokens)
    : null;
  const hit = count(u.prompt_cache_hit_tokens);
  const miss = count(u.prompt_cache_miss_tokens);
  const directRead = count(u.cache_read_input_tokens);
  const directWrite = count(u.cache_creation_input_tokens);
  const directInput = count(u.input_tokens);
  const cached = openAiCached ?? hit ?? count(u.cachedContentTokenCount) ?? directRead;
  const input =
    count(u.prompt_tokens) ??
    count(u.promptTokenCount) ??
    (hit !== null && miss !== null ? hit + miss : null) ??
    (directRead !== null && directInput !== null
      ? directInput + directRead + (directWrite ?? 0)
      : null);
  if (input === null || cached === null || input <= 0 || cached > input) return null;
  return { inputTokens: input, cachedInputTokens: cached };
}

/** Observability only: no prompt text, identifiers, credentials or billing changes. */
export function observePromptCacheUsage(raw: unknown): void {
  const usage = normalizePromptCacheUsage(raw);
  if (!usage) return;
  annotateSpan({
    'llm.prompt.input_tokens': usage.inputTokens,
    'llm.prompt.cached_tokens': usage.cachedInputTokens,
  });
  if (process.env.CHAT_PROMPT_CACHE_METRICS === '1') {
    console.info('[llm] prompt-cache', JSON.stringify(usage));
  }
}
