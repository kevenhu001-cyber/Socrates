import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { visionLimiter } from '../middleware/rateLimit.js';
import { audit } from '../middleware/audit.js';
import { describeImage } from '../services/vision.js';

const router = Router();

/**
 * POST /api/vision/describe
 *
 * Body: { dataUrl: string, prompt?: string }
 *
 * Runs `mmx vision describe` against the uploaded image and returns
 * a text description. The frontend uses this when the user attaches
 * an image so the LLM gets image context even on non-vision
 * upstreams (the image_url parts are still sent to vision-capable
 * models; the description is prepended to the text for everyone).
 *
 * Auth: required (mounted after requireAuth).
 * Limiter: visionLimiter — separate pool from chatLimiter because
 *   vision calls cost upstream quota + ~150-300 ms CLI spawn that
 *   chat's retries shouldn't be conflated with.
 * Audit: every successful describe is logged so operators can see
 *   who is using the upstream vision quota.
 */
router.post('/describe', requireAuth, visionLimiter, audit('vision:describe'), async (req, res, next) => {
  try {
    const { dataUrl, prompt } = req.body || {};
    const result = await describeImage({ dataUrl, prompt });
    return res.json(result);
  } catch (err) {
    const e = err as { status?: number; message?: string };
    if (e && e.status) {
      return res.status(e.status).json({ code: 'VISION_ERROR', message: e.message });
    }
    next(err);
  }
});

export default router;
