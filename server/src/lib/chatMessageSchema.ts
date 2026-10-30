import { z } from 'zod';

export const ContentPartSchema = z.object({
  type: z.enum(['text', 'image_url']),
  text: z.string().max(200000).optional(),
  image_url: z.object({
    /* P_image-payload-alignment — 2,000,000 chars matches the persisted
       attachment dataUrl cap (routes/sessions.ts, routes/messages.ts) and
       the client-side compression target in frontend/src/attachments.ts.
       The previous 500,000-char cap silently 400-rejected any image over
       ~366 KB even though the frontend accepted files up to 4 MB. */
    url: z.string().max(2_000_000),
    detail: z.string().optional(),
  }).optional(),
}).passthrough();

export const MessageSchema = z.object({
  role: z.enum(['user', 'assistant', 'system']),
  content: z.union([
    z.string().max(200000),
    z.array(ContentPartSchema).min(1).max(50),
  ]),
  /* P_deepseek-mode — DeepSeek and DeepSeek-compatible reasoning
     models (deepseek-v3, v3.1, v3.2, r1, etc.) carry the chain-of-
     thought as a separate `reasoning_content` field on assistant
     turns so the model can pick up its own reasoning on the next
     turn. The OpenAI spec doesn't define this field but DeepSeek-
     compatible upstreams silently ignore unknown keys, so adding
     passthrough here is safe for every other provider too. */
  reasoning_content: z.string().max(500000).optional(),
}).passthrough();

export type ChatMessage = z.infer<typeof MessageSchema>;
