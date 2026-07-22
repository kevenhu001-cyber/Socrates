import { Router } from 'express';
import { and, eq } from 'drizzle-orm';
import { getDb } from '../db/index.js';
import { projectConnectorConnections } from '../db/schema.js';
import { requireAuth } from '../middleware/auth.js';
import {
  PROJECT_CONNECTOR_CATALOG, connectorErrorPayload, externalUserId,
  getProjectConnector, getProjectConnectorProvider, isProjectConnectorConfigured,
} from '../services/oomolProjectConnector.js';

const router = Router();
const CONNECTION_NAME = 'socrates';

function publicConnection(row) {
  if (!row) return null;
  return {
    status: row.status,
    connectionName: row.connectionName,
    requestId: row.requestId,
    connectedAccountId: row.connectedAccountId,
    displayName: row.displayName,
    updatedAt: row.updatedAt,
    lastError: row.lastError,
  };
}

async function saveRequest(userId, provider, request) {
  const db = getDb();
  const status = request.status === 'connected' ? 'connected' : request.status;
  await db.insert(projectConnectorConnections).values({
    userId, provider, connectionName: request.connectionName || CONNECTION_NAME,
    requestId: request.id, connectedAccountId: request.connectedAccountId || null,
    status, lastError: request.errorMessage || null,
  }).onConflictDoUpdate({
    target: [projectConnectorConnections.userId, projectConnectorConnections.provider],
    set: {
      connectionName: request.connectionName || CONNECTION_NAME,
      requestId: request.id,
      connectedAccountId: request.connectedAccountId || null,
      status, lastError: request.errorMessage || null, updatedAt: new Date(),
    },
  });
}

function appReturnUri(req, provider) {
  const origin = process.env.APP_URL || `${req.protocol}://${req.get('host')}`;
  const url = new URL('/plugins', origin);
  url.searchParams.set('connector', provider);
  return url.toString();
}

router.get('/', requireAuth, async (req, res, next) => {
  try {
    const db = getDb();
    const rows = await db.select().from(projectConnectorConnections)
      .where(eq(projectConnectorConnections.userId, req.userId));
    const byProvider = new Map(rows.map((row) => [row.provider, row]));
    return res.json({
      mode: 'oomol-project-connector',
      configured: isProjectConnectorConfigured(),
      connectors: PROJECT_CONNECTOR_CATALOG.map((item) => ({ ...item, connection: publicConnection(byProvider.get(item.id)) })),
    });
  } catch (error) { next(error); }
});

router.post('/:provider/connect', requireAuth, async (req, res, next) => {
  const provider = getProjectConnectorProvider(req.params.provider);
  if (!provider) return res.status(404).json({ error: 'Unknown connector provider' });
  const project = getProjectConnector();
  if (!project) return res.status(503).json({ error: 'OOMOL ProjectConnector is not configured', code: 'project_connector_not_configured' });
  try {
    const request = await project.connect.oauth(externalUserId(req.userId), {
      service: provider.service,
      connectionName: CONNECTION_NAME,
      returnUri: appReturnUri(req, provider.id),
    });
    /* The gateway owns the OAuth callback. Persist only opaque request/account IDs,
       never a credential, then monitor in the background for a responsive UI. */
    await saveRequest(req.userId, provider.id, request);
    void project.waitForConnection(request, { maxWaitMs: 610_000 }).then(
      (finalRequest) => saveRequest(req.userId, provider.id, finalRequest),
      (error) => saveRequest(req.userId, provider.id, { ...request, status: 'failed', errorMessage: connectorErrorPayload(error).message }),
    );
    return res.status(201).json({ requestId: request.id, authorizationUrl: request.authorizationUrl, expiresAt: request.expiresAt });
  } catch (error) {
    const payload = connectorErrorPayload(error);
    return res.status(payload.status).json({ error: payload.message, code: payload.code });
  }
});

router.get('/:provider/status', requireAuth, async (req, res, next) => {
  const provider = getProjectConnectorProvider(req.params.provider);
  if (!provider) return res.status(404).json({ error: 'Unknown connector provider' });
  try {
    const db = getDb();
    const [row] = await db.select().from(projectConnectorConnections).where(and(
      eq(projectConnectorConnections.userId, req.userId),
      eq(projectConnectorConnections.provider, provider.id),
    )).limit(1);
    if (!row || !row.requestId || !isProjectConnectorConfigured()) return res.json({ connection: publicConnection(row) });
    const request = await getProjectConnector().getConnectionRequest(row.requestId);
    await saveRequest(req.userId, provider.id, request);
    const [updated] = await db.select().from(projectConnectorConnections).where(and(
      eq(projectConnectorConnections.userId, req.userId),
      eq(projectConnectorConnections.provider, provider.id),
    )).limit(1);
    return res.json({ connection: publicConnection(updated) });
  } catch (error) {
    const payload = connectorErrorPayload(error);
    return res.status(payload.status).json({ error: payload.message, code: payload.code });
  }
});

export default router;
