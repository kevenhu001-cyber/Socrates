/* perf/bench-server.mjs — static dist/ + a latency-injecting mock API for the
 * session hot-path benchmark (perf/bench.mjs).
 *
 * Unlike the Playwright route mocks, this is a real HTTP server, so the chat
 * stream is genuinely incremental (chunked SSE over a socket) and every API
 * response pays a configurable round-trip, which is what makes "extra request
 * on the critical path" costs visible at all.
 */
import http from 'node:http';
import fs from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { marked } from 'marked';

const __dirname = dirname(fileURLToPath(import.meta.url));
const distDir = resolve(__dirname, '..', process.env.BENCH_DIST || 'dist');

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.png': 'image/png', '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2', '.wasm': 'application/wasm',
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* Deterministic synthetic content that exercises the real renderers:
   headings, lists, a fenced code block, a table, inline + display KaTeX. */
function assistantText(sid, i) {
  return [
    `## 第 ${i} 部分：导数与变化率`,
    '',
    `我们先看一个例子。函数 $f(x)=x^2+${i}x$ 在 $x_0$ 处的导数是 $f'(x_0)=2x_0+${i}$。`,
    '',
    '$$\\lim_{h\\to 0}\\frac{f(x_0+h)-f(x_0)}{h}=2x_0+' + i + '$$',
    '',
    '- **几何意义**：切线斜率',
    '- **物理意义**：瞬时速度',
    '- *换个角度想想*：如果 $h$ 取负值会怎样？',
    '',
    '```python',
    'def derivative(f, x, h=1e-6):',
    '    """数值求导"""',
    '    return (f(x + h) - f(x - h)) / (2 * h)',
    '',
    `print(derivative(lambda t: t**2 + ${i}*t, 3.0))`,
    '```',
    '',
    '| 函数 | 导数 | 备注 |',
    '| --- | --- | --- |',
    '| $x^n$ | $nx^{n-1}$ | 幂函数 |',
    '| $e^x$ | $e^x$ | 指数 |',
    '| $\\sin x$ | $\\cos x$ | 三角 |',
    '',
    `那么请你思考：当 $x_0=${i}$ 时切线方程是什么？ MARK-${sid}-${i}`,
  ].join('\n');
}

function buildSession(sid, title, pairs) {
  const messages = [];
  const t0 = Date.parse('2026-09-01T00:00:00Z');
  for (let i = 0; i < pairs; i++) {
    const u = `请解释一下第 ${i} 个问题：导数在 x=${i} 处的含义是什么？`;
    messages.push({
      id: `${sid.slice(0, 8)}-0000-4000-8000-${String(i * 2).padStart(12, '0')}`,
      clientId: `${sid}-u${i}`, role: 'user', rawText: u, html: `<p>${u}</p>`,
      type: 'user', attachments: [], toolCalls: [], createdAt: new Date(t0 + i * 60000).toISOString(),
    });
    const a = assistantText(sid, i);
    messages.push({
      id: `${sid.slice(0, 8)}-0000-4000-8000-${String(i * 2 + 1).padStart(12, '0')}`,
      clientId: `${sid}-a${i}`, role: 'assistant', rawText: a, html: marked.parse(a),
      type: 'assistant', attachments: [], toolCalls: [], reasoningContent: null,
      createdAt: new Date(t0 + i * 60000 + 30000).toISOString(),
    });
  }
  return {
    id: sid, topic: title, title, mode: 'chat', kind: 'chat', domain: '', phase: 'chat',
    kbNodes: [], mistakes: [], currentNode: 0, totalQ: 0, projectId: null,
    updatedAt: '2026-09-20T00:00:00Z', createdAt: '2026-09-01T00:00:00Z', messages,
  };
}

const uuid = (n) => `${String(n).padStart(8, '0')}-1111-4111-8111-111111111111`;

export const SESSIONS = {
  long: buildSession(uuid(1), '长会话：微积分导论', 100),   // 200 messages
  medium: buildSession(uuid(2), '中会话：线性代数', 30),     // 60 messages
  short: buildSession(uuid(3), '短会话：打招呼', 2),        // 4 messages
};

function listRows() {
  const rows = Object.values(SESSIONS).map((s, i) => ({
    id: s.id, topic: s.topic, title: s.title, mode: 'chat', kind: 'chat', pinned: false,
    updatedAt: new Date(Date.parse('2026-09-26T00:00:00Z') - i * 3600e3).toISOString(),
    createdAt: s.createdAt, messageCount: s.messages.length, tags: [], projectId: null,
  }));
  /* Filler rows so the Recents list is a realistic ~120 rows. */
  for (let i = 0; i < 117; i++) {
    const id = `${String(100 + i).padStart(8, '0')}-2222-4222-8222-222222222222`;
    rows.push({
      id, topic: `历史会话 ${i}`, title: `历史会话 ${i}：一些学习笔记`, mode: i % 3 ? 'chat' : 'tutor',
      kind: 'chat', pinned: false, messageCount: 6, tags: [], projectId: null,
      updatedAt: new Date(Date.parse('2026-09-25T00:00:00Z') - i * 7200e3).toISOString(),
      createdAt: '2026-08-01T00:00:00Z',
    });
  }
  return rows;
}

const STREAM_TEXT = (() => {
  const parts = [];
  parts.push('STREAMTOKEN0 好的，我们一步一步来看。\n\n');
  for (let i = 0; i < 12; i++) {
    parts.push(`### 步骤 ${i + 1}\n\n先考虑函数 $g(x)=x^3-${i}x$，它的导数为 $g'(x)=3x^2-${i}$。`);
    parts.push('我们用一个例子来理解它的意义，然后再推广到一般情形。\n\n');
    parts.push('- 第一点：变化率\n- 第二点：切线\n\n');
    if (i % 4 === 1) parts.push('```js\nconst d = (f, x, h = 1e-6) => (f(x + h) - f(x - h)) / (2 * h);\nconsole.log(d(Math.sin, 0));\n```\n\n');
  }
  parts.push('STREAMEND');
  return parts.join('');
})();

export function createBenchServer({ latencyMs = 120, prepMs = 250, chunkMs = 18, bytesPerSec = 4_000_000 } = {}) {
  const stats = { detailGets: {}, chatTurnPosts: 0, streamPosts: 0, sessionPosts: 0, listGets: 0, requests: [] };
  const json = (res, body, status = 200) => {
    const text = JSON.stringify(body);
    res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
    res.end(text);
    return text.length;
  };
  const readBody = (req) => new Promise((r) => { let b = ''; req.on('data', (c) => { b += c; }); req.on('end', () => r(b)); });

  async function api(req, res, path) {
    const method = req.method;
    const t = Date.now();
    stats.requests.push({ method, path, t });
    const body = method === 'GET' || method === 'HEAD' ? '' : await readBody(req);
    await sleep(latencyMs);
    if (path === '/auth/me') return json(res, { user: { id: 'u-bench', email: 'bench@example.test', name: 'Bench', verifiedAt: '2026-01-01T00:00:00Z', plan: 'descartes', customInstructions: '', webSearchOn: false } });
    if (path === '/config') return json(res, { hasBeagleKey: true });
    if (path === '/auth/csrf-token') return json(res, { csrfToken: 'bench-csrf', ok: true });
    if (path === '/sessions' && method === 'GET') { stats.listGets++; return json(res, { sessions: listRows() }); }
    const m = /^\/sessions\/([^/?]+)$/.exec(path);
    if (m && method === 'GET') {
      const s = Object.values(SESSIONS).find((x) => x.id === m[1]);
      stats.detailGets[m[1]] = (stats.detailGets[m[1]] || 0) + 1;
      if (!s) return json(res, { id: m[1], topic: 'filler', title: 'filler', mode: 'chat', messages: [] });
      const text = JSON.stringify(s);
      await sleep(Math.round((text.length / bytesPerSec) * 1000));
      res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
      return res.end(text);
    }
    if (path === '/sessions' && method === 'POST') {
      stats.sessionPosts++;
      let id = 'bench-saved';
      try { id = JSON.parse(body).id || id; } catch (_) {}
      return json(res, { id, session: { id } });
    }
    if (path.startsWith('/sessions')) return json(res, { ok: true });
    if (path === '/chat-turns' && method === 'POST') {
      stats.chatTurnPosts++;
      let cid = 'x';
      try { cid = JSON.parse(body).clientTurnId || cid; } catch (_) {}
      return json(res, { turn: { id: '99999999-9999-4999-8999-' + String(stats.chatTurnPosts).padStart(12, '0'), clientTurnId: cid, status: 'queued' }, created: true }, 201);
    }
    if (path === '/chat/stream' && method === 'POST') {
      stats.streamPosts++;
      res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
      res.flushHeaders?.();
      res.write(': prime\n\n');
      /* Simulates server-side request preparation before the first token. */
      await sleep(prepMs);
      const chunks = STREAM_TEXT.match(/[\s\S]{1,12}/g);
      for (const c of chunks) {
        if (res.destroyed) return;
        res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: c } }] })}\n\n`);
        await sleep(chunkMs);
      }
      res.write('data: [DONE]\n\n');
      return res.end();
    }
    if (/memories|usage|projects|share|mistakes|tags/.test(path)) return json(res, { items: [], list: [], projects: [], tags: [], count: 0, ok: true });
    if (path.startsWith('/api-key')) return json(res, { providers: [], activeId: null });
    return json(res, { ok: true, stub: true });
  }

  const server = http.createServer((req, res) => {
    const url = req.url || '/';
    const pathname = decodeURIComponent(url.split('?')[0]);
    if (pathname.startsWith('/api/')) {
      const p = pathname.replace(/^\/api(\/v2)?/, '');
      api(req, res, p).catch((e) => { try { res.writeHead(500).end(String(e)); } catch (_) {} });
      return;
    }
    let fp = resolve(distDir, '.' + pathname);
    if (pathname === '/' || !fp.startsWith(distDir) || !fs.existsSync(fp) || !fs.statSync(fp).isFile()) fp = resolve(distDir, 'index.html');
    const ext = (fp.match(/\.[^.]+$/) || [''])[0].toLowerCase();
    res.writeHead(200, { 'Content-Type': TYPES[ext] || 'application/octet-stream' });
    fs.createReadStream(fp).pipe(res);
  });
  return { server, stats, SESSIONS, STREAM_TEXT };
}
