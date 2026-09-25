import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';

const LOCAL_AUTH_BYPASS = process.env.LOCAL_AUTH_BYPASS !== '0';

function send(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(body));
}

function readBody(req) {
  return new Promise((resolve) => {
    let data = '';
    req.on('data', (c) => { data += c; });
    req.on('end', () => resolve(data));
    req.on('error', () => resolve(data));
  });
}

/* Canned reply text — echoes which extension markers reached the request
   body (template prompts, web-search context, attachments) so clicking a
   "+" menu item visibly changes what the "model" answers with. */
function stubReplyFor(body) {
  const markers = [];
  const tpl = body.match(/\[template:tpl-([\w-]+)\]/);
  if (tpl) markers.push(`template "${tpl[1]}"`);
  if (/\[Web research\]|\[Web search/i.test(body)) markers.push('web-search context');
  if (/"type"\s*:\s*"image_url"|data:image\//.test(body)) markers.push('attachment content');
  return markers.length
    ? `Local stub reply — this request reached the model wire with ${markers.join(' + ')} active in the message payload. The real model takes over the same wire once server/ is running on :3037.`
    : 'Local stub reply — the model endpoint answered without server/. Enable an extension from the composer "+" menu and this reply will name it.';
}

/* Emit a canned OpenAI-style SSE answer for POST /api/chat/stream so the
   composer extension chain (template prompts, web-search toggle, uploads)
   is exercisable end-to-end without server/. */
async function sendChatStreamStub(req, res) {
  const body = await readBody(req);
  const reply = stubReplyFor(body);
  res.statusCode = 200;
  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  const words = reply.split(/(?<= )/);
  const chunks = [];
  for (let i = 0; i < words.length; i += 4) chunks.push(words.slice(i, i + 4).join(''));
  for (const chunk of chunks) {
    res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: chunk } }] })}\n\n`);
    await new Promise((r) => setTimeout(r, 24));
  }
  res.write('data: [DONE]\n\n');
  res.end();
}

const STUB_SEARCH_RESULTS = [
  { title: 'Socrates — local stub result', url: 'https://example.com/socrates', snippet: 'Canned web-search hit served by vite.config.js (no backend required).' },
  { title: 'Socratic method — Wikipedia', url: 'https://en.wikipedia.org/wiki/Socratic_method', snippet: 'A form of cooperative argumentative dialogue between individuals.' },
  { title: 'Stanford Encyclopedia — Socrates', url: 'https://plato.stanford.edu/entries/socrates/', snippet: 'Socrates (470—399 BCE) inspired the project name.' },
];

const STUB_CONNECTORS = [
  { id: 'github', name: 'GitHub', description: 'Connect repositories, issues, and pull requests.', availability: 'available', configured: true, connection: null },
  { id: 'notion', name: 'Notion', description: 'Search pages you share with Socrates.', availability: 'available', configured: true, connection: null },
];

const STUB_PNG_1PX = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64',
);

const STUB_SITE_HTML = '<!doctype html>\n<html lang="en"><meta charset="utf-8"><title>Stub site</title><style>body{font-family:system-ui;max-width:640px;margin:12vh auto;padding:0 24px;line-height:1.6}</style><h1>Stub site</h1><p>Canned HTML from the vite local stub — the real generator runs in server/.</p></html>';

/* Probe the real backend once per dev-server boot; the promise is cached
   so every /api/* request pays zero extra latency after the first call. */
function probeBackend() {
  const port = process.env.API_PORT || 3037;
  return fetch(`http://127.0.0.1:${port}/api/config`, { signal: AbortSignal.timeout(800) })
    .then((r) => r.ok)
    .catch(() => false);
}

/* ── Extension-surface stubs ─────────────────────────────────────────
   The composer "+" menu drives real API calls (chat stream, web search,
   page fetch, file upload, sessions). These stubs only answer when the
   real backend on API_PORT is not listening — with server/ running the
   requests proxy through untouched. */
function handleStubbedApi(req, res, next, localPath) {
  if (localPath === '/api/auth/csrf-token') {
          return send(res, 200, { csrfToken: 'local-csrf', ok: true });
        }
        if (localPath === '/api/config' && req.method === 'GET') {
          return send(res, 200, { hasBeagleKey: true, beagleModel: 'local-stub', isReasoning: false });
        }
        if (localPath.startsWith('/api/api-key')) {
          return send(res, 200, { providers: [], activeId: null });
        }
        if (localPath === '/api/chat/stream' && req.method === 'POST') {
          return void sendChatStreamStub(req, res);
        }
        /* Non-streaming model paths: /api/chat for custom providers,
           /api/minimax/v1/chat/completions for the built-in Beagle hop.
           Both expect a standard chat-completion JSON body. */
        if ((localPath === '/api/chat' || localPath === '/api/minimax/v1/chat/completions') && req.method === 'POST') {
          return void readBody(req).then((raw) => send(res, 200, {
            id: 'local-stub',
            object: 'chat.completion',
            created: Math.floor(Date.now() / 1000),
            choices: [{ index: 0, message: { role: 'assistant', content: stubReplyFor(raw) }, finish_reason: 'stop' }],
            usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
          }));
        }
        if (localPath === '/api/web-search' && req.method === 'POST') {
          return send(res, 200, { results: STUB_SEARCH_RESULTS });
        }
        if (localPath === '/api/fetch-batch' && req.method === 'POST') {
          return void readBody(req).then((raw) => {
            let urls = [];
            try { urls = (JSON.parse(raw).urls || []).slice(0, 10); } catch (_) {}
            send(res, 200, {
              results: urls.map((u) => ({
                url: u, ok: true, title: u,
                content: 'Canned fetch-batch body from the vite local stub. The real extractor runs in server/.',
              })),
            });
          });
        }
        if (localPath === '/api/files' && req.method === 'POST') {
          return void readBody(req).then(() => send(res, 200, {
            id: `local-file-${Date.now()}`,
            kind: 'file',
            mimeType: 'application/octet-stream',
            size: 0,
          }));
        }
        if (/^\/api\/files\/[^/]+\/raw$/.test(localPath)) {
          res.statusCode = 200;
          res.setHeader('Content-Type', 'image/png');
          res.setHeader('Cache-Control', 'no-store');
          return res.end(STUB_PNG_1PX);
        }
        if (localPath === '/api/chat-turns' && req.method === 'POST') {
          return void readBody(req).then(() => send(res, 200, { turn: { id: `local-turn-${Date.now()}` } }));
        }
        if (/^\/api\/chat-turns\/[^/]+\/events/.test(localPath)) {
          res.statusCode = 200;
          res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
          res.setHeader('Cache-Control', 'no-cache');
          res.write('data: [DONE]\n\n');
          return res.end();
        }
        if (/^\/api\/chat-turns\/[^/]+\/interrupt$/.test(localPath)) {
          return send(res, 200, { ok: true });
        }
        if (localPath === '/api/sessions' && req.method === 'GET') {
          return send(res, 200, { sessions: [] });
        }
        if (localPath === '/api/sessions' && req.method !== 'GET') {
          /* Echo the client's session id back: persistence.js adopts r.id
             as currentSessionId, so a fresh id per save would orphan the
             in-flight stream (stillOwnsSlot drops every delta). */
          return void readBody(req).then((raw) => {
            let sid = null;
            try { sid = JSON.parse(raw).id || null; } catch (_) {}
            const id = sid || 'local-session-1';
            send(res, 200, { id, session: { id } });
          });
        }
        if (localPath.startsWith('/api/sessions/')) {
          if (req.method === 'GET') return send(res, 200, { session: null });
          return void readBody(req).then(() => send(res, 200, { ok: true }));
        }
        if (localPath === '/api/connectors' || localPath === '/api/project-connectors') {
          return send(res, 200, { connectors: STUB_CONNECTORS, configured: true });
        }
        if (localPath === '/api/plugins' || localPath === '/api/skills') {
          return send(res, 200, { plugins: [], items: [] });
        }
        /* Creations surfaces (sites / assistants / images). List GETs are
           covered by the catch-all's `items`/`images` defaults; the write
           endpoints need shaped rows back so the editor + publish flow has
           an id to work with. */
        if (/^\/api\/creations\/items\/[^/]+$/.test(localPath) && req.method === 'POST') {
          return void readBody(req).then((raw) => {
            let body = {}; try { body = JSON.parse(raw); } catch (_) {}
            send(res, 201, {
              id: `local-item-${Date.now()}`,
              title: body.title || 'Untitled',
              source: body.source || '',
              visibility: 'private',
              version: 1,
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            });
          });
        }
        if (/^\/api\/creations\/items\/[^/]+\/[^/]+$/.test(localPath)) {
          if (req.method === 'DELETE') { res.statusCode = 204; return res.end(); }
          return void readBody(req).then((raw) => {
            let body = {}; try { body = JSON.parse(raw); } catch (_) {}
            send(res, 200, { id: localPath.split('/').pop(), ...body, version: 2, updatedAt: new Date().toISOString() });
          });
        }
        if (/^\/api\/creations\/sites\/[^/]+\/publish$/.test(localPath) && req.method === 'POST') {
          return void readBody(req).then((raw) => {
            let body = {}; try { body = JSON.parse(raw); } catch (_) {}
            const visibility = body.visibility === 'private' || body.visibility === 'public' ? body.visibility : 'unlisted';
            send(res, 200, {
              id: localPath.split('/')[4],
              visibility,
              version: 1,
              url: visibility === 'private' ? null : '/s/local-stub-site',
            });
          });
        }
        if (localPath === '/api/creations/sites/generate' && req.method === 'POST') {
          return void readBody(req).then(() => send(res, 200, { source: STUB_SITE_HTML }));
        }
        /* Catch-all: keep hydration reads quiet when the real API is
           absent, mirroring e2e/_mock-api.mjs's default. Anything not
           stubbed above still proxies to server/ when it is running —
           the proxy bypass below only applies to /api/auth/*. */
        if (req.method === 'GET' || req.method === 'HEAD') {
          return send(res, 200, { ok: true, stub: true, items: [], list: [], sessions: [], count: 0 });
        }
        return void readBody(req).then(() => send(res, 200, { ok: true, stub: true }));
}

function createLocalApiStubPlugin() {
  return {
    name: 'local-api-stub',
    enforce: 'pre',
    configureServer(server) {
      let backendUpCache = null;
      server.middlewares.use((req, res, next) => {
        const rawUrl = req.url || '';
        const [pathOnly] = rawUrl.split('?');
        if (!pathOnly.startsWith('/api/')) return next();
        if (!LOCAL_AUTH_BYPASS) return next();
        // The browser client intentionally uses /api/v2/* to avoid stale CDN
        // responses in production. Normalize that prefix for this local-only
        // auth stub so navigation works without a separate API server.
        const localPath = pathOnly.replace(/^\/api\/v2\//, '/api/');

        const LOCAL_USER = {
          id: 'local-dev',
          email: 'local@dev.local',
          name: 'Local Dev',
          tier: 'pro',
          preferences: {},
        };

        if (localPath === '/api/auth/me') {
          return send(res, 200, { user: LOCAL_USER });
        }
        if (localPath === '/api/auth/login'
            || localPath === '/api/auth/register'
            || localPath === '/api/auth/login-with-code') {
          return send(res, 200, { user: LOCAL_USER });
        }
        if (localPath === '/api/auth/logout') {
          return send(res, 200, { ok: true });
        }

        if (!backendUpCache) backendUpCache = probeBackend();
        return void backendUpCache.then((up) => {
          if (up) return next();
          handleStubbedApi(req, res, next, localPath);
        });
      });
    },
  };
}

// Vite config for the Socrates app. The build output is an HTML +
// a set of hashed ES-module chunks that get deployed to
// /var/www/app.topodrive.top via deploy.sh (which copies dist/assets/*).
export default defineConfig({
  root: '.',
  publicDir: 'public',
  resolve: {
    alias: {
      '@socrates/contracts': fileURLToPath(new URL('../packages/contracts/src/index.ts', import.meta.url)),
      '@socrates/core': fileURLToPath(new URL('../packages/core/src/index.ts', import.meta.url)),
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    cssCodeSplit: true,
    rollupOptions: {
      output: {
        manualChunks(id) {
          const f = id.split('\\').join('/');
          if (f.includes('/node_modules/')) {
            if (f.includes('/node_modules/react-dom/') || f.includes('/node_modules/react/') || f.includes('/node_modules/scheduler/')) return 'vendor-react';
            if (f.includes('/node_modules/zustand/')) return 'vendor-react';
            return;
          }
          if (!f.includes('/src/')) return;
          if (f.includes('/src/i18n.js')) return 'i18n';
          if (f.includes('/src/store/')) return 'store';
          if (f.includes('/src/render/')) return 'render';
          if (f.includes('/src/chat/')) return 'chat';
          if (f.includes('/src/ui/')) return 'ui';
        },
        entryFileNames: 'assets/[name]-[hash].js',
        chunkFileNames: 'assets/[name]-[hash].js',
      },
    },
    target: 'es2020',
    minify: 'esbuild',
    sourcemap: false,
    modulePreload: { polyfill: true },
  },
  plugins: [createLocalApiStubPlugin()],
  server: {
    port: 5173,
    strictPort: false,
    proxy: (LOCAL_AUTH_BYPASS ? {
      '/api': {
        target: `http://127.0.0.1:${process.env.API_PORT || 3037}`,
        bypass(req) {
          const [pathOnly] = (req.url || '').split('?');
          if (pathOnly.startsWith('/api/auth/') || pathOnly.startsWith('/api/v2/auth/')) {
            return pathOnly;
          }
        },
      },
    } : {
      '/api': `http://127.0.0.1:${process.env.API_PORT || 3037}`,
    }),
  },
});
