import { Router } from 'express';
import { eq, and } from 'drizzle-orm';
import { getDb } from '../../db/index.js';
import { artifacts as artifactsTable } from '../../db/schema/index.js';

const router = Router();

router.get('/:token', async (req, res, next) => {
  try {
    const [site] = await getDb()
      .select()
      .from(artifactsTable)
      .where(and(eq(artifactsTable.shareToken, req.params.token), eq(artifactsTable.type, 'site')))
      .limit(1);
    if (!site || (site.visibility !== 'public' && site.visibility !== 'unlisted')) {
      return res.status(404).send('Site not found');
    }
    res.setHeader(
      'Content-Security-Policy',
      "default-src 'none'; style-src 'unsafe-inline'; img-src https: data:; font-src https: data:; sandbox",
    );
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    return res.send(site.source);
  } catch (error) {
    next(error);
  }
});

export default router;
