/**
 * P_mcp-discovery — Model Context Protocol server for Socrates.
 *
 * Mounted at /api/mcp. Implements the Streamable HTTP transport specified
 * by the MCP protocol so chat tools (Claude, ChatGPT, Cursor, etc.) can
 * discover and call a small set of public, read-only tools:
 *
 *   socrates.bootstrap       mobile-shell contract used at cold start
 *   socrates.health         liveness probe + pubsub status
 *   socrates.config         front-end capability flag
 *   socrates.openapi_url    pointer to the OpenAPI 3.0 specification
 *   socrates.research_index index of the six published research notes
 *   socrates.docs           catalogue of long-form documentation pages
 *
 * No write tools. No auth. Each tool is a thin wrapper over something
 * already shipped by the rest of the server so we keep one canonical
 * implementation.
 *
 * CSRF: see server/src/middleware/csrf.ts#MCP_PATHS — this path is
 * exempted from the browser double-submit check because MCP clients
 * are not browsers.
 *
 * Public discovery surface: /.well-known/mcp/server-card.json describes
 * the same set of tools for registry crawlers.
 */

import { Router, type Request, type Response } from 'express';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { isInitializeRequest } from '@modelcontextprotocol/sdk/types.js';

import { sql, and, eq, isNotNull } from 'drizzle-orm';
import { getDb } from '../db/index.js';
import { apiKeys } from '../db/schema.js';
import { buildMobileBootstrapConfig } from './mobile.js';

const SERVER_NAME = 'socrates';
const SERVER_VERSION = '2026.05';

const transports = new Map<string, StreamableHTTPServerTransport>();

/* Static catalogue — kept in source rather than a DB so the tools stay
 * usable even when the database is unreachable. The research pages are
 * /var/www/topodrive.top/research/<slug>/ and the docs are site pages. */
const RESEARCH_INDEX = [
  { slug: 'explanation-evidence', title: 'When a clear explanation becomes evidence', date: '2026-07-29', url: 'https://topodrive.top/research/explanation-evidence/' },
  { slug: 'honest-pause',        title: 'The value of an honest pause',                       date: '2026-07-11', url: 'https://topodrive.top/research/honest-pause/' },
  { slug: 'memory-recall',       title: 'The route back to an idea',                          date: '2026-08-12', url: 'https://topodrive.top/research/memory-recall/' },
  { slug: 'maps-preserve-path',  title: 'Maps that preserve the path',                        date: '2026-06-24', url: 'https://topodrive.top/research/maps-preserve-path/' },
  { slug: 'tutor-curiosity',     title: 'When a tutor should say it is unsure',               date: '2026-05-14', url: 'https://topodrive.top/research/tutor-curiosity/' },
  { slug: 'what-learners-keep',  title: 'What learners keep after a session',                 date: '2026-04-30', url: 'https://topodrive.top/research/what-learners-keep/' },
];

const DOCS_INDEX = [
  { slug: 'about',         title: 'About Socrates',                            kind: 'page',  url: 'https://topodrive.top/about' },
  { slug: 'pricing',       title: 'Pricing',                                    kind: 'page',  url: 'https://topodrive.top/pricing' },
  { slug: 'product',       title: 'The learning loop',                         kind: 'page',  url: 'https://topodrive.top/product' },
  { slug: 'policy',        title: 'Principles',                                kind: 'page',  url: 'https://topodrive.top/policy' },
  { slug: 'guide',         title: 'Learning guide',                            kind: 'page',  url: 'https://topodrive.top/guide' },
  { slug: 'learn',         title: 'Learn',                                     kind: 'page',  url: 'https://topodrive.top/learn' },
  { slug: 'announcements', title: 'Announcements',                            kind: 'page',  url: 'https://topodrive.top/announcements' },
  { slug: 'documents',     title: 'Documents index',                           kind: 'page',  url: 'https://topodrive.top/documents' },
  { slug: 'llms.txt',      title: 'Navigation index for AI agents',            kind: 'tool',  url: 'https://topodrive.top/llms.txt' },
  { slug: 'llms-full.txt', title: 'Long-form context for AI agents',           kind: 'tool',  url: 'https://topodrive.top/llms-full.txt' },
  { slug: 'agents.md',     title: 'Agent instructions',                       kind: 'tool',  url: 'https://topodrive.top/agents.md' },
  { slug: 'openapi.json',  title: 'OpenAPI 3.0 specification',                kind: 'tool',  url: 'https://topodrive.top/openapi.json' },
];

function registerTools(server: McpServer): void {
  server.tool(
    'socrates.bootstrap',
    'Return the mobile-shell bootstrap contract (product, platform, webBaseUrl, apiBaseUrl, healthPath).',
    async () => ({
      content: [{ type: 'text' as const, text: JSON.stringify(buildMobileBootstrapConfig(), null, 2) }],
    }),
  );

  server.tool(
    'socrates.health',
    'Liveness probe. Returns ok=true when the database is reachable, ok=false otherwise. No auth.',
    async () => {
      let ok = true;
      let dbStatus: 'connected' | 'disconnected' = 'connected';
      try {
        const db = getDb();
        await db.execute(sql`SELECT 1`);
      } catch {
        ok = false;
        dbStatus = 'disconnected';
      }
      const body = { ok, db: dbStatus, uptime: process.uptime() };
      return {
        content: [{ type: 'text' as const, text: JSON.stringify(body, null, 2) }],
        isError: !ok,
      };
    },
  );

  server.tool(
    'socrates.config',
    'Front-end capability blob: whether the built-in provider is configured and whether it is reasoning-capable.',
    async () => {
      let hasBeagleKey = false;
      try {
        const db = getDb();
        const [row] = await db.select({ id: apiKeys.id })
          .from(apiKeys)
          .where(and(eq(apiKeys.isBuiltIn, true), isNotNull(apiKeys.keyCiphertext)))
          .orderBy(apiKeys.createdAt)
          .limit(1);
        hasBeagleKey = !!row;
      } catch {
        // Best-effort, same fall-back as the inline /api/config handler.
      }
      const body = {
        hasBeagleKey,
        isReasoning: process.env.BEAGLE_IS_REASONING !== 'false',
      };
      return { content: [{ type: 'text' as const, text: JSON.stringify(body, null, 2) }] };
    },
  );

  server.tool(
    'socrates.openapi_url',
    'Pointer to the Socrates OpenAPI 3.0 specification.',
    async () => ({
      content: [{
        type: 'text' as const,
        text: JSON.stringify({
          url: 'https://topodrive.top/openapi.json',
          version: SERVER_VERSION,
          title: 'Socrates API',
        }, null, 2),
      }],
    }),
  );

  server.tool(
    'socrates.research_index',
    'Index of the six published research notes (slug, title, date, url).',
    async () => ({
      content: [{ type: 'text' as const, text: JSON.stringify({ items: RESEARCH_INDEX }, null, 2) }],
    }),
  );

  server.tool(
    'socrates.docs',
    'Catalogue of long-form documentation pages. Optional kind filter: "page" | "article" | "tool".',
    {
      kind: z.enum(['page', 'article', 'tool']).optional()
        .describe('Filter to one document kind.'),
    },
    async ({ kind }) => {
      const items = kind ? DOCS_INDEX.filter(d => d.kind === kind) : DOCS_INDEX;
      return { content: [{ type: 'text' as const, text: JSON.stringify({ items }, null, 2) }] };
    },
  );
}

async function bootstrapSession(req: Request, res: Response): Promise<void> {
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: () => randomUUID(),
    onsessioninitialized: (id) => {
      transports.set(id, transport);
    },
    onsessionclosed: (id) => {
      transports.delete(id);
    },
  });
  transport.onclose = () => {
    if (transport.sessionId) transports.delete(transport.sessionId);
  };
  const server = new McpServer(
    { name: SERVER_NAME, version: SERVER_VERSION },
    { instructions: 'Socrates discovery surface — six read-only tools.' },
  );
  registerTools(server);
  await server.connect(transport);
  await transport.handleRequest(req, res, req.body);
}

const router = Router();

// POST /api/mcp — JSON-RPC 2.0 messages.
router.post('/', async (req, res) => {
  const sessionId = req.headers['mcp-session-id'];
  if (typeof sessionId === 'string' && transports.has(sessionId)) {
    await transports.get(sessionId)!.handleRequest(req, res, req.body);
    return;
  }
  if (isInitializeRequest(req.body)) {
    await bootstrapSession(req, res);
    return;
  }
  res.status(400).json({
    jsonrpc: '2.0',
    error: { code: -32000, message: 'Missing or unknown mcp-session-id header' },
    id: null,
  });
});

// GET /api/mcp — server-initiated event stream for an open session.
router.get('/', async (req, res) => {
  const sessionId = req.headers['mcp-session-id'];
  if (typeof sessionId !== 'string' || !transports.has(sessionId)) {
    res.status(400).json({
      jsonrpc: '2.0',
      error: { code: -32000, message: 'Missing or unknown mcp-session-id header' },
      id: null,
    });
    return;
  }
  await transports.get(sessionId)!.handleRequest(req, res);
});

// DELETE /api/mcp — close the session.
router.delete('/', async (req, res) => {
  const sessionId = req.headers['mcp-session-id'];
  if (typeof sessionId !== 'string' || !transports.has(sessionId)) {
    res.status(400).json({
      jsonrpc: '2.0',
      error: { code: -32000, message: 'Missing or unknown mcp-session-id header' },
      id: null,
    });
    return;
  }
  await transports.get(sessionId)!.handleRequest(req, res);
});

export default router;
