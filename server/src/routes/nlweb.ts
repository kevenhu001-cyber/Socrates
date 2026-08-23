import { Router, type Request, type Response } from 'express';

/**
 * P_nlweb — Microsoft NLWeb-conformant natural-language query surface.
 *
 *   POST /api/nlweb/ask      { query, prefer?: { streaming?: boolean } }
 *   GET  /api/nlweb/ask?q=…
 *   POST /api/nlweb/stream   → text/event-stream (start / result / complete)
 *
 * Answers come from a curated corpus of Socrates' PUBLIC surfaces —
 * research notes, documentation pages, developer resources, and the API
 * entry points. No database, no auth, no user data: this endpoint exists
 * so agents can ground "what is Socrates / how do I call it" questions.
 *
 * Response shape follows the NLWeb convention: a `_meta` block carrying
 * `response_type` and `version`, plus schema.org-typed items.
 */

type CorpusEntry = {
  '@type': string;
  name: string;
  url: string;
  description: string;
  keywords: string[];
};

const CORPUS: CorpusEntry[] = [
  {
    '@type': 'SoftwareApplication',
    name: 'Socrates',
    url: 'https://topodrive.top/',
    description: 'An AI tutor built around Socratic dialogue, durable recall, and a knowledge map.',
    keywords: ['socrates', 'tutor', 'learning', 'ai', 'topodrive'],
  },
  {
    '@type': 'TechArticle',
    name: 'Socrates OpenAPI specification',
    url: 'https://topodrive.top/openapi.json',
    description: 'OpenAPI 3.0 contract for the public Socrates API with operationIds, schemas, scopes, and error model.',
    keywords: ['openapi', 'api', 'specification', 'swagger', 'rest', 'endpoints'],
  },
  {
    '@type': 'TechArticle',
    name: 'Socrates authentication reference',
    url: 'https://topodrive.top/auth.md',
    description: 'OAuth 2.0 authorization-code + PKCE, scoped agent API keys (ak_*), WWW-Authenticate challenges, and every auth error convention.',
    keywords: ['auth', 'oauth', 'authentication', 'agent', 'key', 'token', 'pkce', 'scope'],
  },
  {
    '@type': 'WebPage',
    name: 'Socrates developer portal',
    url: 'https://topodrive.top/developers',
    description: 'Quickstart, conventions (errors, idempotency, rate limits, pagination), and the full discovery index for developers.',
    keywords: ['developers', 'portal', 'quickstart', 'docs', 'documentation', 'sdk'],
  },
  {
    '@type': 'Service',
    name: 'Socrates MCP server',
    url: 'https://app.topodrive.top/api/mcp',
    description: 'Model Context Protocol server (Streamable HTTP) exposing read-only Socrates discovery tools.',
    keywords: ['mcp', 'model context protocol', 'tools', 'claude', 'cursor'],
  },
  {
    '@type': 'Article',
    name: 'When a clear explanation becomes evidence',
    url: 'https://topodrive.top/research/explanation-evidence/',
    description: 'Research note on explanation quality as measurable evidence of understanding.',
    keywords: ['research', 'explanation', 'evidence'],
  },
  {
    '@type': 'Article',
    name: 'The route back to an idea',
    url: 'https://topodrive.top/research/memory-recall/',
    description: 'Research note on spaced recall and the mechanics of remembering.',
    keywords: ['research', 'memory', 'recall', 'spaced repetition'],
  },
  {
    '@type': 'Article',
    name: 'Maps that preserve the path',
    url: 'https://topodrive.top/research/maps-preserve-path/',
    description: 'Research note on knowledge maps and why structure survives when facts fade.',
    keywords: ['research', 'knowledge', 'map', 'graph'],
  },
  {
    '@type': 'Offer',
    name: 'Socrates pricing',
    url: 'https://topodrive.top/pricing',
    description: 'Free tier plus paid plans; the tutor never charges for model usage.',
    keywords: ['pricing', 'plans', 'free', 'tier', 'cost'],
  },
];

const STOPWORDS = new Set(['the', 'a', 'an', 'is', 'are', 'of', 'to', 'for', 'and', 'or', 'in', 'on', 'how', 'do', 'does', 'what', 'which', 'with', 'my', 'your', 'it']);

function tokenize(query: string): string[] {
  return query
    .toLowerCase()
    .replace(/[^a-z0-9\s:-]/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length > 1 && !STOPWORDS.has(t));
}

function search(query: string): CorpusEntry[] {
  const tokens = tokenize(query);
  if (tokens.length === 0) return [];
  const scored = CORPUS.map((entry) => {
    const haystack = `${entry.name} ${entry.description} ${entry.keywords.join(' ')}`.toLowerCase();
    let score = 0;
    for (const t of tokens) {
      if (entry.keywords.some((k) => k === t)) score += 3;
      else if (haystack.includes(t)) score += 1;
    }
    return { entry, score };
  }).filter((r) => r.score > 0);
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, 5).map((r) => r.entry);
}

function meta(responseType: string) {
  return { response_type: responseType, version: 'v1', service: 'socrates-nlweb' };
}

function extractQuery(req: Request): string {
  const body = req.body || {};
  const fromBody = typeof body.query === 'string' ? body.query : typeof body.q === 'string' ? body.q : '';
  const fromQuery = typeof req.query.query === 'string' ? req.query.query : typeof req.query.q === 'string' ? req.query.q : '';
  return (fromBody || fromQuery).slice(0, 500);
}

const router = Router();

router.post('/ask', (req, res) => {
  const query = extractQuery(req);
  const results = search(query);
  return res.json({
    _meta: meta('search_response'),
    query,
    items: results.map((r) => ({
      '@type': r['@type'],
      name: r.name,
      url: r.url,
      description: r.description,
    })),
  });
});

// NLWeb clients may probe GET too.
router.get('/ask', (req, res) => {
  const query = extractQuery(req);
  const results = search(query);
  return res.json({
    _meta: meta('search_response'),
    query,
    items: results.map((r) => ({
      '@type': r['@type'],
      name: r.name,
      url: r.url,
      description: r.description,
    })),
  });
});

router.post('/stream', (req, res) => {
  const query = extractQuery(req);
  res.set('Content-Type', 'text/event-stream; charset=utf-8');
  res.set('Cache-Control', 'no-cache, no-store');
  res.set('X-Accel-Buffering', 'no');
  res.flushHeaders?.();

  const send = (event: string, data: unknown) => {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  };

  send('start', { _meta: meta('streaming_response'), query });
  const results = search(query);
  let i = 0;
  const pushNext = () => {
    while (i < results.length) {
      const item = results[i++];
      send('result', {
        '@type': item['@type'],
        name: item.name,
        url: item.url,
        description: item.description,
      });
    }
    send('complete', { _meta: meta('streaming_response'), total: results.length });
    res.end();
  };
  // Yield once so the start frame is flushed before results land.
  setTimeout(pushNext, 15);

  res.on('close', () => { i = results.length; });
});

export default router;
