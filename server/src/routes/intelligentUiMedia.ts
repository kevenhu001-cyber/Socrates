import { Router, type RequestHandler } from 'express';
import rateLimit from 'express-rate-limit';
import { requireAuth } from '../middleware/auth.js';
import * as media from '../services/intelligentUiMedia.js';
import { ApiError } from '../lib/errors.js';

export function createIntelligentUiMediaRouter(authenticate: RequestHandler = requireAuth, services = media) {
  const router = Router();
  router.use(authenticate);
  router.use(rateLimit({ windowMs: 60_000, max: 360, standardHeaders: true, legacyHeaders: false, keyGenerator: (req) => req.userId || req.ip || 'anonymous' }));
  const search = rateLimit({ windowMs: 60_000, max: 40, standardHeaders: true, legacyHeaders: false, keyGenerator: (req) => req.userId || req.ip || 'anonymous' });
  const handle = (action: RequestHandler): RequestHandler => async (req, res, next) => {
    try { await action(req, res, next); }
    catch (error) {
      if (!res.headersSent) res.set('Cache-Control', 'no-store');
      next(error instanceof ApiError ? error : new ApiError(502, 'UI_REMOTE_UNAVAILABLE', 'The map or image service is temporarily unavailable'));
    }
  };
  router.get('/images', search, handle(async (req, res) => {
    const query = services.queryText(req.query.q);
    res.set('Cache-Control', 'private, max-age=300').json({ images: await services.searchUiImages(query), query });
  }));
  router.get('/places', search, handle(async (req, res) => {
    const query = services.queryText(req.query.q);
    res.set('Cache-Control', 'private, max-age=3600').json({ places: await services.lookupUiPlaces(query), query });
  }));
  router.get('/route', search, handle(async (req, res) => {
    const coordinates = services.parseRouteCoordinates(req.query.coords);
    res.set('Cache-Control', 'private, max-age=600').json(await services.lookupUiRoute(coordinates));
  }));
  router.get('/maps/planet', handle(async (_req, res) => {
    res.set('Cache-Control', 'private, max-age=3600').json(await services.getMapPlanet());
  }));
  const binary = (action: (req: Parameters<RequestHandler>[0]) => ReturnType<typeof media.getUiImage>): RequestHandler => handle(async (req, res) => {
    const { bytes, type } = await action(req);
    res.set({ 'Content-Type': type, 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'private, max-age=86400' }).send(bytes);
  });
  router.get('/image', binary((req) => services.getUiImage(req.query.url)));
  router.get('/maps/tiles/:release/:z/:x/:file', binary((req) => services.getMapTile(String(req.params.release), String(req.params.z), String(req.params.x), String(req.params.file))));
  router.get('/maps/fonts/:stack/:range', binary((req) => services.getMapGlyph(String(req.params.stack), String(req.params.range))));
  router.get('/attribution/:provider', (req, res) => {
    const links: Record<string, string> = { openstreetmap: 'https://www.openstreetmap.org/copyright', openfreemap: 'https://openfreemap.org', openmaptiles: 'https://www.openmaptiles.org' };
    const link = links[String(req.params.provider)];
    if (!link || !Object.hasOwn(links, String(req.params.provider))) return res.status(404).end();
    return res.redirect(link);
  });
  return router;
}

export default createIntelligentUiMediaRouter();
