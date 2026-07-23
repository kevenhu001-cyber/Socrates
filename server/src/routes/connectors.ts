import { Router } from 'express';
import type { Request, Response } from 'express';
import { and, eq } from 'drizzle-orm';
import { getDb } from '../db/index.js';
import { connectorConnections } from '../db/schema.js';
import { requireAuth } from '../middleware/auth.js';
import { connectorAuthLimiter, searchLimiter } from '../middleware/rateLimit.js';
import {
  completeGithubAuthorization, createOAuthState, githubCallbackUrl, githubIsConfigured,
  listGithubInstallationRepositories, verifyGithubWebhook, verifyOAuthState,
} from '../services/githubConnector.js';
import { completeFeishuAuthorization, feishuAuthorizationUrl, feishuIsConfigured } from '../services/feishuConnector.js';
import { completeGiteeAuthorization, giteeAuthorizationUrl, giteeIsConfigured, listGiteeRepositories } from '../services/giteeConnector.js';
import { completeNotionAuthorization, notionAuthorizationUrl, notionIsConfigured, searchNotionPages } from '../services/notionConnector.js';
import { createZoteroConnection, listZoteroItems, ZoteroConnectorError } from '../services/zoteroConnector.js';
import { ArxivConnectorError, searchArxivPapers } from '../services/arxivConnector.js';

const router = Router();
const CATALOG = [
  { id: 'github', name: 'GitHub', description: 'Connect repositories, issues, and pull requests.', auth: 'oauth', availability: 'available' },
  { id: 'feishu', name: 'Feishu', description: 'Connect documents you can access.', auth: 'oauth', availability: 'available' },
  { id: 'baidu-netdisk', name: 'Baidu Netdisk', description: 'Reference files from your cloud drive.', availability: 'coming_soon' },
  { id: 'gitee', name: 'Gitee', description: 'Connect repositories, issues, and pull requests.', auth: 'oauth', availability: 'available' },
  { id: 'onedrive', name: 'OneDrive', description: 'Bring in files from Microsoft 365.', availability: 'coming_soon' },
  { id: 'outlook', name: 'Outlook', description: 'Search mail and calendar context.', availability: 'coming_soon' },
  { id: 'notion', name: 'Notion', description: 'Search pages you share with Socrates.', auth: 'oauth', availability: 'available' },
  { id: 'zotero', name: 'Zotero', description: 'Search your research library with your own read-only API Key.', auth: 'api_key', availability: 'available' },
  { id: 'arxiv', name: 'arXiv', description: 'Search public preprints without connecting an account.', auth: 'public', availability: 'available' },
  { id: 'qq-mail', name: 'QQ Mail', description: 'Connect with an email authorization code.', availability: 'coming_soon' },
];

function publicConnection(row: typeof connectorConnections.$inferSelect | null | undefined) {
  if (!row) return null;
  return {
    status: row.status, displayName: row.displayName, avatarUrl: row.avatarUrl,
    installationCount: Array.isArray(row.installationIds) ? row.installationIds.length : 0,
    connectedAt: row.createdAt, updatedAt: row.updatedAt,
  };
}

router.get('/', requireAuth, async (req, res, next) => {
  try {
    const db = getDb();
    const rows = await db.select().from(connectorConnections).where(eq(connectorConnections.userId, req.userId!));
    const byProvider = new Map(rows.map((row) => [row.provider, row]));
    return res.json({ connectors: CATALOG.map((connector) => ({
      ...connector,
      configured: connector.id === 'github' ? githubIsConfigured() : connector.id === 'feishu' ? feishuIsConfigured() : connector.id === 'gitee' ? giteeIsConfigured() : connector.id === 'notion' ? notionIsConfigured() : connector.id === 'zotero' || connector.id === 'arxiv' ? true : false,
      installUrl: connector.id === 'github' && process.env.CONNECTOR_GITHUB_APP_SLUG
        ? `https://github.com/apps/${encodeURIComponent(process.env.CONNECTOR_GITHUB_APP_SLUG)}/installations/new`
        : null,
      connection: publicConnection(byProvider.get(connector.id)),
    })) });
  } catch (err) { next(err); }
});

router.get('/github/start', requireAuth, (req, res) => {
  if (!githubIsConfigured()) return res.status(503).json({ error: 'GitHub connector is not configured' });
  const params = new URLSearchParams({
    client_id: process.env.CONNECTOR_GITHUB_CLIENT_ID as string,
    redirect_uri: githubCallbackUrl(), state: createOAuthState(req.userId!),
  });
  return res.redirect(`https://github.com/login/oauth/authorize?${params.toString()}`);
});

router.get('/github/callback', requireAuth, async (req, res, next) => {
  try {
    const state = verifyOAuthState(req.query.state);
    const code = typeof req.query.code === 'string' ? req.query.code : '';
    if (!state || state.userId !== req.userId || !code || code.length > 2048) return res.redirect('/?connector=github&status=error');
    const connection = await completeGithubAuthorization(code);
    const db = getDb();
    const status = connection.installationIds.length ? 'connected' : 'needs_installation';
    await db.insert(connectorConnections).values({ userId: req.userId!, provider: 'github', ...connection, status })
      .onConflictDoUpdate({
        target: [connectorConnections.userId, connectorConnections.provider],
        set: { ...connection, status, lastError: null, updatedAt: new Date() },
      });
    return res.redirect('/?connector=github&status=connected');
  } catch (err) { next(err); }
});

router.get('/feishu/start', requireAuth, (req, res) => {
  if (!feishuIsConfigured()) return res.status(503).json({ error: 'Feishu connector is not configured' });
  return res.redirect(feishuAuthorizationUrl(createOAuthState(req.userId!)));
});

router.get('/feishu/callback', requireAuth, async (req, res, next) => {
  try {
    const state = verifyOAuthState(req.query.state);
    const code = typeof req.query.code === 'string' ? req.query.code : '';
    if (!state || state.userId !== req.userId || !code || code.length > 2048 || req.query.error) {
      return res.redirect('/?connector=feishu&status=error');
    }
    const connection = await completeFeishuAuthorization(code);
    const db = getDb();
    await db.insert(connectorConnections).values({ userId: req.userId!, provider: 'feishu', ...connection, status: 'connected' })
      .onConflictDoUpdate({
        target: [connectorConnections.userId, connectorConnections.provider],
        set: { ...connection, status: 'connected', lastError: null, updatedAt: new Date() },
      });
    return res.redirect('/?connector=feishu&status=connected');
  } catch (err) { next(err); }
});

router.get('/gitee/start', requireAuth, (req, res) => {
  if (!giteeIsConfigured()) return res.status(503).json({ error: 'Gitee connector is not configured' });
  return res.redirect(giteeAuthorizationUrl(createOAuthState(req.userId!)));
});

router.get('/gitee/callback', requireAuth, async (req, res, next) => {
  try {
    const state = verifyOAuthState(req.query.state);
    const code = typeof req.query.code === 'string' ? req.query.code : '';
    if (!state || state.userId !== req.userId || !code || code.length > 2048 || req.query.error) {
      return res.redirect('/?connector=gitee&status=error');
    }
    const connection = await completeGiteeAuthorization(code);
    const db = getDb();
    await db.insert(connectorConnections).values({ userId: req.userId!, provider: 'gitee', ...connection, status: 'connected' })
      .onConflictDoUpdate({
        target: [connectorConnections.userId, connectorConnections.provider],
        set: { ...connection, status: 'connected', lastError: null, updatedAt: new Date() },
      });
    return res.redirect('/?connector=gitee&status=connected');
  } catch (err) { next(err); }
});

router.get('/notion/start', requireAuth, (req, res) => {
  if (!notionIsConfigured()) return res.status(503).json({ error: 'Notion connector is not configured' });
  return res.redirect(notionAuthorizationUrl(createOAuthState(req.userId!)));
});

router.get('/notion/callback', requireAuth, async (req, res, next) => {
  try {
    const state = verifyOAuthState(req.query.state);
    const code = typeof req.query.code === 'string' ? req.query.code : '';
    if (!state || state.userId !== req.userId || !code || code.length > 2048 || req.query.error) {
      return res.redirect('/?connector=notion&status=error');
    }
    const connection = await completeNotionAuthorization(code);
    const db = getDb();
    await db.insert(connectorConnections).values({ userId: req.userId!, provider: 'notion', ...connection, status: 'connected' })
      .onConflictDoUpdate({
        target: [connectorConnections.userId, connectorConnections.provider],
        set: { ...connection, status: 'connected', lastError: null, updatedAt: new Date() },
      });
    return res.redirect('/?connector=notion&status=connected');
  } catch (err) { next(err); }
});

router.post('/zotero', requireAuth, connectorAuthLimiter, async (req, res, next) => {
  try {
    const apiKey = typeof req.body?.apiKey === 'string' ? req.body.apiKey.trim() : '';
    const connection = await createZoteroConnection(apiKey);
    const db = getDb();
    await db.insert(connectorConnections).values({ userId: req.userId!, provider: 'zotero', ...connection, status: 'connected' })
      .onConflictDoUpdate({
        target: [connectorConnections.userId, connectorConnections.provider],
        set: { ...connection, status: 'connected', lastError: null, updatedAt: new Date() },
      });
    return res.status(201).json({ connection: { status: 'connected', displayName: connection.displayName } });
  } catch (err) {
    if (err instanceof ZoteroConnectorError) return res.status(400).json({ code: err.code, message: err.message });
    next(err);
  }
});

router.delete('/github', requireAuth, async (req, res, next) => {
  try {
    const db = getDb();
    await db.delete(connectorConnections).where(and(eq(connectorConnections.userId, req.userId!), eq(connectorConnections.provider, 'github')));
    return res.status(204).end();
  } catch (err) { next(err); }
});

router.delete('/feishu', requireAuth, async (req, res, next) => {
  try {
    const db = getDb();
    await db.delete(connectorConnections).where(and(eq(connectorConnections.userId, req.userId!), eq(connectorConnections.provider, 'feishu')));
    return res.status(204).end();
  } catch (err) { next(err); }
});

router.delete('/gitee', requireAuth, async (req, res, next) => {
  try {
    const db = getDb();
    await db.delete(connectorConnections).where(and(eq(connectorConnections.userId, req.userId!), eq(connectorConnections.provider, 'gitee')));
    return res.status(204).end();
  } catch (err) { next(err); }
});

router.delete('/notion', requireAuth, async (req, res, next) => {
  try {
    const db = getDb();
    await db.delete(connectorConnections).where(and(eq(connectorConnections.userId, req.userId!), eq(connectorConnections.provider, 'notion')));
    return res.status(204).end();
  } catch (err) { next(err); }
});

router.delete('/zotero', requireAuth, async (req, res, next) => {
  try {
    const db = getDb();
    await db.delete(connectorConnections).where(and(eq(connectorConnections.userId, req.userId!), eq(connectorConnections.provider, 'zotero')));
    return res.status(204).end();
  } catch (err) { next(err); }
});

router.get('/github/repositories', requireAuth, async (req, res, next) => {
  try {
    const db = getDb();
    const [connection] = await db.select().from(connectorConnections)
      .where(and(eq(connectorConnections.userId, req.userId!), eq(connectorConnections.provider, 'github'))).limit(1);
    if (!connection) return res.status(404).json({ error: 'GitHub is not connected' });
    return res.json({ repositories: await listGithubInstallationRepositories(connection as unknown as Parameters<typeof listGithubInstallationRepositories>[0]) });
  } catch (err) { next(err); }
});

router.get('/gitee/repositories', requireAuth, async (req, res, next) => {
  try {
    const db = getDb();
    const [connection] = await db.select().from(connectorConnections)
      .where(and(eq(connectorConnections.userId, req.userId!), eq(connectorConnections.provider, 'gitee'))).limit(1);
    if (!connection) return res.status(404).json({ error: 'Gitee is not connected' });
    return res.json({ repositories: await listGiteeRepositories(connection) });
  } catch (err) { next(err); }
});

router.get('/notion/pages', requireAuth, async (req, res, next) => {
  try {
    const db = getDb();
    const [connection] = await db.select().from(connectorConnections)
      .where(and(eq(connectorConnections.userId, req.userId!), eq(connectorConnections.provider, 'notion'))).limit(1);
    if (!connection) return res.status(404).json({ error: 'Notion is not connected' });
    const query = typeof req.query.query === 'string' ? req.query.query.trim().slice(0, 200) : '';
    return res.json({ pages: await searchNotionPages(connection, query) });
  } catch (err) { next(err); }
});

router.get('/zotero/items', requireAuth, async (req, res, next) => {
  try {
    const db = getDb();
    const [connection] = await db.select().from(connectorConnections)
      .where(and(eq(connectorConnections.userId, req.userId!), eq(connectorConnections.provider, 'zotero'))).limit(1);
    if (!connection) return res.status(404).json({ error: 'Zotero is not connected' });
    const query = typeof req.query.query === 'string' ? req.query.query.trim().slice(0, 200) : '';
    return res.json({ items: await listZoteroItems(connection, query) });
  } catch (err) {
    if (err instanceof ZoteroConnectorError) return res.status(400).json({ code: err.code, message: err.message });
    next(err);
  }
});

router.get('/arxiv/papers', requireAuth, searchLimiter, async (req, res, next) => {
  try {
    const query = typeof req.query.query === 'string' ? req.query.query : '';
    return res.json({ papers: await searchArxivPapers(query) });
  } catch (err) {
    if (err instanceof ArxivConnectorError) return res.status(502).json({ code: err.code, message: err.message });
    next(err);
  }
});

export function githubWebhookHandler(req: Request, res: Response) {
  if (!verifyGithubWebhook(req.body, req.get('X-Hub-Signature-256'))) return res.status(401).end();
  if (req.get('X-GitHub-Event') === 'ping') return res.status(204).end();
  return res.status(202).end();
}

export default router;
