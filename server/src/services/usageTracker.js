/**
 * usageTracker — record per-completion token usage into the
 * `usage_events` table so the heatmap on the My Account page can
 * aggregate hourly buckets.
 *
 * Token estimation: most LLM providers do not return `usage` in
 * their streaming SSE frames unless `stream_options.include_usage`
 * is set, and even then some providers ignore it. To stay portable
 * across OpenAI, Anthropic (via gateway), DeepSeek, MiniMax, etc.
 * we estimate from character count using the well-known "chars/4"
 * approximation. The heatmap cares about magnitude not exactness,
 * and this is good enough to surface activity patterns.
 */
import { getDb } from '../db/index.js';
import { usageEvents } from '../db/schema.js';

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

export function estimateTokens(text) {
  if (!text) return 0;
  return Math.max(1, Math.round(String(text).length / 4));
}

export function estimateMessageTokens(messages) {
  if (!Array.isArray(messages)) return 0;
  let total = 0;
  for (const m of messages) {
    const c = m && m.content;
    if (typeof c === 'string') total += estimateTokens(c);
    else if (Array.isArray(c)) {
      for (const part of c) {
        if (part && typeof part.text === 'string') {
          total += estimateTokens(part.text);
        } else if (part && part.type === 'image_url') {
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

/* Persist a usage event. Safe to call fire-and-forget — errors are
   logged but never thrown so a usage-tracking bug never breaks the
   chat stream itself. */
export function recordUsage({ userId, model, sessionId, promptTokens, completionTokens, source = 'chat' }) {
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
    }).catch((err) => {
      console.warn('[usage] record failed:', err.message);
    });
  } catch (err) {
    console.warn('[usage] record failed:', err.message);
  }
}