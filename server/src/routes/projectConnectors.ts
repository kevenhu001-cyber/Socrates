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
  OC_ID_PREFIX, buildOpenConnectorCatalogForCloud, buildOpenConnectorCatalogWithFallback, ocAuthType, ocInventoryEntry, ocOAuthAppForm,
  type OcCatalogItem, type OcInventoryRef,
} from '../services/openConnectorCatalog.js';
import { OPEN_CONNECTOR_CLOUD_AUTH } from '../services/openConnectorCloudAuth.generated.js';
import {
  SidecarError, connectionNameForUser, deleteSidecarConnection, getSidecarConnectionStatus, getSidecarOAuthConfig,
  isOpenConnectorSidecarConfigured, listSidecarProviders, startSidecarOAuth,
  upsertSidecarConnection, upsertSidecarOAuthConfig, type SidecarProvider,
} from '../services/openConnectorSidecar.js';

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
    await connectOpenConnector(req, res, next, oc.entry, oc.service, `${OC_ID_PREFIX}${oc.service}`);
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
    await pollOpenConnectorStatus(req, res, next, oc.service, `${OC_ID_PREFIX}${oc.service}`);
    return;
  }
  const provider = getProjectConnectorProvider(req.params.provider);
  if (!provider) return res.status(404).json({ error: 'Unknown connector provider' });
  await pollGatewayConnection(req, res, next, provider.id);
});

/* Disconnect: forget the binding Socrates-side. In sidecar mode the sidecar
 * connection is dropped too (best effort — a sidecar failure never blocks
 * the local unbind). In OOMOL-cloud mode the gateway grant itself stays
 * until revoked at the provider; only our row (and its UI state) is
 * removed, matching what the directory renders. */
router.delete('/:provider/connection', requireAuth, async (req, res, next) => {
  const id = String(req.params.provider || '');
  const oc = ocInventoryEntry(id);
  if (!oc && !getProjectConnectorProvider(id)) {
    return res.status(404).json({ error: 'Unknown connector provider' });
  }
  try {
    if (oc && isOpenConnectorSidecarConfigured()) {
      try {
        await deleteSidecarConnection({ service: oc.service, connectionName: connectionNameForUser(req.userId) });
      } catch {
        /* Local unbind stays authoritative; surfaced via updatedAt below. */
      }
    }
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
 * The vendored OpenConnector sidecar owns provider metadata, credential
 * storage and action execution for these entries. Socrates owns the curated
 * list (openConnectorAppInventory), the per-user connectionName mapping, and
 * the opaque rows in projectConnectorConnections. Secrets never touch
 * Socrates storage; only sidecar connection names and request ids do.
 *
 * Ids are prefixed so they can never collide with the OOMOL-gateway catalog
 * above (e.g. oc_gmail vs gmail); existing gateway connections keep working
 * untouched. Pure mapping lives in openConnectorCatalog.ts (unit-tested);
 * only the HTTP/DB orchestration stays here. */

async function listOpenConnectorCatalogItems(): Promise<{ available: boolean; cloud: boolean; items: OcCatalogItem[] }> {
  /* The full phase-1 inventory always renders in the directory — apps
     the sidecar cannot serve yet come back as disabled stubs
     (available: false) so the plugin page is complete before the
     sidecar is online. When the sidecar is configured, served apps
     switch to their real provider metadata (available: true).
     OOMOL-cloud mode (sidecar down, project key configured): every
     snapshotted service is connectable through the OOMOL gateway the
     user provisioned in the cloud console. */
  if (!isOpenConnectorSidecarConfigured()) {
    if (isProjectConnectorConfigured()) {
      return { available: false, cloud: true, items: buildOpenConnectorCatalogForCloud() };
    }
    return { available: false, cloud: false, items: buildOpenConnectorCatalogWithFallback(null) };
  }
  try {
    const providers = await listSidecarProviders();
    return { available: true, cloud: false, items: buildOpenConnectorCatalogWithFallback(providers) };
  } catch {
    if (isProjectConnectorConfigured()) {
      return { available: false, cloud: true, items: buildOpenConnectorCatalogForCloud() };
    }
    return { available: false, cloud: false, items: buildOpenConnectorCatalogWithFallback(null) };
  }
}

async function findSidecarProvider(service: string): Promise<SidecarProvider> {
  const providers = await listSidecarProviders();
  const meta = providers.find((item) => item.service === service);
  if (!meta) throw new SidecarError(503, 'sidecar_provider_missing', `The sidecar does not serve ${service}.`);
  return meta;
}

async function connectOpenConnector(
  req: Request, res: Response, next: NextFunction,
  entry: OcInventoryRef['entry'], service: string, id: string,
): Promise<void> {
  /* OOMOL-cloud mode: drive the provider through the project gateway the
   * user provisioned in the OOMOL cloud console (same contracts as the
   * legacy provider routes). */
  if (!isOpenConnectorSidecarConfigured() && isProjectConnectorConfigured()) {
    const meta = OPEN_CONNECTOR_CLOUD_AUTH[service];
    await connectViaGateway(req, res, next, {
      id,
      service,
      authType: ocAuthType(meta ?? { authTypes: ['oauth2'], auth: [] }),
    });
    return;
  }
  try {
    const meta = await findSidecarProvider(service);
    const authType = ocAuthType(meta);
    const connectionName = connectionNameForUser(req.userId);
    if (authType === 'api_key') {
      const apiKey = req.body && typeof req.body.apiKey === 'string' ? req.body.apiKey.trim() : '';
      if (!apiKey) { res.status(400).json({ error: 'Missing apiKey', code: 'missing_api_key' }); return; }
      const summary = await upsertSidecarConnection({ service, connectionName, authType: 'api_key', values: { apiKey } });
      await saveOpenConnectorConnection(req.userId!, id, connectionName, summary);
      res.status(201).json({ status: 'connected' });
      return;
    }
    if (authType === 'custom_credential') {
      const values = req.body && req.body.values && typeof req.body.values === 'object' && !Array.isArray(req.body.values)
        ? req.body.values as Record<string, unknown> : null;
      if (!values) { res.status(400).json({ error: 'Missing values object', code: 'missing_values' }); return; }
      const summary = await upsertSidecarConnection({ service, connectionName, authType: 'custom_credential', values });
      await saveOpenConnectorConnection(req.userId!, id, connectionName, summary);
      res.status(201).json({ status: 'connected' });
      return;
    }
    if (authType === 'no_auth') {
      const summary = await upsertSidecarConnection({ service, connectionName, authType: 'no_auth' });
      await saveOpenConnectorConnection(req.userId!, id, connectionName, summary);
      res.status(201).json({ status: 'connected' });
      return;
    }
    const authorization = await startSidecarOAuth({ service, connectionName });
    await saveRequest(req.userId!, id, {
      id: authorization.state || `oauth_${Date.now()}`,
      status: 'pending',
      connectionName,
    });
    res.status(201).json({ authorizationUrl: authorization.authorizationUrl });
  } catch (error) {
    if (error instanceof SidecarError) {
      res.status(error.status).json({ error: error.message, code: error.code });
      return;
    }
    next(error);
  }
}

async function saveOpenConnectorConnection(
  userId: string, id: string, connectionName: string, summary: unknown,
): Promise<void> {
  const data = ((summary || {}) as { data?: Record<string, unknown> });
  const flat = (data.data && typeof data.data === 'object' ? data.data : summary || {}) as Record<string, unknown>;
  await saveRequest(userId, id, {
    id: typeof flat.id === 'string' && flat.id ? flat.id : `sync_${Date.now()}`,
    status: 'connected',
    connectionName,
  });
}

async function pollOpenConnectorStatus(
  req: Request, res: Response, next: NextFunction,
  service: string, id: string,
): Promise<void> {
  /* OOMOL-cloud mode: poll the gateway connection request like legacy. */
  if (!isOpenConnectorSidecarConfigured() && isProjectConnectorConfigured()) {
    await pollGatewayConnection(req, res, next, id);
    return;
  }
  try {
    const db = getDb();
    const [row] = await db.select().from(projectConnectorConnections).where(and(
      eq(projectConnectorConnections.userId, req.userId!),
      eq(projectConnectorConnections.provider, id),
    )).limit(1);
    if (!row) { res.json({ connection: null }); return; }
    try {
      const live = await getSidecarConnectionStatus({
        service,
        connectionName: row.connectionName || connectionNameForUser(req.userId),
      });
      const status = live.connected ? 'connected' : (row.status === 'connected' ? 'disconnected' : row.status);
      await saveRequest(req.userId!, id, {
        id: row.requestId || `poll_${Date.now()}`,
        status,
        connectionName: row.connectionName,
        connectedAccountId: row.connectedAccountId,
      });
    } catch {
      /* Sidecar unreachable: report the last known row instead of failing. */
    }
    const [updated] = await db.select().from(projectConnectorConnections).where(and(
      eq(projectConnectorConnections.userId, req.userId!),
      eq(projectConnectorConnections.provider, id),
    )).limit(1);
    res.json({ connection: publicConnection(updated) });
  } catch (error) {
    next(error);
  }
}

export default router;

/* User-supplied OAuth app configuration.
 *
 * The sidecar intentionally requires users to bring their own OAuth app, so
 * Socrates exposes a gateway entry for it: the frontend first reads the
 * expected redirect URI plus the required fields here, the user registers
 * that URI in their own provider OAuth app, submits the client credentials,
 * and only then starts the authorize redirect. The client secret is accepted
 * on write and never echoed back. Note the app registration itself is shared
 * per service on the sidecar; each user's grant stays isolated through their
 * namespaced connection. */

router.get('/:provider/oauth-config', requireAuth, async (req, res) => {
  const oc = ocInventoryEntry(req.params.provider);
  if (!oc) return res.status(404).json({ error: 'Unknown connector provider' });
  /* OOMOL-cloud mode: OAuth apps are provisioned in the OOMOL cloud console,
   * so there is nothing to bring-your-own here — tell the frontend to
   * proceed straight to the gateway authorize redirect. */
  if (!isOpenConnectorSidecarConfigured() && isProjectConnectorConfigured()) {
    return res.json({
      service: oc.service,
      configured: true,
      clientId: null,
      expectedRedirectUri: null,
      clientSecretRequired: false,
      extraFields: [],
    });
  }
  try {
    const meta = await findSidecarProvider(oc.service);
    if (ocAuthType(meta) !== 'oauth') {
      return res.status(400).json({ error: 'This app does not use OAuth', code: 'not_oauth' });
    }
    const summary = await getSidecarOAuthConfig(oc.service);
    const form = ocOAuthAppForm(summary?.auth);
    return res.json({
      service: oc.service,
      configured: summary?.configured === true,
      clientId: summary?.clientId || null,
      expectedRedirectUri: summary?.expectedRedirectUri || null,
      clientSecretRequired: form.clientSecretRequired,
      extraFields: form.extraFields,
    });
  } catch (error) {
    if (error instanceof SidecarError) {
      return res.status(error.status).json({ error: error.message, code: error.code });
    }
    throw error;
  }
});

router.put('/:provider/oauth-config', requireAuth, async (req, res) => {
  const oc = ocInventoryEntry(req.params.provider);
  if (!oc) return res.status(404).json({ error: 'Unknown connector provider' });
  if (!isOpenConnectorSidecarConfigured() && isProjectConnectorConfigured()) {
    return res.status(400).json({ error: 'OAuth apps are managed in the OOMOL console in cloud mode', code: 'cloud_managed' });
  }
  try {
    const meta = await findSidecarProvider(oc.service);
    if (ocAuthType(meta) !== 'oauth') {
      return res.status(400).json({ error: 'This app does not use OAuth', code: 'not_oauth' });
    }
    const body = (req.body && typeof req.body === 'object' ? req.body : {}) as Record<string, unknown>;
    const clientId = typeof body.clientId === 'string' ? body.clientId.trim() : '';
    const clientSecret = typeof body.clientSecret === 'string' ? body.clientSecret : '';
    if (!clientId) return res.status(400).json({ error: 'Missing clientId', code: 'missing_client_id' });
    const summary = await upsertSidecarOAuthConfig({
      service: oc.service,
      clientId,
      clientSecret,
      extra: (body.extra && typeof body.extra === 'object' && !Array.isArray(body.extra) ? body.extra : {}) as Record<string, unknown>,
      secretExtra: (body.secretExtra && typeof body.secretExtra === 'object' && !Array.isArray(body.secretExtra) ? body.secretExtra : {}) as Record<string, unknown>,
    });
    const form = ocOAuthAppForm(summary?.auth);
    return res.json({
      service: oc.service,
      configured: summary?.configured === true,
      clientId: summary?.clientId || null,
      expectedRedirectUri: summary?.expectedRedirectUri || null,
      clientSecretRequired: form.clientSecretRequired,
      extraFields: form.extraFields,
    });
  } catch (error) {
    if (error instanceof SidecarError) {
      return res.status(error.status).json({ error: error.message, code: error.code });
    }
    throw error;
  }
});
