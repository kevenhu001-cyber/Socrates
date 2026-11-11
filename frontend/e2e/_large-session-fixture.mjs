/* Large-session fixture for the history performance specs.
 *
 * Builds a deterministic transcript that mixes every kind of heavy content a
 * long tutoring conversation accumulates: long code fences, KaTeX (inline and
 * display), learning scaffolds, persisted visualizations, and images. The
 * mock route speaks both the legacy full-transcript GET /api/sessions/:id and
 * the paginated contract (GET /:id?tail=N plus GET /:id/messages), so the same
 * fixture measures an old build and a paginated one. */

const VIZ_SPEC = {
  version: 1,
  template: 'function',
  title: 'History parabola',
  caption: 'A persisted visualization',
  accessibilitySummary: 'The graph of y equals x squared.',
  payload: { functions: [{ expression: 'x^2', label: 'y = x²' }], xLabel: 'x', yLabel: 'y' },
};

function codeBlock(i) {
  const lines = Array.from({ length: 48 }, (_, line) =>
    `  const value${line} = compute(${i}, ${line}) + offset * ${line}; // step ${line}`);
  return '```ts\nexport function solve' + i + '(offset: number): number {\n' + lines.join('\n')
    + '\n  return value47;\n}\n```';
}

function assistantText(i) {
  const prose = `Turn ${i}: ${'A careful **explanation** with [a local link](/) that walks through the reasoning. '.repeat(6)}`;
  switch (i % 6) {
    case 0: return `## Code walk-through ${i}\n\n${prose}\n\n${codeBlock(i)}\n\nResult marker ${i}.`;
    case 1: return `## Math ${i}\n\n${prose}\n\nInline $a_${i % 9}^2 + b^2 = c^2$ and display:\n\n$$\\int_0^{${i % 7 + 1}} x^2\\,dx = \\frac{${(i % 7 + 1) ** 3}}{3}$$\n\nResult marker ${i}.`;
    case 2: return `<definition><term>Concept ${i}</term><body>A scaffolded definition for turn ${i}.</body></definition>\n\n${prose}\n\nResult marker ${i}.`;
    case 3: return `## Visual ${i}\n\n${prose}\n\nThe graph is below.\n\nResult marker ${i}.`;
    case 4: return `## Diagram ${i}\n\n${prose}\n\n![diagram ${i}](/logo.png)\n\nResult marker ${i}.`;
    default: return `## Notes ${i}\n\n${prose}\n\n- First point ${i}\n- Second point\n- Third point\n\nResult marker ${i}.`;
  }
}

/** Deterministic UUID-shaped id for row i of a session. */
function rowId(seed, i) {
  return `${seed}-0000-4000-8000-${String(i).padStart(12, '0')}`;
}

export function buildLargeTranscript(count, { seed = 'cccccccc' } = {}) {
  const base = Date.UTC(2026, 9, 1, 0, 0, 0);
  return Array.from({ length: count }, (_, i) => {
    const role = i % 2 ? 'assistant' : 'user';
    const row = {
      id: rowId(seed, i),
      clientId: `large-${seed}-${i}`,
      role,
      rawText: role === 'user' ? `Question ${i}: explain the next step, please.` : assistantText(i),
      createdAt: new Date(base + i * 1000).toISOString(),
    };
    if (role === 'assistant' && i % 6 === 3) {
      row.toolCalls = [{
        id: `viz-${seed}-${i}`, name: 'render_intelligent_ui', input: {version:1,nodes:[{...VIZ_SPEC,id:'visual',type:'visualization'}]},
        output: 'Visualization ready', artifacts: [], visualizations: [{...VIZ_SPEC,nodeId:'visual',index:0}],
      }];
    }
    return row;
  });
}

function sessionMeta(id, title) {
  return { id, title, topic: title, mode: 'chat', kind: 'chat', phase: 'chat', kbNodes: [], mistakes: [] };
}

function pageOf(messages, limit, before, beforeId) {
  let end = messages.length;
  if (before && beforeId) {
    end = messages.findIndex((m) => m.createdAt > before || (m.createdAt === before && m.id >= beforeId));
    if (end < 0) end = messages.length;
  }
  const start = Math.max(0, end - limit);
  const page = messages.slice(start, end);
  const hasMore = start > 0;
  return {
    messages: page,
    hasMore,
    cursor: hasMore && page.length ? { createdAt: page[0].createdAt, id: page[0].id } : null,
  };
}

/**
 * Route GET /api/sessions/:id (full or ?tail=N) and GET /api/sessions/:id/messages
 * for each session in `sessions` ({ id, title, messages }). Returns a request
 * log so a spec can assert how much history the client asked for.
 */
export async function routeLargeSessions(page, sessions) {
  const log = [];
  const byId = new Map(sessions.map((session) => [session.id, session]));
  await page.route(/\/api\/(?:v2\/)?sessions\/[0-9a-f-]{36}(?:\/messages)?(?:\?.*)?$/, async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const parts = url.pathname.split('/');
    const isPage = parts[parts.length - 1] === 'messages';
    const id = isPage ? parts[parts.length - 2] : parts[parts.length - 1];
    const session = byId.get(id);
    if (!session) return route.fallback();
    if (request.method() !== 'GET') return route.fulfill({ json: { ok: true } });
    const clamp = (raw, fallback) => Math.min(Math.max(Number.parseInt(raw || String(fallback), 10) || fallback, 1), 200);
    if (isPage) {
      const limit = clamp(url.searchParams.get('limit'), 100);
      const body = pageOf(session.messages, limit, url.searchParams.get('before'), url.searchParams.get('beforeId'));
      log.push({ id, kind: 'page', rows: body.messages.length });
      return route.fulfill({ json: body });
    }
    const tail = url.searchParams.get('tail');
    if (tail !== null) {
      const body = pageOf(session.messages, clamp(tail, 100));
      log.push({ id, kind: 'tail', rows: body.messages.length });
      return route.fulfill({ json: {
        ...sessionMeta(id, session.title),
        messages: body.messages,
        messagesPage: { hasMore: body.hasMore, cursor: body.cursor, total: session.messages.length },
      } });
    }
    log.push({ id, kind: 'full', rows: session.messages.length });
    return route.fulfill({ json: { ...sessionMeta(id, session.title), messages: session.messages } });
  });
  return log;
}
