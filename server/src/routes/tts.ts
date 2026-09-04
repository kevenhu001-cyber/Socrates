/**
 * POST /api/tts — cloud text-to-speech proxy (M4 of the LobeHub-alignment
 * plan).
 *
 * The desktop client's read-aloud previously only had the platform
 * `speechSynthesis` API. This route adds a provider-backed voice: the
 * request is forwarded, OpenAI-compatible style, to the active built-in
 * provider's `/audio/speech` endpoint and the audio bytes are streamed
 * straight to the browser (nothing is persisted).
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

const router = Router();

const MAX_TTS_CHARS = 20000;
const TTS_TIMEOUT_MS = 60000;

const VOICE_BY_LANG: Record<string, string> = {
  en: 'alloy',
  zh: 'alloy',
  ja: 'alloy',
};

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

    /* Replay cache — reading the same message twice must not re-bill the
       provider (the same guarantee LobeHub gets by persisting the TTS
       result on the message row). */
    const cacheKey = ttsCacheKey(req.userId!, input, voice, format);
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
    ttsCache.set(cacheKey, audio, upstream.headers.get('content-type') || `audio/${format}`);
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
