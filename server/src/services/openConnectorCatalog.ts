/* Pure catalog mapping for OpenConnector-backed directory apps.
 *
 * The vendored OpenConnector sidecar owns provider metadata; this module
 * owns how Socrates presents it: stable oc_<service> ids (never colliding
 * with the OOMOL-gateway catalog), user-confirmed display names from the
 * inventory, and credential forms shaped for the existing frontend dialog.
 */

import { OPEN_CONNECTOR_APP_INVENTORY, READY_CONNECTOR_APPS } from './openConnectorAppInventory.js';
import type { OpenConnectorAppEntry } from './openConnectorAppInventory.js';
import type { SidecarProvider } from './openConnectorSidecar.js';
import { OPEN_CONNECTOR_CLOUD_AUTH } from './openConnectorCloudAuth.generated.js';

export const OC_ID_PREFIX = 'oc_';

/* Minimal provider metadata shared by the sidecar path (live SidecarProvider)
 * and the OOMOL-cloud path (static OPEN_CONNECTOR_CLOUD_AUTH snapshot).
 * SidecarProvider is structurally assignable to OcProviderMeta. */
export interface OcAuthField {
  key: string;
  label?: string;
  inputType?: string;
  secret?: boolean;
  required?: boolean;
  placeholder?: string;
  description?: string;
}

export interface OcAuthEntry {
  type: string;
  label?: string;
  placeholder?: string;
  description?: string;
  fields?: OcAuthField[];
}

export interface OcProviderMeta {
  authTypes: string[];
  auth: OcAuthEntry[];
  categories?: string[];
  actions?: unknown[];
  /** Cloud snapshot only: number of provider actions (no live actions array). */
  actionCount?: number;
}

export type OcAuthType = 'oauth' | 'api_key' | 'custom_credential' | 'no_auth';

export interface OcCredentialField {
  key: string;
  label: string;
  type: string;
  required: boolean;
  help?: string;
}

export interface OcCatalogItem {
  id: string;
  service: string;
  name: string;
  description: string;
  capabilities: string[];
  authType: OcAuthType;
  /** False when the OpenConnector sidecar is not serving this app yet
   * (catalog is shown anyway so the directory stays full; the frontend
   * renders the Connect action disabled). */
  available: boolean;
  credentialInput?: { fields: OcCredentialField[] };
}

export type OcInventoryRef = {
  entry: (typeof OPEN_CONNECTOR_APP_INVENTORY)[number];
  service: string;
};

export function ocInventoryEntry(id: unknown): OcInventoryRef | null {
  const raw = String(id || '').toLowerCase();
  if (!raw.startsWith(OC_ID_PREFIX)) return null;
  const service = raw.slice(OC_ID_PREFIX.length).toLowerCase();
  if (!service) return null;
  const entry = OPEN_CONNECTOR_APP_INVENTORY.find((item) => item.status === 'ready' && item.ocService === service);
  return entry ? { entry, service } : null;
}

export function ocAuthType(meta: OcProviderMeta): OcAuthType {
  const types = meta.authTypes || [];
  if (types.includes('oauth2')) return 'oauth';
  if (types.includes('api_key')) return 'api_key';
  if (types.includes('custom_credential')) return 'custom_credential';
  return 'no_auth';
}

export function ocCredentialInput(meta: OcProviderMeta, authType: OcAuthType): OcCatalogItem['credentialInput'] {
  if (authType === 'api_key') {
    const config = meta.auth.find((item) => item.type === 'api_key');
    return { fields: [{
      key: 'apiKey',
      label: config?.label || 'API Key',
      type: 'password',
      required: true,
      help: config?.description || config?.placeholder || undefined,
    }] };
  }
  if (authType === 'custom_credential') {
    const config = meta.auth.find((item) => item.type === 'custom_credential');
    return { fields: (config?.fields || []).map((field) => ({
      key: field.key,
      label: field.label || field.key,
      type: field.secret ? 'password' : (field.inputType === 'email' ? 'email' : 'text'),
      required: field.required !== false,
      help: field.description || field.placeholder || undefined,
    })) };
  }
  return undefined;
}

export interface OcOAuthAppField extends OcCredentialField {
  secret: boolean;
}

export interface OcOAuthAppForm {
  clientSecretRequired: boolean;
  extraFields: OcOAuthAppField[];
}

export function ocOAuthAppForm(auth: {
  tokenEndpointAuthMethod?: string;
  clientConfigFields?: Array<{
    key: string; label: string; inputType?: string; required?: boolean; secret?: boolean;
    placeholder?: string; description?: string; location?: string;
  }>;
} | null | undefined): OcOAuthAppForm {
  const fields = Array.isArray(auth?.clientConfigFields) ? auth.clientConfigFields : [];
  return {
    clientSecretRequired: auth?.tokenEndpointAuthMethod !== 'none',
    extraFields: fields.map((field) => ({
      key: field.key,
      label: field.label,
      type: field.secret || field.location === 'secretExtra' ? 'password' : (field.inputType === 'email' ? 'email' : 'text'),
      required: field.required !== false,
      help: field.description || field.placeholder || undefined,
      secret: Boolean(field.secret || field.location === 'secretExtra'),
    })),
  };
}

export function buildOpenConnectorCatalogItems(providers: SidecarProvider[]): OcCatalogItem[] {
  const byService = new Map(providers.map((item) => [item.service, item]));
  const items: OcCatalogItem[] = [];
  for (const entry of OPEN_CONNECTOR_APP_INVENTORY) {
    if (entry.status !== 'ready' || !entry.ocService) continue;
    const meta = byService.get(entry.ocService);
    if (!meta) continue;
    items.push(ocCatalogItem(entry, meta));
  }
  return items;
}

export function ocStubCatalogItem(entry: OpenConnectorAppEntry): OcCatalogItem {
  return {
    id: `${OC_ID_PREFIX}${entry.ocService}`,
    service: entry.ocService as string,
    name: entry.displayName,
    description: `Connect ${entry.displayName} to use its actions in chat. (via OpenConnector)`,
    capabilities: ['Actions'],
    authType: 'oauth',
    available: false,
  };
}

/* Full directory builder: every phase-1 inventory service appears in the
 * catalog. Apps the sidecar actually serves get the real provider
 * metadata (available: true); the rest become disabled stubs so the
 * plugin page stays complete even before the sidecar comes online.
 * Pass null when the sidecar is unreachable to stub everything.
 *
 * The inventory can map several entries onto one ocService (e.g. 网易邮箱
 * and 网易企业邮箱 both use netease_mail); the directory dedupes by
 * service so every row has a unique id and connects one sidecar app. */
export function buildOpenConnectorCatalogWithFallback(providers: SidecarProvider[] | null): OcCatalogItem[] {
  const byService = new Map((providers || []).map((item) => [item.service, item]));
  const seen = new Set<string>();
  const items: OcCatalogItem[] = [];
  for (const entry of READY_CONNECTOR_APPS) {
    if (!entry.ocService || seen.has(entry.ocService)) continue;
    seen.add(entry.ocService);
    const meta = byService.get(entry.ocService);
    items.push(meta ? ocCatalogItem(entry, meta) : ocStubCatalogItem(entry));
  }
  return items;
}
export function ocCatalogItem(
  entry: (typeof OPEN_CONNECTOR_APP_INVENTORY)[number],
  meta: OcProviderMeta,
): OcCatalogItem {
  const authType = ocAuthType(meta);
  const actionCount = Array.isArray(meta.actions) ? meta.actions.length : (meta.actionCount ?? 0);
  return {
    id: `${OC_ID_PREFIX}${entry.ocService}`,
    service: entry.ocService as string,
    name: entry.displayName,
    description: `Connect ${entry.displayName} to use its ${actionCount} actions in chat. (via OpenConnector)`,
    capabilities: Array.isArray(meta.categories) && meta.categories.length > 0 ? meta.categories : ['Actions'],
    authType,
    available: true,
    ...(ocCredentialInput(meta, authType) ? { credentialInput: ocCredentialInput(meta, authType) } : {}),
  };
}

/* OOMOL-cloud directory builder: same inventory rows as the sidecar fallback,
 * but every snapshotted service is connectable through the OOMOL project
 * gateway (the user provisions providers in the OOMOL cloud console).
 * Services missing from the snapshot stay disabled stubs. */
export function buildOpenConnectorCatalogForCloud(): OcCatalogItem[] {
  const seen = new Set<string>();
  const items: OcCatalogItem[] = [];
  for (const entry of READY_CONNECTOR_APPS) {
    if (!entry.ocService || seen.has(entry.ocService)) continue;
    seen.add(entry.ocService);
    const meta = OPEN_CONNECTOR_CLOUD_AUTH[entry.ocService];
    items.push(meta ? ocCatalogItem(entry, meta) : ocStubCatalogItem(entry));
  }
  return items;
}
