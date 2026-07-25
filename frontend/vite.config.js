import { defineConfig } from 'vite';

// Vite config for the Socrates app. The build output is an HTML +
// a set of hashed ES-module chunks that get deployed to
// /var/www/app.topodrive.top via deploy.sh (which copies dist/assets/*).
export default defineConfig({
  root: '.',
  publicDir: 'public',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    // Keep a single CSS file — cssCodeSplit would emit one .css per
    // async chunk and complicate the deploy step. The app's CSS is
    // small enough to ship as one file.
    cssCodeSplit: false,
    rollupOptions: {
      output: {
        // P-H1 — code splitting. IIFE cannot split; the default `es`
        // format lets Rollup emit shared, individually-cacheable chunks
        // so editing main.js no longer busts the render/chat/ui/i18n
        // caches, and the browser downloads them in parallel.
        //
        // NOTE (deliberate deviation from the P-H1 plan): the plan also
        // proposed dynamic-importing exam/share/usage/cmdK/mistakeBook/
        // settings to shrink first load. That is NOT safe in this
        // codebase — src/windowExports.js is a central eager bridge that
        // statically imports those modules for the inline-onclick
        // contract, and several are used on boot / hot paths
        // (share.js toggleChatTopBarEls in render; cmdK rebuildCmdKIndex
        // at boot; mistakeBook createMistakeBook singleton at boot;
        // exam.js in the session-restore path). Lazy-loading them would
        // require rewriting the bridge plus many internal call sites in a
        // 7000-line file, risking the very inline-handler contract the
        // plan is meant to preserve. We keep the safe half (chunk
        // splitting) and skip the risky half.
        manualChunks(id) {
          const f = id.split('\\').join('/');
          if (!f.includes('/src/')) return;          // entries + top-level src → entry chunk
          if (f.includes('/src/i18n.js')) return 'i18n';   // ~47KB dictionary
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
    // Inject <link rel="modulepreload"> for static-import chunks so the
    // browser fetches them in parallel with the entry; polyfill covers
    // Safari < 17 which lacks native modulepreload.
    modulePreload: { polyfill: true },
  },
  server: {
    port: 5173,
    strictPort: false,
    proxy: {
      // AUDIT-R2 — the API server defaults to PORT=8080
      // (server/src/index.runtime.ts) while this proxy historically
      // pointed at 3037 (the production nginx upstream port), so local
      // dev silently 502'd unless you knew to set PORT=3037. Make the
      // target configurable: `API_PORT=8080 npm run dev` matches a
      // default server start; the 3037 fallback keeps existing local
      // setups working. See frontend/README.md "Local development".
      '/api': `http://127.0.0.1:${process.env.API_PORT || 3037}`,
    },
  },
  // No build-time HTML transform is needed anymore. The previous
  // `remove-module-type` plugin stripped `type="module"` (required by the
  // old IIFE bundle) and moved the bundle after the CDN <script> tags.
  // With ES output the entry scripts stay `type="module"`, which the spec
  // defers until after HTML parsing — i.e. after the classic in-body CDN
  // scripts (marked/katex/mermaid/hljs/fuse/dompurify) have executed — so
  // every CDN global is already defined when a module first touches it.
});
