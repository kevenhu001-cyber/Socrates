import { createHash, timingSafeEqual } from 'node:crypto';
import { Router } from 'express';
import { getRequestMetrics } from '../services/util/statusMonitor.js';

const router = Router();

/** Internal process diagnostics are deliberately absent unless an operator
 * explicitly configures a high-entropy bearer token. Never use proxy headers
 * as an access-control signal: they are client-controlled at this boundary. */
router.get('/', (req, res) => {
  const configuredToken = process.env.INTERNAL_METRICS_TOKEN || '';
  if (Buffer.byteLength(configuredToken, 'utf8') < 32) return res.status(404).end();

  const supplied = req.get('authorization') || '';
  const match = /^Bearer ([^\s]+)$/.exec(supplied);
  if (!match) return res.status(401).json({ error: 'Unauthorized' });

  // Hash both values first so timingSafeEqual always receives same-size buffers,
  // including when the supplied token has a different length.
  const expectedDigest = createHash('sha256').update(configuredToken).digest();
  const suppliedDigest = createHash('sha256').update(match[1]).digest();
  if (!timingSafeEqual(expectedDigest, suppliedDigest)) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  const memory = process.memoryUsage();
  res.set('Cache-Control', 'no-store');
  return res.json({
    uptimeSeconds: process.uptime(),
    process: {
      pid: process.pid,
      memory: {
        rssBytes: memory.rss,
        heapTotalBytes: memory.heapTotal,
        heapUsedBytes: memory.heapUsed,
        externalBytes: memory.external,
        arrayBuffersBytes: memory.arrayBuffers,
      },
    },
    requests: getRequestMetrics(),
    activeSseConnections: Number.isFinite(req.app.locals.sseCount)
      ? Math.max(0, req.app.locals.sseCount)
      : 0,
  });
});

export default router;
