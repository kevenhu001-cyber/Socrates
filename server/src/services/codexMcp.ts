/**
 * Server-owned Codex MCP catalog.
 *
 * The browser never supplies an MCP URL, headers, or transport settings.
 * Operators declare the small set of allowed servers in CODEX_MCP_SERVERS
 * (or CODEX_MCP_URL for the built-in Socrates server); users only choose
 * whether a catalog entry is enabled globally or for a project.
 */

import { and, eq, or } from 'drizzle-orm';
import { getDb } from '../db/index.js';
import { agentMcpSettings } from '../db/schema.js';
import { BadRequest, NotFound } from '../lib/errors.js';
import { CODEX_ENABLED } from './codexHarness.js';

export const CODEX_MCP_ENABLED = CODEX_ENABLED && process.env.CODEX_MCP !== 'false';

type CatalogInput = {
  key?: unknown;
  name?: unknown;
  url?: unknown;
  description?: unknown;
  enabled?: unknown;
};

export interface CodexMcpCatalogEntry {
  key: string;
  name: string;
  url: string;
  description: string;
  transport: 'streamable_http';
  enabledByDefault: boolean;
}

export interface CodexMcpServerView {
  key: string;
  name: string;
  description: string;
  transport: 'streamable_http';
  endpointHost: string;
  enabled: boolean;
  scope: 'global' | 'project';
  healthStatus: string;
  lastError: string | null;
  lastCheckedAt: Date | null;
}

function safeKey(value: unknown): string | null {
  const key = String(value || '').trim();
  return /^[A-Za-z][A-Za-z0-9_-]{0,39}$/.test(key) ? key : null;
}

function safeUrl(value: unknown): string | null {
  const raw = String(value || '').trim();
  if (!raw) return null;
  try {
    const parsed = new URL(raw);
    const localHttp = parsed.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]', '::1'].includes(parsed.hostname);
    if (parsed.protocol !== 'https:' && !localHttp) return null;
    if (parsed.username || parsed.password) return null;
    for (const key of parsed.searchParams.keys()) {
      if (/token|secret|password|api[_-]?key/i.test(key)) return null;
    }
    return parsed.toString();
  } catch {
    return null;
  }
}

function parseCatalog(): CodexMcpCatalogEntry[] {
  if (!CODEX_MCP_ENABLED) return [];
  const values: CatalogInput[] = [];
  const raw = String(process.env.CODEX_MCP_SERVERS || '').trim();
  if (raw) {
    try {
      const parsed = JSON.parse(raw) as unknown;
      if (Array.isArray(parsed)) values.push(...parsed.filter((item): item is CatalogInput => !!item && typeof item === 'object'));
      else if (parsed && typeof parsed === 'object') {
        for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
          if (value && typeof value === 'object') values.push({ ...(value as CatalogInput), key });
        }
      }
    } catch {
      console.warn('[codex-mcp] CODEX_MCP_SERVERS is not valid JSON; ignoring it');
    }
  }
  const defaultUrl = safeUrl(process.env.CODEX_MCP_URL);
  if (defaultUrl) values.unshift({
    key: 'socrates',
    name: 'Socrates',
    url: defaultUrl,
    description: 'Read-only Socrates discovery and documentation tools.',
    enabled: true,
  });

  const seen = new Set<string>();
  const catalog: CodexMcpCatalogEntry[] = [];
  for (const item of values) {
    const key = safeKey(item.key);
    const url = safeUrl(item.url);
    if (!key || !url || seen.has(key)) continue;
    seen.add(key);
    catalog.push({
      key,
      name: String(item.name || key).trim().slice(0, 100),
      url,
      description: String(item.description || 'Server-managed MCP tools.').trim().slice(0, 240),
      transport: 'streamable_http',
      enabledByDefault: item.enabled !== false,
    });
  }
  return catalog;
}

export function getCodexMcpCatalog(): CodexMcpCatalogEntry[] {
  return parseCatalog();
}

function projectScopeKey(projectId: string | null | undefined): string {
  return projectId ? `project:${projectId}` : 'global';
}

function endpointHost(url: string): string {
  try { return new URL(url).host; } catch { return '[server-managed]'; }
}

export async function listCodexMcpServers(userId: string, projectId: string | null = null): Promise<CodexMcpServerView[]> {
  const catalog = getCodexMcpCatalog();
  if (!catalog.length) return [];
  const db = getDb();
  const globalScope = 'global';
  const projectScope = projectScopeKey(projectId);
  const rows = await db.select().from(agentMcpSettings).where(and(
    eq(agentMcpSettings.userId, userId),
    or(eq(agentMcpSettings.scopeKey, globalScope), eq(agentMcpSettings.scopeKey, projectScope)),
  ));
  const settings = new Map(rows.map((row) => [row.scopeKey + ':' + row.serverKey, row]));
  return catalog.map((entry) => {
    const projectRow = projectId ? settings.get(projectScope + ':' + entry.key) : undefined;
    const globalRow = settings.get(globalScope + ':' + entry.key);
    const row = projectRow || globalRow;
    return {
      key: entry.key,
      name: entry.name,
      description: entry.description,
      transport: entry.transport,
      endpointHost: endpointHost(entry.url),
      enabled: row?.enabled ?? entry.enabledByDefault,
      scope: projectRow ? 'project' : 'global',
      healthStatus: row?.healthStatus || 'unknown',
      lastError: row?.lastError || null,
      lastCheckedAt: row?.lastCheckedAt || null,
    };
  });
}

export async function resolveCodexMcpConfig(userId: string, projectId: string | null): Promise<Record<string, unknown> | null> {
  if (!CODEX_MCP_ENABLED) return null;
  const catalog = getCodexMcpCatalog();
  if (!catalog.length) return null;
  const views = await listCodexMcpServers(userId, projectId);
  const enabled = new Set(views.filter((server) => server.enabled).map((server) => server.key));
  const config: Record<string, unknown> = {};
  for (const entry of catalog) {
    if (!enabled.has(entry.key)) continue;
    // Codex app-server accepts dotted config overrides for the same keys
    // used by its TOML [mcp_servers.<name>] sections.
    config[`mcp_servers.${entry.key}.url`] = entry.url;
    config[`mcp_servers.${entry.key}.enabled`] = true;
  }
  return Object.keys(config).length ? config : null;
}

export async function setCodexMcpEnabled(userId: string, serverKey: string, projectId: string | null, enabled: boolean) {
  if (!CODEX_MCP_ENABLED) throw new NotFound('Codex MCP is disabled');
  const catalogEntry = getCodexMcpCatalog().find((entry) => entry.key === serverKey);
  if (!catalogEntry) throw new NotFound('MCP server not found');
  const db = getDb();
  const scopeKey = projectScopeKey(projectId);
  const [row] = await db.insert(agentMcpSettings).values({
    userId,
    projectId,
    scopeKey,
    serverKey,
    enabled,
  }).onConflictDoUpdate({
    target: [agentMcpSettings.userId, agentMcpSettings.scopeKey, agentMcpSettings.serverKey],
    set: { enabled, updatedAt: new Date(), lastError: null },
  }).returning();
  if (!row) throw new Error('Unable to save MCP setting');
  return { key: serverKey, projectId, enabled, scope: projectId ? 'project' : 'global' };
}

export async function checkCodexMcpHealth(userId: string, serverKey: string, projectId: string | null) {
  if (!CODEX_MCP_ENABLED) throw new NotFound('Codex MCP is disabled');
  const entry = getCodexMcpCatalog().find((item) => item.key === serverKey);
  if (!entry) throw new NotFound('MCP server not found');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 3_000);
  timer.unref?.();
  let healthStatus = 'unavailable';
  let lastError: string | null = null;
  try {
    const response = await fetch(entry.url, { method: 'HEAD', redirect: 'error', signal: controller.signal });
    healthStatus = response.status < 500 ? 'reachable' : 'unavailable';
    if (healthStatus === 'unavailable') lastError = `MCP endpoint returned HTTP ${response.status}`;
  } catch (err) {
    lastError = String((err as Error).message || err).slice(0, 300);
  } finally {
    clearTimeout(timer);
  }
  const db = getDb();
  const scopeKey = projectScopeKey(projectId);
  const [existing] = await db.select({ enabled: agentMcpSettings.enabled })
    .from(agentMcpSettings)
    .where(and(
      eq(agentMcpSettings.userId, userId),
      eq(agentMcpSettings.scopeKey, scopeKey),
      eq(agentMcpSettings.serverKey, serverKey),
    )).limit(1);
  const enabled = existing?.enabled ?? entry.enabledByDefault;
  await db.insert(agentMcpSettings).values({
    userId, projectId, scopeKey, serverKey, enabled, healthStatus, lastError, lastCheckedAt: new Date(),
  }).onConflictDoUpdate({
    target: [agentMcpSettings.userId, agentMcpSettings.scopeKey, agentMcpSettings.serverKey],
    set: { healthStatus, lastError, lastCheckedAt: new Date(), updatedAt: new Date() },
  });
  return { key: serverKey, healthStatus, lastError };
}

export function validateProjectId(projectId: unknown): string | null {
  if (projectId == null || projectId === '') return null;
  const value = String(projectId);
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) {
    throw new BadRequest('Invalid projectId');
  }
  return value;
}
