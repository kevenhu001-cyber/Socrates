import { Router } from 'express';
import type { NextFunction, Request, Response } from 'express';
import { and, eq } from 'drizzle-orm';
import { getDb } from '../db/index.js';
import { projectConnectorConnections } from '../db/schema.js';
import { requireAuth } from '../middleware/auth.js';
import {
  PROJECT_CONNECTOR_CATALOG, cloudProviderSelector, connectorErrorPayload, externalUserId,
  getProjectConnector, getProjectConnectorProvider, isProjectConnectorConfigured,
} from '../services/oomolProjectConnector.js';
import {
  OC_ID_PREFIX, buildOpenConnectorCatalogForCloud, buildOpenConnectorStubCatalog, ocAuthType, ocInventoryEntry,
  type OcCatalogItem,
} from '../services/openConnectorCatalog.js';
import { OPEN_CONNECTOR_CLOUD_AUTH } from '../services/openConnectorCloudAuth.generated.js';

const router = Router();
const CONNECTION_NAME = 'socrates';

function publicConnection(row: typeof projectConnectorConnections.$inferSelect | null | undefined) {
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

async function saveRequest(
  userId: string,
  provider: string,
  request: {
    id: string;
    status: string;
    connectionName?: string | null;
    connectedAccountId?: string | null;
    errorMessage?: string | null;
  },
) {
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

function appReturnUri(req: Request, provider: string) {
  const origin = process.env.APP_URL || `${req.protocol}://${req.get('host')}`;
  const url = new URL('/plugins', origin);
  url.searchParams.set('connector', provider);
  return url.toString();
}

router.get('/', requireAuth, async (req, res, next) => {
  try {
    const db = getDb();
    const rows = await db.select().from(projectConnectorConnections)
      .where(eq(projectConnectorConnections.userId, req.userId!));
    const byProvider = new Map(rows.map((row) => [row.provider, row]));
    const openConnector = await listOpenConnectorCatalogItems();
    const openConnectors = openConnector.items.map((item) => ({ ...item, connection: publicConnection(byProvider.get(item.id)) }));
    return res.json({
      mode: 'oomol-project-connector',
      configured: isProjectConnectorConfigured(),
      openConnector: { available: openConnector.available, cloud: openConnector.cloud },
      connectors: [
        ...PROJECT_CONNECTOR_CATALOG.map((item) => ({ ...item, connection: publicConnection(byProvider.get(item.id)) })),
        ...openConnectors,
      ],
    });
  } catch (error) { next(error); }
});

router.post('/:provider/connect', requireAuth, async (req, res, next) => {
  const oc = ocInventoryEntry(req.params.provider);
  if (oc) {
    await connectOpenConnector(req, res, next, oc.service, `${OC_ID_PREFIX}${oc.service}`);
    return;
  }
  const provider = getProjectConnectorProvider(req.params.provider);
  if (!provider) return res.status(404).json({ error: 'Unknown connector provider' });
  await connectViaGateway(req, res, next, { id: provider.id, service: provider.service, authType: provider.authType });
});

/* Shared OOMOL-gateway connect flow for legacy providers and (in cloud mode)
 * OpenConnector apps. Response contracts match what the frontend expects:
 * sync paths → 201 { status: 'connected', ... }; OAuth → 201
 * { requestId, authorizationUrl, expiresAt } followed by background polling. */
async function connectViaGateway(
  req: Request, res: Response, next: NextFunction,
  ref: { id: string; service: string; authType: string },
): Promise<Response | undefined> {
  const provider = getProjectConnector();
  if (!provider) return res.status(503).json({ error: 'OOMOL ProjectConnector is not configured', code: 'project_connector_not_configured' });
  try {
    if (ref.authType === 'api_key') {
      /* Per-user upstream API key (e.g. GitLab PAT). Synchronous: the SDK
       * returns a ConnectedAccount immediately; we never see the key again. */
      const apiKey = req.body && typeof req.body.apiKey === 'string' ? req.body.apiKey.trim() : '';
      if (!apiKey) return res.status(400).json({ error: 'Missing apiKey', code: 'missing_api_key' });
      const account = await provider.connect.apiKey(externalUserId(req.userId), {
        ...cloudProviderSelector(ref.service),
        connectionName: CONNECTION_NAME,
        apiKey,
      });
      await saveRequest(req.userId!, ref.id, {
        id: `sync_${Date.now()}`,
        status: 'connected',
        connectedAccountId: account.connectedAccountId,
        connectionName: CONNECTION_NAME,
      });
      return res.status(201).json({ status: 'connected', connectedAccountId: account.connectedAccountId, displayName: (account as { displayName?: string | null }).displayName || null });
    }
    if (ref.authType === 'custom_credential') {
      /* Per-user custom credential fields (e.g. QQ Mail address + auth code).
       * Synchronous: SDK returns a ConnectedAccount; we never see the values again. */
      const values = req.body && req.body.values && typeof req.body.values === 'object' && !Array.isArray(req.body.values)
        ? req.body.values : null;
      if (!values) return res.status(400).json({ error: 'Missing values object', code: 'missing_values' });
      const account = await provider.connect.customCredential(externalUserId(req.userId), {
        ...cloudProviderSelector(ref.service),
        connectionName: CONNECTION_NAME,
        values,
      });
      await saveRequest(req.userId!, ref.id, {
        id: `sync_${Date.now()}`,
        status: 'connected',
        connectedAccountId: account.connectedAccountId,
        connectionName: CONNECTION_NAME,
      });
      return res.status(201).json({ status: 'connected', connectedAccountId: account.connectedAccountId, displayName: (account as { displayName?: string | null }).displayName || null });
    }
    if (ref.authType === 'no_auth') {
      /* No credential to verify (open data APIs). Record connected directly. */
      await saveRequest(req.userId!, ref.id, {
        id: `sync_${Date.now()}`,
        status: 'connected',
        connectionName: CONNECTION_NAME,
      });
      return res.status(201).json({ status: 'connected', connectedAccountId: null, displayName: null });
    }
    /* Default: OAuth2 redirect flow. The gateway owns the OAuth callback. Persist
     * only opaque request/account IDs, never a credential, then monitor in the
     * background for a responsive UI. */
    const request = await provider.connect.oauth(externalUserId(req.userId), {
      ...cloudProviderSelector(ref.service),
      connectionName: CONNECTION_NAME,
      returnUri: appReturnUri(req, ref.id),
    });
    await saveRequest(req.userId!, ref.id, request);
    void provider.waitForConnection(request, { maxWaitMs: 610_000 }).then(
      (finalRequest) => saveRequest(req.userId!, ref.id, finalRequest),
      (error) => saveRequest(req.userId!, ref.id, { ...request, status: 'failed', errorMessage: connectorErrorPayload(error).message }),
    );
    return res.status(201).json({ requestId: request.id, authorizationUrl: request.authorizationUrl, expiresAt: request.expiresAt });
  } catch (error) {
    const payload = connectorErrorPayload(error);
    return res.status(payload.status).json({ error: payload.message, code: payload.code });
  }
}

router.get('/:provider/status', requireAuth, async (req, res, next) => {
  const oc = ocInventoryEntry(req.params.provider);
  if (oc) {
    await pollOpenConnectorStatus(req, res, next, `${OC_ID_PREFIX}${oc.service}`);
    return;
  }
  const provider = getProjectConnectorProvider(req.params.provider);
  if (!provider) return res.status(404).json({ error: 'Unknown connector provider' });
  await pollGatewayConnection(req, res, next, provider.id);
});

/* Disconnect: forget the binding Socrates-side. The OOMOL gateway grant
 * itself stays until revoked at the provider; only our row (and its UI
 * state) is removed, matching what the directory renders. */
router.delete('/:provider/connection', requireAuth, async (req, res, next) => {
  const id = String(req.params.provider || '');
  const oc = ocInventoryEntry(id);
  if (!oc && !getProjectConnectorProvider(id)) {
    return res.status(404).json({ error: 'Unknown connector provider' });
  }
  try {
    const db = getDb();
    await db.delete(projectConnectorConnections).where(and(
      eq(projectConnectorConnections.userId, req.userId!),
      eq(projectConnectorConnections.provider, id),
    ));
    return res.json({ status: 'disconnected' });
  } catch (error) {
    next(error);
  }
});

/* Shared OOMOL-gateway status poll for legacy providers and (in cloud mode)
 * OpenConnector apps. Reports the last known row when the gateway or the
 * request is gone instead of failing. */
async function pollGatewayConnection(
  req: Request, res: Response,   next: NextFunction,
  providerId: string,
): Promise<Response | undefined> {
  try {
    const db = getDb();
    const [row] = await db.select().from(projectConnectorConnections).where(and(
      eq(projectConnectorConnections.userId, req.userId!),
      eq(projectConnectorConnections.provider, providerId),
    )).limit(1);
    if (!row || !row.requestId || !isProjectConnectorConfigured()) return res.json({ connection: publicConnection(row) });
    const request = await getProjectConnector()!.getConnectionRequest(row.requestId);
    await saveRequest(req.userId!, providerId, request);
    const [updated] = await db.select().from(projectConnectorConnections).where(and(
      eq(projectConnectorConnections.userId, req.userId!),
      eq(projectConnectorConnections.provider, providerId),
    )).limit(1);
    return res.json({ connection: publicConnection(updated) });
  } catch (error) {
    const payload = connectorErrorPayload(error);
    return res.status(payload.status).json({ error: payload.message, code: payload.code });
  }
}

/* ---- OpenConnector-backed apps (oc_<service>) ----
 *
 * The OOMOL-hosted runtime owns provider metadata, credential storage and
 * action execution for these entries. Socrates owns the curated list
 * (openConnectorAppInventory), the per-user connectionName mapping, and the
 * opaque rows in projectConnectorConnections. Secrets never touch Socrates
 * storage; only gateway connection names, account ids and request ids do.
 *
 * Ids are prefixed so they can never collide with the OOMOL-gateway catalog
 * above (e.g. oc_gmail vs gmail); existing gateway connections keep working
 * untouched. Pure mapping lives in openConnectorCatalog.ts (unit-tested);
 * only the gateway/DB orchestration stays here. */

async function listOpenConnectorCatalogItems(): Promise<{ available: boolean; cloud: boolean; items: OcCatalogItem[] }> {
  /* The full phase-1 inventory always renders in the directory. When the
     OOMOL project gateway is configured, every snapshotted service is
     connectable through it (available: true); services missing from the
     snapshot stay disabled stubs. Without a configured gateway the whole
     directory is stubbed so the plugin page stays complete. */
  if (isProjectConnectorConfigured()) {
    return { available: false, cloud: true, items: buildOpenConnectorCatalogForCloud() };
  }
  return { available: false, cloud: false, items: buildOpenConnectorStubCatalog() };
}

async function connectOpenConnector(
  req: Request, res: Response, next: NextFunction,
  service: string, id: string,
): Promise<void> {
  /* Drive the provider through the OOMOL project gateway the user provisioned
   * in the cloud console (same contracts as the legacy provider routes). */
  const meta = OPEN_CONNECTOR_CLOUD_AUTH[service];
  await connectViaGateway(req, res, next, {
    id,
    service,
    authType: ocAuthType(meta ?? { authTypes: ['oauth2'], auth: [] }),
  });
}

async function pollOpenConnectorStatus(
  req: Request, res: Response, next: NextFunction,
  id: string,
): Promise<void> {
  await pollGatewayConnection(req, res, next, id);
}

export default router;

/* OAuth app configuration.
 *
 * With the OOMOL-hosted runtime, OAuth apps are provisioned in the OOMOL
 * cloud console rather than bring-your-own, so Socrates no longer collects
 * client credentials here. GET tells the frontend to proceed straight to the
 * gateway authorize redirect; PUT is retained only to reject stale clients
 * that still try to submit an OAuth app. */

router.get('/:provider/oauth-config', requireAuth, async (req, res) => {
  const oc = ocInventoryEntry(req.params.provider);
  if (!oc) return res.status(404).json({ error: 'Unknown connector provider' });
  if (!isProjectConnectorConfigured()) {
    return res.status(503).json({ error: 'OOMOL ProjectConnector is not configured', code: 'project_connector_not_configured' });
  }
  return res.json({
    service: oc.service,
    configured: true,
    clientId: null,
    expectedRedirectUri: null,
    clientSecretRequired: false,
    extraFields: [],
  });
});

router.put('/:provider/oauth-config', requireAuth, async (req, res) => {
  const oc = ocInventoryEntry(req.params.provider);
  if (!oc) return res.status(404).json({ error: 'Unknown connector provider' });
  return res.status(400).json({ error: 'OAuth apps are managed in the OOMOL console', code: 'cloud_managed' });
});
