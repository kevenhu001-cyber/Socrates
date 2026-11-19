import { Router } from 'express';
import { requireAuth } from '../../middleware/auth.js';
import { searchLimiter, fetchLimiter } from '../../middleware/rateLimit.js';
import { searchContent } from '../../services/contentSearch.js';
import { webSearch, imageSearch } from '../../services/webSearch.js';
import { fetchBatch } from '../../services/util/fetchBatch.js';
import { getActiveApiKey } from '../../services/core/apiKey.js';

const router = Router();

router.post('/search', requireAuth, searchLimiter, async (req, res, next) => {
  try {
    const { q, scope, limit } = req.body;
    const result = await searchContent(req.userId!, { q, scope, limit });
    return res.json(result);
  } catch (err) {
    next(err);
  }
});

router.post('/web-search', requireAuth, searchLimiter, async (req, res, next) => {
  try {
    const { query, count } = req.body || {};
    let apiKeyHint = 'no-key';
    try {
      const cfg = await getActiveApiKey(req.userId);
      if (cfg && cfg.keyHint) apiKeyHint = `${cfg.keyHint}:${cfg.url || ''}:${cfg.model || ''}`;
    } catch {
      /* leave placeholder hint */
    }
    const locale = (req.headers['accept-language'] || '').split(',')[0].trim() || undefined;
    const results = await webSearch(query, count, {
      userId: req.userId ?? undefined,
      locale,
      apiKeyHint,
    });
    return res.json({ results, query: String(query || '').slice(0, 200) });
  } catch (err) {
    next(err);
  }
});

router.post('/image-search', requireAuth, searchLimiter, async (req, res, next) => {
  try {
    const { query, count } = req.body || {};
    const results = await imageSearch(query, count);
    return res.json({ results, query: String(query || '').slice(0, 200) });
  } catch (err) {
    next(err);
  }
});

router.post('/fetch-batch', requireAuth, fetchLimiter, async (req, res, next) => {
  try {
    const { urls } = req.body;
    if (!Array.isArray(urls))
      return res.status(400).json({ code: 'BAD_REQUEST', message: 'urls must be an array' });
    for (const url of urls) {
      if (typeof url !== 'string' || (!url.startsWith('https://') && !url.startsWith('http://'))) {
        return res
          .status(400)
          .json({ code: 'BAD_REQUEST', message: 'Only http(s):// URLs are allowed' });
      }
    }
    const result = await fetchBatch(urls);
    return res.json(result);
  } catch (err) {
    next(err);
  }
});

export default router;
