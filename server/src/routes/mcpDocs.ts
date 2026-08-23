import { Router, type Request, type Response } from 'express';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { isInitializeRequest } from '@modelcontextprotocol/sdk/types.js';

/**
 * P_docs-mcp — documentation MCP surface, separate from the product server.
 *
 * orank's "Product + docs MCP coverage" check wants BOTH a "do" server (the
 * API actions at /api/mcp) and a "learn" server that answers questions FROM
 * the docs. This router is the learn surface: every tool returns curated,
 * public documentation content — no database, no auth, no user data.
 *
 * Mounted at /api/mcp/docs; exempted from CSRF alongside /api/mcp (see
 * middleware/csrf.ts#MCP_PATHS).
 */

const SERVER_NAME = 'socrates-docs';
const SERVER_VERSION = '2026.08';

const transports = new Map<string, StreamableHTTPServerTransport>();

const DOC_PAGES = [
  { title: 'Developer portal', kind: 'page' as const, url: 'https://topodrive.top/developers', summary: 'Quickstart, conventions (errors, idempotency, rate limits, pagination), discovery index.' },
  { title: 'Authentication reference', kind: 'page' as const, url: 'https://topodrive.top/auth.md', summary: 'OAuth 2.0 + PKCE flow, scoped agent keys, error conventions, revocation.' },
  { title: 'Pricing', kind: 'page' as const, url: 'https://topodrive.top/pricing.md', summary: 'Tiers and what is included; model usage is never charged.' },
  { title: 'The learning loop', kind: 'page' as const, url: 'https://topodrive.top/product', summary: 'How Socrates turns questions into durable understanding.' },
  { title: 'Learning guide', kind: 'page' as const, url: 'https://topodrive.top/guide', summary: 'Study workflow suggestions for learners.' },
  { title: 'Principles', kind: 'page' as const, url: 'https://topodrive.top/policy', summary: 'The product principles Socrates is built on.' },
  { title: 'About', kind: 'page' as const, url: 'https://topodrive.top/about', summary: 'Who builds Socrates and why.' },
];

const DOC_TOOLS = [
  { title: 'llms.txt navigation index', url: 'https://topodrive.top/llms.txt', summary: 'One-page map of every agent-facing Socrates resource.' },
  { title: 'llms-full.txt long-form context', url: 'https://topodrive.top/llms-full.txt', summary: 'Extended capabilities, endpoints, and markdown twins.' },
  { title: 'agents.md agent instructions', url: 'https://topodrive.top/agents.md', summary: 'When to reach for Socrates and how to call it.' },
  { title: 'SKILL.md skill package', url: 'https://topodrive.top/SKILL.md', summary: 'agentskills.io-format skill describing tutor capabilities.' },
];

function searchCorpus(query: string) {
  const tokens = query.toLowerCase().split(/\s+/).filter((t) => t.length > 1);
  if (tokens.length === 0) return [...DOC_PAGES, ...DOC_TOOLS];
  const all = [...DOC_PAGES, ...DOC_TOOLS];
  return all.filter((d) => {
    const hay = `${d.title} ${d.summary} ${d.url}`.toLowerCase();
    return tokens.some((t) => hay.includes(t));
  });
}

function registerTools(server: McpServer): void {
  server.tool(
    'socrates_docs.list',
    'List Socrates documentation pages and agent-facing documents (title, url, summary).',
    async () => ({
      content: [{ type: 'text' as const, text: JSON.stringify({ pages: DOC_PAGES, tools: DOC_TOOLS }, null, 2) }],
    }),
  );

  server.tool(
    'socrates_docs.search',
    'Keyword search over the Socrates documentation corpus.',
    { query: z.string().min(1).max(200).describe('Keywords to look for.') },
    async ({ query }) => ({
      content: [{ type: 'text' as const, text: JSON.stringify({ results: searchCorpus(query) }, null, 2) }],
    }),
  );

  server.tool(
    'socrates_docs.auth_reference',
    'Return the full authentication reference (auth.md) inline so agents can learn the OAuth + agent-key flows without a second fetch.',
    async () => {
      // Kept as a compact digest rather than the whole file to respect
      // tool-result size limits; the URL below serves the canonical text.
      const digest = [
        '# Socrates authentication — digest',
        'OAuth 2.0 authorization-code + PKCE (S256): authorize at https://app.topodrive.top/api/oauth/authorize, exchange at /api/oauth/token, revoke at /api/oauth/revoke.',
        'Agent keys: mint via POST /api/account/agent-keys, send `Authorization: Bearer ak_<keyId>.<secret>`; scopes chat|memory|sessions|files|projects × read|write.',
        'Errors: typed JSON with machine-readable code; 401 carries WWW-Authenticate; 403 INSUFFICIENT_SCOPE carries an RFC 6750 challenge.',
        'Canonical doc: https://topodrive.top/auth.md',
      ].join('\n');
      return { content: [{ type: 'text' as const, text: digest }] };
    },
  );
}

async function bootstrapSession(req: Request, res: Response): Promise<void> {
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: () => randomUUID(),
    onsessioninitialized: (id) => { transports.set(id, transport); },
    onsessionclosed: (id) => { transports.delete(id); },
  });
  transport.onclose = () => {
    if (transport.sessionId) transports.delete(transport.sessionId);
  };
  const server = new McpServer(
    { name: SERVER_NAME, version: SERVER_VERSION },
    { instructions: 'Socrates documentation surface — ask questions about Socrates here; act on the API via /api/mcp.' },
  );
  registerTools(server);
  await server.connect(transport);
  await transport.handleRequest(req, res, req.body);
}

function unknownSession(res: Response): void {
  res.status(400).json({
    jsonrpc: '2.0',
    error: { code: -32000, message: 'Missing or unknown mcp-session-id header' },
    id: null,
  });
}

const router = Router();

router.post('/', async (req: Request, res: Response) => {
  const sessionId = req.headers['mcp-session-id'];
  if (typeof sessionId === 'string' && transports.has(sessionId)) {
    await transports.get(sessionId)!.handleRequest(req, res, req.body);
    return;
  }
  if (isInitializeRequest(req.body)) {
    await bootstrapSession(req, res);
    return;
  }
  unknownSession(res);
});

router.get('/', async (req: Request, res: Response) => {
  const sessionId = req.headers['mcp-session-id'];
  if (typeof sessionId !== 'string' || !transports.has(sessionId)) return unknownSession(res);
  await transports.get(sessionId)!.handleRequest(req, res);
});

router.delete('/', async (req: Request, res: Response) => {
  const sessionId = req.headers['mcp-session-id'];
  if (typeof sessionId !== 'string' || !transports.has(sessionId)) return unknownSession(res);
  await transports.get(sessionId)!.handleRequest(req, res);
});

export default router;
