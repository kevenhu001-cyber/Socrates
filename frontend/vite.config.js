import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';

const LOCAL_AUTH_BYPASS = process.env.LOCAL_AUTH_BYPASS !== '0';

function send(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(body));
}

function createLocalApiStubPlugin() {
  return {
    name: 'local-api-stub',
    enforce: 'pre',
    configureServer(server) {
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
        return next();
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
        /* Keep only genuinely shared eager libraries in named chunks. The
           previous catch-all `vendor` bucket merged dependencies reachable
           solely through dynamic imports (notably tldraw and Fuse) back into
           the startup graph, effectively disabling lazy loading. */
        manualChunks(id) {
          const f = id.split('\\').join('/');
          if (f.includes('/node_modules/')) {
            if (f.includes('/node_modules/react-dom/') || f.includes('/node_modules/react/') || f.includes('/node_modules/scheduler/')) return 'vendor-react';
            if (f.includes('/node_modules/@tiptap/') || f.includes('/node_modules/@prosemirror/') || f.includes('/node_modules/prosemirror-')) return 'vendor-editor';
            if (f.includes('/node_modules/zustand/')) return 'vendor-state';
            if (f.includes('/node_modules/marked/') || f.includes('/node_modules/dompurify/')) return 'vendor-markdown';
          }
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
