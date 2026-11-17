/**
 * Wire-level chat request schema and multimodal transforms.
 *
 * These are the shapes the HTTP route validates and the forms the provider
 * adapter receives. Prompt/context assembly lives in the sibling modules.
 */
import { z } from 'zod';
import {
  ProviderContentPartSchema,
  ProviderMessageSchema,
  type ProviderMessage,
} from '../../../lib/providerMessageSchema.js';
import { isMultimodalProvider } from '../../../lib/multimodal.js';
import { LEARNING_MODE_IDS } from '../../../lib/prompts.js';
import { sanitizeExtraBody } from '../../../lib/sanitize.js';
import type { Provider } from './types.js';

/* ─────────────────────────────────────────────────────────────────
   Request schemas (Zod)
   ───────────────────────────────────────────────────────────────── */

// P6.x — cap message count and per-message content (prevents a 10k-
// message payload from spiking OpenAI costs / proxy timeouts).
// Supports both plain text (string) and multimodal content parts (array)
// for vision/image attachments.
export const ChatPayloadSchema = z
  .object({
    messages: z.array(ProviderMessageSchema).min(1).max(100),
    temperature: z.number().min(0).max(2).optional(),
    max_tokens: z.number().int().positive().max(32000).optional(),
    mode: z.enum(['tutor', 'chat']).optional().default('chat'),
    /* RN-6 — the learning mode picked in Tutor mode. The client sends only
     the id; the behavior is the server-owned prompts/learning-modes.md
     section, injected for this turn. `learningFocus` is the short subject
     some modes act on (a concept for practice, a mistake for mistakes); it
     is learner data and travels as untrusted context. Ignored in chat mode. */
    learningMode: z.enum(LEARNING_MODE_IDS).optional(),
    learningFocus: z.string().max(2000).optional(),
    /* `systemContext` used to be accepted
     here and read by nobody: the client sent it, the server dropped it.
     The schema is .passthrough(), so a stale client that still sends the
     field is unaffected; the dead declaration is gone. */
    /* optional session id. When present, the last user
     message is used as the retrieval query against the session's
     chunk index and the top hits are injected as an untrusted
     context block into the system prompt. Ownership is verified
     server-side (services/embeddings/chunkIndex.ts#sessionOwnedBy) before any
     retrieval, so a forged sessionId yields an empty injection
     rather than another user's history. */
    ragSessionId: z.string().max(64).optional(),
    assistantId: z.string().uuid().optional(),
    sessionId: z.string().uuid().optional(),
    /* DeepSeek SDK flags that flip chain-of-
     thought on. The frontend sends these when the active model
     looks like a DeepSeek-family reasoning model. We forward
     them to llm.js as-is; non-DeepSeek upstreams silently ignore
     the unknown fields. */
    reasoning_effort: z.enum(['none', 'low', 'medium', 'high']).optional(),
    response_speed: z.enum(['standard', 'fast']).optional().default('standard'),
    /* Backward-compatible input for older clients. Agent routing is now always
     decided from the user's intent by the model; this field is accepted but
     ignored so stale clients cannot force a worker run. */
    agentMode: z.boolean().optional(),
    extra_body: z.record(z.string(), z.unknown()).optional(),
  })
  .passthrough();

/** A single chat message; content is either plain text or multimodal parts. */

/** A single multimodal content part (text or image_url). */
type ContentPart = z.infer<typeof ProviderContentPartSchema>;
/** The validated chat request payload. */
export type ChatPayload = z.infer<typeof ChatPayloadSchema>;

export { sanitizeExtraBody };

/* ─────────────────────────────────────────────────────────────────
   Multimodal content transforms
   ───────────────────────────────────────────────────────────────── */

/* model-aware content transform.
 *
 * The chat schema accepts multimodal `image_url` parts on every
 * provider, but only vision-capable models can actually consume them.
 * Before forwarding the prompt to the upstream we run every message
 * through this transform:
 *
 *   - Plain string content → unchanged.
 *   - Multimodal content on a vision-capable model → unchanged.
 *   - Multimodal content on a TEXT-ONLY model → replace each
 *     `image_url` part with a textual placeholder so the model
 *     receives a coherent "I can't view this" instruction instead of
 *     a confusing upstream 400. We drop the original dataUrl so we
 *     don't waste tokens shipping a 500 KB base64 image to a model
 *     that can never read it.
 *   - Any other part shape (text, etc.) → unchanged.
 *
 * This is a defence-in-depth fallback. The frontend is supposed to
 * pre-decide whether to send `image_url` parts based on the active
 * provider, but we don't trust the client and re-check here. */
export function transformContentForModel(
  content: string | ContentPart[],
  multimodal: boolean,
): string | ContentPart[] {
  if (!Array.isArray(content)) return content;
  if (multimodal) {
    /* Normalise `image_url` parts before forwarding: providers disagree
       on the accepted `detail` values (OpenAI allows low/high/auto;
       MiniMax 400s on "auto" — "invalid params, invalid image detail").
       Nothing in the app relies on the knob, so drop it and let the
       upstream use its default resolution regardless of what a client
       (or a stale cached build) sends. */
    return content.map((part) =>
      part && part.type === 'image_url' && part.image_url && typeof part.image_url.url === 'string'
        ? { ...part, image_url: { url: part.image_url.url } }
        : part,
    );
  }
  const out: ContentPart[] = [];
  for (const part of content) {
    if (part && part.type === 'image_url') {
      // We don't have the original filename here (it lives in the
      // attachments column), but we can hint at it via the
      // `image_url.url` itself if it was a dataUrl — fall back to
      // a generic message. The client renders "[Image: foo.png]"
      // next to the bubble so the user knows what was attached.
      out.push({
        type: 'text',
        text: '[User attached an image that this model cannot view inline. If this message includes an [Attached file: …] pointer, call read_attachment with its fileId to get a description of the image; otherwise ask the user to describe what they want help with.]',
      });
    } else if (part && part.type === 'text' && typeof part.text === 'string') {
      out.push(part);
    } else {
      // Unknown part type — drop rather than forward unknown shapes.
      // (We could include them but OpenAI's spec is strict about
      //  only `text` / `image_url`; unknowns may get rejected.)
    }
  }
  // If we stripped everything, leave at least an empty marker so the
  // upstream doesn't see an empty content array (which some providers
  // also reject).
  if (out.length === 0) {
    out.push({
      type: 'text',
      text: '[User attached content that cannot be processed by the current model.]',
    });
  }
  return out;
}

/** Return true when any message contains an image_url content part. */
export function containsImageUrlParts(messages: ProviderMessage[]): boolean {
  return messages.some(
    (message) =>
      Array.isArray(message?.content) &&
      message.content.some((part) => part && part.type === 'image_url'),
  );
}

/* Apply the multimodal transform to every user/assistant turn in
 * `messages` based on the active provider's `isMultimodal` flag.
 * System messages are not multimodal in OpenAI's spec, but we
 * still walk them for safety in case a future revision allows
 * system-image parts. The provider object is the decrypted shape
 * returned by services/core/apiKey.js#decryptProvider; it carries the
 * user-controlled `isMultimodal` boolean. */
export function transformMessagesForModel(
  messages: ProviderMessage[],
  provider: Provider,
): ProviderMessage[] {
  const multimodal = isMultimodalProvider(provider);
  return messages.map((m) => {
    if (!m || typeof m !== 'object') return m;
    return { ...m, content: transformContentForModel(m.content, multimodal) };
  });
}
