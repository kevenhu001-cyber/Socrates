/**
 * POST /api/tts — cloud text-to-speech proxy (M4 of the LobeHub-alignment
 * plan).
 *
 * The desktop client's read-aloud previously only had the platform
 * `speechSynthesis` API. This route adds a provider-backed voice: the
 * request is forwarded, OpenAI-compatible style, to the active built-in
 * provider's `/audio/speech` endpoint and the audio bytes are streamed
 * straight to the browser.
 *
 * M4 follow-up: when the body carries a `messageId` for an
 * assistant message the caller owns, the synthesized bytes are
 * persisted in the `tts_results` table so the next read-aloud — even
 * after a process restart — replays the persisted audio for free.
 * The process-wide `TtsCache` LRU stays as the fast in-memory tier
 * in front of the DB; on DB cache miss the route still synthesizes
 * and the response is then upserted into both tiers.
 *
 * Failure contract (the client relies on it):
 *   - 501 `tts_unavailable`  — no built-in provider key / provider has no
 *     speech endpoint. The client falls back to speechSynthesis.
 *   - 429                    — upstream rate limited.
 *   - 502 `tts_failed`       — upstream error.
 *
 * Input is hard-capped (20 KB text) so a single read-aloud cannot become
 * a billing surprise.
 */

import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { chatLimiter } from '../middleware/rateLimit.js';
import { getActiveApiKey } from '../services/apiKey.js';
import { ttsCache, ttsCacheKey } from '../services/ttsCache.js';
import {
  lookupTtsResult,
  saveTtsResult,
  ttsTextHash,
} from '../services/ttsStore.js';

const router = Router();

const MAX_TTS_CHARS = 20000;
const TTS_TIMEOUT_MS = 60000;

const VOICE_BY_LANG: Record<string, string> = {
  en: 'alloy',
  zh: 'alloy',
  ja: 'alloy',
};

/* Read a UUID-looking messageId from the body without trusting it —
   the store helper still does the owner-check before any read or
   write. We only restrict the surface here so a 5 KB blob in the
   body field cannot ride along into the persistence layer.
   Exported for unit-testing; the production path still validates
   ownership through ttsStore.verifyOwnership. */
export function readMessageId(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  if (trimmed.length > 64) return null;
  return /^[0-9a-fA-F-]{8,64}$/.test(trimmed) ? trimmed : null;
}

router.post('/', requireAuth, chatLimiter, async (req, res) => {
  try {
    const text = typeof req.body?.text === 'string' ? req.body.text : '';
    const input = text.trim().slice(0, MAX_TTS_CHARS);
    if (!input) {
      res.status(400).json({ error: 'tts_empty_input', message: 'Nothing to read.' });
      return;
    }

    const provider = await getActiveApiKey(null); // null = global built-in
    if (!provider || !provider.keyPlaintext) {
      res.status(501).json({ error: 'tts_unavailable', message: 'No voice provider configured.' });
      return;
    }

    const baseUrl = (provider.url || '').replace(/\/+$/, '');
    const lang = String(req.body?.lang || (req.headers['accept-language'] || 'en')).slice(0, 2).toLowerCase();
    const voice = typeof req.body?.voice === 'string' && req.body.voice
      ? req.body.voice
      : (VOICE_BY_LANG[lang] || 'alloy');
    const format = req.body?.format === 'mp3' || req.body?.format === 'opus' || req.body?.format === 'wav'
      ? req.body.format
      : 'mp3';
    const messageId = readMessageId(req.body?.messageId);
    const textHash = ttsTextHash(input);

    /* Tier 1 — in-process LRU. Same as before; covers same-process
       repeat reads (most common case). */
    const cacheKey = ttsCacheKey(req.userId!, input, voice, format, lang);
    const cached = ttsCache.get(cacheKey);
    if (cached) {
      res.writeHead(200, {
        'Content-Type': cached.contentType,
        'Cache-Control': 'no-store',
        'X-TTS-Cache': 'hit',
      });
      res.end(cached.audio);
      return;
    }

    /* Tier 2 — durable per-message persistence. Only consulted when
       the caller supplied a messageId we recognize as a UUID-shape;
       ownership is re-checked inside the helper so a forged id
       cannot read another user's audio. */
    if (messageId) {
      try {
        const persisted = await lookupTtsResult(
          messageId, req.userId!, voice, format, lang, textHash,
        );
        if (persisted) {
          ttsCache.set(cacheKey, persisted.audio, persisted.contentType);
          res.writeHead(200, {
            'Content-Type': persisted.contentType,
            'Cache-Control': 'no-store',
            'X-TTS-Cache': 'hit',
          });
          res.end(persisted.audio);
          return;
        }
      } catch (err) {
        /* DB unavailable — fall through to synthesize. The next
           same-process repeat will still hit tier 1. */
        console.warn('[tts] db lookup failed:', (err as Error).message);
      }
    }

    const upstream = await fetch(`${baseUrl}/audio/speech`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${provider.keyPlaintext}`,
      },
      body: JSON.stringify({
        model: 'tts-1',
        input,
        voice,
        response_format: format,
      }),
      signal: AbortSignal.timeout(TTS_TIMEOUT_MS),
    });

    if (!upstream.ok || !upstream.body) {
      const detail = await upstream.text().catch(() => '');
      if (upstream.status === 429) {
        res.status(429).json({ error: 'tts_rate_limited', message: 'Voice service is busy; try again shortly.' });
        return;
      }
      console.warn(`[tts] upstream ${upstream.status}: ${detail.slice(0, 200)}`);
      res.status(502).json({ error: 'tts_failed', message: 'Voice service failed.' });
      return;
    }

    res.writeHead(200, {
      'Content-Type': upstream.headers.get('content-type') || `audio/${format}`,
      'Cache-Control': 'no-store',
      'X-TTS-Cache': 'miss',
    });
    const chunks: Buffer[] = [];
    const reader = upstream.body.getReader();
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(Buffer.from(value));
        res.write(chunks[chunks.length - 1]);
      }
    } finally {
      reader.releaseLock();
    }
    res.end();
    const audio = Buffer.concat(chunks);
    const contentType = upstream.headers.get('content-type') || `audio/${format}`;

    /* Always populate the in-memory tier; persist to DB only when the
       caller supplied a usable messageId. A DB write failure is logged
       and swallowed — the response already went out and the in-memory
       tier still serves the same-process repeat. */
    ttsCache.set(cacheKey, audio, contentType);
    if (messageId) {
      try {
        await saveTtsResult(
          messageId, req.userId!, voice, format, lang, textHash, audio, contentType,
        );
      } catch (err) {
        console.warn('[tts] db persist failed:', (err as Error).message);
      }
    }
  } catch (err) {
    console.warn('[tts] failed:', (err as Error).message);
    if (!res.headersSent) {
      res.status(502).json({ error: 'tts_failed', message: 'Voice service failed.' });
    } else {
      res.end();
    }
  }
});

export default router;
