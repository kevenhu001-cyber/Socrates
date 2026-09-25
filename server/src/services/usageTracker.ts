/**
 * usageTracker — record per-completion token usage into the
 * `usage_events` table.
 *
 * Two sources, in priority order:
 *
 *   1. `provider` — the numbers the upstream actually billed, taken from
 *      the `usage` object on a non-streaming response or from the final
 *      `stream_options.include_usage` frame of a stream. These are exact.
 *
 *   2. `estimate` — the chars/4 approximation below, used only when the
 *      provider reported nothing. Some OpenAI-compatible gateways ignore
 *      `stream_options`, and a stream aborted mid-flight never reaches the
 *      usage frame, so the fallback has to stay.
 *
 * Until 2026-09-25 only (2) existed, which meant the billing surface on the
 * My Account page was an activity heatmap wearing a cost label — the old
 * comment here said as much ("the heatmap cares about magnitude not
 * exactness"). Every row is now tagged with `usageSource` so an aggregate
 * can state which part of a total is measured and which part is guessed,
 * instead of silently mixing them.
 */
import { getDb } from '../db/index.js';
import { usageEvents } from '../db/schema.js';

/** Where a usage row's numbers came from. Persisted on every row. */
export type UsageSource = 'provider' | 'estimate';

export interface NormalizedUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

function asCount(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) return null;
  return Math.round(value);
}

/**
 * Extract prompt/completion counts from whatever shape the provider used.
 *
 * Returns null when nothing usable is present, which is the signal for the
 * caller to fall back to an estimate. Deliberately tolerant: this runs on
 * untrusted upstream JSON, and a malformed `usage` object must degrade to
 * "no data" rather than poison the billing table with NaN or negatives.
 *
 * Shapes handled:
 *   OpenAI / most compatible gateways  { prompt_tokens, completion_tokens }
 *   Anthropic (direct or via gateway)  { input_tokens, output_tokens }
 *   Google Gemini                      { promptTokenCount, candidatesTokenCount }
 */
export function normalizeProviderUsage(raw: unknown): NormalizedUsage | null {
  if (!raw || typeof raw !== 'object') return null;
  const u = raw as Record<string, unknown>;

  const prompt = asCount(u.prompt_tokens) ?? asCount(u.input_tokens) ?? asCount(u.promptTokenCount);
  const completion = asCount(u.completion_tokens) ?? asCount(u.output_tokens) ?? asCount(u.candidatesTokenCount);

  if (prompt === null && completion === null) return null;

  const promptTokens = prompt ?? 0;
  const completionTokens = completion ?? 0;
  /* Prefer the provider's own total when it reports one — for models with
     cached or reasoning tokens it can exceed prompt+completion, and the
     billed figure is the one that matters. */
  const reportedTotal = asCount(u.total_tokens) ?? asCount(u.totalTokenCount);
  const totalTokens = reportedTotal !== null && reportedTotal >= promptTokens + completionTokens
    ? reportedTotal
    : promptTokens + completionTokens;

  if (totalTokens <= 0) return null;
  return { promptTokens, completionTokens, totalTokens };
}

/* P_attachments — rough token estimate for a single image part.
 *
 * OpenAI's documented cost for `gpt-4o` image inputs is "765 tokens
 * for low-detail, ~85 tokens per 512px tile at high-detail". The
 * `gpt-4-vision-preview` docs cite "roughly 85 tokens per 512×512
 * tile + 170 base tokens". For a "low" detail image this comes out
 * to ~765 tokens total — which is also the figure commonly cited
 * for Claude 3 (Sonnet/Opus/Haiku). We use this as a single
 * round-number estimate so the heatmap doesn't understate usage
 * when a user attaches multiple images, while keeping the math
 * simple. Real per-image cost varies by provider and detail mode;
 * the heatmap only needs magnitude, not exactness. */
export const IMAGE_TOKEN_ESTIMATE = 765;

export function estimateTokens(text: unknown): number {
  if (!text) return 0;
  return Math.max(1, Math.round(String(text).length / 4));
}

export function estimateMessageTokens(messages: unknown): number {
  if (!Array.isArray(messages)) return 0;
  let total = 0;
  for (const message of messages) {
    const c = message && typeof message === 'object'
      ? (message as { content?: unknown }).content
      : undefined;
    if (typeof c === 'string') total += estimateTokens(c);
    else if (Array.isArray(c)) {
      for (const part of c) {
        if (!part || typeof part !== 'object') continue;
        const typedPart = part as { text?: unknown; type?: unknown };
        if (typeof typedPart.text === 'string') {
          total += estimateTokens(typedPart.text);
        } else if (typedPart.type === 'image_url') {
          /* P_attachments — count each image_url part as ~765
           * tokens so the heatmap accurately reflects the cost of
           * multimodal messages. If the upstream degraded the
           * image to a textual placeholder (see
           * transformMessagesForModel in routes/chat.js), the
           * `text` branch above already counted the placeholder's
           * text — so we don't double-count in that case. */
          total += IMAGE_TOKEN_ESTIMATE;
        }
      }
    }
  }
  /* Per-message overhead for role markers / formatting (rough). */
  return total + messages.length * 4;
}

interface RecordUsageInput {
  userId?: string | null;
  model?: string | null;
  sessionId?: string | null;
  promptTokens?: number | null;
  completionTokens?: number | null;
  source?: string;
  /** Provenance of the numbers. Defaults to 'estimate' so an un-migrated
   *  caller is recorded honestly rather than claiming provider accuracy. */
  usageSource?: UsageSource;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Pick the numbers to bill: the provider's if it reported any, otherwise the
 * estimate. Returns the chosen counts plus the provenance tag so the caller
 * can hand both to recordUsage in one step.
 *
 * `providerUsage` is the raw upstream object — normalisation happens here so
 * every call site cannot get the shape handling subtly different.
 */
export function resolveUsage(
  providerUsage: unknown,
  fallback: { promptTokens: number; completionTokens: number },
): { promptTokens: number; completionTokens: number; usageSource: UsageSource } {
  const measured = normalizeProviderUsage(providerUsage);
  if (measured) {
    return {
      promptTokens: measured.promptTokens,
      completionTokens: measured.completionTokens,
      usageSource: 'provider',
    };
  }
  return { ...fallback, usageSource: 'estimate' };
}

/* Persist a usage event. Safe to call fire-and-forget — errors are
   logged but never thrown so a usage-tracking bug never breaks the
   chat stream itself. */
export function recordUsage({
  userId,
  model,
  sessionId,
  promptTokens,
  completionTokens,
  source = 'chat',
  usageSource = 'estimate',
}: RecordUsageInput): void {
  if (!userId) return;
  const total = (promptTokens || 0) + (completionTokens || 0);
  if (total <= 0) return;
  try {
    const db = getDb();
    /* Fire-and-forget: don't await. If the DB is briefly slow we
       still keep streaming. */
    db.insert(usageEvents).values({
      userId,
      model: model || null,
      sessionId: sessionId || null,
      promptTokens: promptTokens || 0,
      completionTokens: completionTokens || 0,
      totalTokens: total,
      source,
      usageSource,
    }).catch((err: unknown) => {
      console.warn('[usage] record failed:', errorMessage(err));
    });
  } catch (err) {
    console.warn('[usage] record failed:', errorMessage(err));
  }
}
