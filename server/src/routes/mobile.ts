import { Router } from 'express';

const DEFAULT_APP_URL = 'https://app.topodrive.top';

export function normalizePublicAppUrl(value?: string) {
  try {
    const url = new URL(value?.trim() || DEFAULT_APP_URL);
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return DEFAULT_APP_URL;
    return url.origin;
  } catch {
    return DEFAULT_APP_URL;
  }
}

export function buildMobileBootstrapConfig(appUrl = process.env.APP_URL) {
  const webBaseUrl = normalizePublicAppUrl(appUrl);
  return {
    ok: true as const,
    contractVersion: 1 as const,
    product: 'socrates' as const,
    platform: 'android' as const,
    webBaseUrl,
    apiBaseUrl: `${webBaseUrl}/api/v2`,
    canonicalApiBaseUrl: `${webBaseUrl}/api`,
    healthPath: '/api/v2/health' as const,
  };
}

const router = Router();

/**
 * Public, secret-free contract used by the Android shell before it opens the
 * shared SPA. The response makes API-prefix and origin drift detectable both
 * in the client and in deploy.sh's post-release gate.
 */
router.get('/bootstrap', (_req, res) => {
  res.set('Cache-Control', 'no-store');
  res.json(buildMobileBootstrapConfig());
});

export default router;
