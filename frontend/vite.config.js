import { defineConfig, searchForWorkspaceRoot } from 'vite';
import tailwindcss from '@tailwindcss/vite';
import { fileURLToPath } from 'node:url';
import { cpSync, readdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { gzipSync, brotliCompressSync, constants as zlibConstants } from 'node:zlib';
import { join, resolve } from 'node:path';
import { createEntryGraphPlugin } from './scripts/entry-graph.mjs';
import { createLocalApiStubPlugin } from './dev-stub/localApiStub.mjs';
import { createRetryDynamicImportsPlugin } from './scripts/retry-dynamic-imports.mjs';

function getBuildId() {
  const configured = process.env.SOCRATES_BUILD_ID || process.env.GITHUB_SHA;
  if (configured && /^[a-f0-9]{7,40}$/i.test(configured)) return configured.slice(0, 12);
  try {
    // Read metadata directly: sandboxed builds need not be able to spawn git.
    const root = fileURLToPath(new URL('..', import.meta.url));
    let gitDir = join(root, '.git');
    if (!existsSync(join(gitDir, 'HEAD'))) {
      gitDir = resolve(root, readFileSync(gitDir, 'utf8').trim().replace(/^gitdir:\s*/, ''));
    }
    let sha = readFileSync(join(gitDir, 'HEAD'), 'utf8').trim();
    if (sha.startsWith('ref: ')) {
      const ref = sha.slice(5);
      const commonFile = join(gitDir, 'commondir');
      const common = existsSync(commonFile)
        ? resolve(gitDir, readFileSync(commonFile, 'utf8').trim()) : gitDir;
      const refFile = join(common, ref);
      sha = existsSync(refFile) ? readFileSync(refFile, 'utf8').trim()
        : readFileSync(join(common, 'packed-refs'), 'utf8').split('\n')
          .find((line) => line.endsWith(' ' + ref))?.split(' ')[0] || '';
    }
    if (/^[a-f0-9]{40}$/i.test(sha)) return sha.slice(0, 12);
  } catch (_) { /* source archives may not include git metadata */ }
  return 'local-' + Date.now().toString(36);
}

const LOCAL_AUTH_BYPASS = process.env.LOCAL_AUTH_BYPASS !== '0';

function createPrecompressedAssetsPlugin() {
  const COMPRESS_EXT = new Set(['.js', '.css', '.svg', '.html', '.json', '.map', '.wasm']);
  function* walk(dir) {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) yield* walk(full);
      else if (COMPRESS_EXT.has(entry.name.slice(entry.name.lastIndexOf('.')))) yield full;
    }
  }
  return {
    name: 'precompressed-assets',
    apply: 'build',
    closeBundle() {
      const distDir = join(process.cwd(), 'dist');
      const compressAndWrite = (file) => {
        const raw = readFileSync(file);
        writeFileSync(file + '.gz', gzipSync(raw, { level: 9 }));
        try {
          writeFileSync(file + '.br', brotliCompressSync(raw, {
            params: {
              [zlibConstants.BROTLI_PARAM_QUALITY]: 11,
            },
          }));
        } catch (_) {}
      };
      try {
        for (const file of walk(join(distDir, 'assets'))) {
          compressAndWrite(file);
        }
        /* The SPA entry too — deploy.sh installs it as index.<TS>.html.gz / .br
           next to the versioned file so nginx gzip_static/brotli_static can serve
           the compressed document. */
        const indexHtml = join(distDir, 'index.html');
        compressAndWrite(indexHtml);
      } catch (error) {
        if (error && error.code !== 'ENOENT') throw error;
      }
    },
  };
}

/* P_doc-preview-pdfjs-assets — pdf.js fetches two runtime asset sets over the
   network when a document uses non-embedded fonts: the packed CMaps (mostly
   CJK encodings) and the standard-font metrics. Both ship inside the pinned
   pdfjs-dist package and must stay same-origin, so the preview engine points
   at /assets/pdfjs/. deploy.sh copies dist/assets including nested
   directories, so the build lands the copies there; the dev server serves the
   same URLs straight from node_modules. Nothing is committed — these are
   build artifacts derived from the package. */
function createPdfjsRuntimeAssetsPlugin() {
  const packageDir = join(process.cwd(), 'node_modules', 'pdfjs-dist');
  const serve = (res, file) => {
    try {
      const body = readFileSync(file);
      res.statusCode = 200;
      res.setHeader('Content-Type', 'application/octet-stream');
      res.setHeader('Cache-Control', 'no-store');
      res.end(body);
    } catch (_) {
      res.statusCode = 404;
      res.end();
    }
  };
  return {
    name: 'pdfjs-runtime-assets',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const [pathOnly] = (req.url || '').split('?');
        /* The capture deliberately excludes path separators beyond the flat
           file name: both asset sets are flat directories, and `..` must
           never reach the filesystem read. */
        const cmap = /^\/assets\/pdfjs\/cmaps\/([\w.-]+\.bcmap)$/.exec(pathOnly);
        if (cmap) return void serve(res, join(packageDir, 'cmaps', cmap[1]));
        const font = /^\/assets\/pdfjs\/standard_fonts\/([\w.-]+)$/.exec(pathOnly);
        if (font) return void serve(res, join(packageDir, 'standard_fonts', font[1]));
        next();
      });
    },
    closeBundle() {
      try {
        cpSync(join(packageDir, 'cmaps'), join(process.cwd(), 'dist', 'assets', 'pdfjs', 'cmaps'), { recursive: true });
        cpSync(join(packageDir, 'standard_fonts'), join(process.cwd(), 'dist', 'assets', 'pdfjs', 'standard_fonts'), { recursive: true });
      } catch (error) {
        if (error && error.code !== 'ENOENT') throw error;
      }
    },
  };
}

/* P_perf-strip-html-comments — index.html carries ~16 KB of developer
   documentation in HTML comments. The source keeps every one of them (they
   explain why the boot shell is shaped the way it is), but the shipped
   document does not need them: they cost ~6.6 KB of gzip on the
   render-blocking path, about a third of the compressed shell, and pushed
   the entry budget over its limit.
   Script and style blocks are matched first, so their bodies are never
   touched — the inline theme resolver is hashed by
   scripts/gen-csp-hashes.mjs, and the entry-graph audit reads the same
   built document this plugin produces. */
function createStripHtmlCommentsPlugin() {
  /* A script/style block is consumed as one unit, so a comment inside it is
     never offered to the comment branch. */
  const PROTECTED_BLOCK = /(<script\b[\s\S]*?<\/script>|<style\b[\s\S]*?<\/style>)|<!--[\s\S]*?-->/g;
  return {
    name: 'strip-html-comments',
    apply: 'build',
    enforce: 'post',
    transformIndexHtml(html) {
      return html.replace(PROTECTED_BLOCK, (match, protectedBlock) => protectedBlock ?? '');
    },
  };
}

export default defineConfig({
  define: { __SOCRATES_BUILD_ID__: JSON.stringify(getBuildId()) },
  root: '.',
  publicDir: 'public',
  /* P_perf-woff2-only — modern browsers universally support WOFF2.
     @fontsource packages declare both .woff2 and .woff in each @font-face rule,
     which forces Vite to emit hundreds of redundant .woff files (~15MB extra
     uncompressed disk footprint). PostCSS strips format('woff') before Vite
     resolves asset URLs so only compact WOFF2 slices are bundled and transferred. */
  css: {
    postcss: {
      plugins: [
        {
          postcssPlugin: 'strip-woff-fallback',
          Declaration(decl) {
            if (decl.prop === 'src' && decl.value.includes('.woff')) {
              decl.value = decl.value.replace(/,\s*url\([^)]+\.woff\)\s*format\([^\)]+\)/g, '');
            }
          },
        },
      ],
    },
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      /* The sub-path aliases have to come before the package alias: Vite
         matches string aliases by prefix, so a bare `@socrates/core` would
         swallow `@socrates/core/motion/spring` and look for it *inside*
         index.ts. */
      '@socrates/core/motion/spring': fileURLToPath(new URL('../packages/core/src/motion/spring.ts', import.meta.url)),
      '@socrates/core/visualizationMath': fileURLToPath(new URL('../packages/core/src/visualizationMath.js', import.meta.url)),
      '@socrates/core/visualizationNormalize': fileURLToPath(new URL('../packages/core/src/visualizationNormalize.js', import.meta.url)),
      '@socrates/core/learningBlocks': fileURLToPath(new URL('../packages/core/src/learningBlocks.ts', import.meta.url)),
      '@socrates/core/turnRuntime': fileURLToPath(new URL('../packages/core/src/turnRuntime.js', import.meta.url)),
      /* P_perf-core-barrel — the eager graph only needs frame splitting and
         the tool-run contract. A bare `@socrates/core` import pulls the whole
         barrel (demonstration/physics/visualization runtimes) into the boot
         chunk, so narrow subpaths keep that code in lazy chunks. */
      '@socrates/core/sse': fileURLToPath(new URL('../packages/core/src/sse.ts', import.meta.url)),
      '@socrates/core/toolRun': fileURLToPath(new URL('../packages/core/src/toolRun.ts', import.meta.url)),
      '@socrates/contracts': fileURLToPath(new URL('../packages/contracts/src/index.ts', import.meta.url)),
      '@socrates/core': fileURLToPath(new URL('../packages/core/src/index.ts', import.meta.url)),
      /* RN-1 — shared React Native modules render through react-native-web.
         Only the narrow entries are aliased, so the web shell never pulls in
         the full packages/ui barrel (svg, reanimated, markdown). */
      '@socrates/theme': fileURLToPath(new URL('../packages/theme/src/index.ts', import.meta.url)),
      '@socrates/ui/primitives': fileURLToPath(new URL('../packages/ui/src/primitives/index.ts', import.meta.url)),
      '@socrates/ui/home': fileURLToPath(new URL('../packages/ui/src/home/index.ts', import.meta.url)),
      '@socrates/ui/turn': fileURLToPath(new URL('../packages/ui/src/turn/index.ts', import.meta.url)),
      '@socrates/ui/learn-model': fileURLToPath(new URL('../packages/ui/src/learn/model.ts', import.meta.url)),
      '@socrates/ui/learn-split': fileURLToPath(new URL('../packages/ui/src/learn/split.ts', import.meta.url)),
      '@socrates/ui/learn': fileURLToPath(new URL('../packages/ui/src/learn/index.ts', import.meta.url)),
      '@socrates/ui/think-model': fileURLToPath(new URL('../packages/ui/src/think/model.ts', import.meta.url)),
      '@socrates/ui/think': fileURLToPath(new URL('../packages/ui/src/think/index.ts', import.meta.url)),
      '@socrates/ui/study-model': fileURLToPath(new URL('../packages/ui/src/study/model.ts', import.meta.url)),
      '@socrates/ui/study': fileURLToPath(new URL('../packages/ui/src/study/index.ts', import.meta.url)),
      '@socrates/ui/composer': fileURLToPath(new URL('../packages/ui/src/composer/index.ts', import.meta.url)),
      '@socrates/ui/shell': fileURLToPath(new URL('../packages/ui/src/shell/index.ts', import.meta.url)),
      '@socrates/ui/settings': fileURLToPath(new URL('../packages/ui/src/settings/index.tsx', import.meta.url)),
      '@socrates/ui/exam': fileURLToPath(new URL('../packages/ui/src/exam/index.ts', import.meta.url)),
      '@socrates/ui/exam-model': fileURLToPath(new URL('../packages/ui/src/examModel.ts', import.meta.url)),
      'react-native': 'react-native-web',
    },
    /* packages/ have no node_modules of their own: resolve their bare React
       imports from this app so the shell and the shared modules share one
       React instance. */
    dedupe: ['react', 'react-dom', 'react-native-web'],
    /* Platform files win on web (`Foo.web.tsx` before `Foo.tsx`), matching
       Metro's resolution for apps/socrates. */
    extensions: ['.web.tsx', '.web.ts', '.web.mjs', '.web.js', '.mjs', '.js', '.mts', '.ts', '.jsx', '.tsx', '.json'],
  },
  optimizeDeps: {
    /* react-native-web ships CommonJS helpers (fbjs, inline-style-prefixer);
       pre-bundle them so the dev server does not crawl them on first use. */
    include: ['react-native-web'],
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    cssCodeSplit: true,
    /* Vite checks minified chunks before gzip. The production entry graph has
       a separate compressed-transfer budget, while the largest emitted files
       are intentionally demand-loaded visualization runtimes (tldraw, MapLibre
       and Three.js). Keep a 1.5 MB raw ceiling to avoid flagging those deferred
       libraries while still surfacing further growth in a single chunk. */
    chunkSizeWarningLimit: 1500,
    /* P_perf-no-css-data-urls — small below-fold stylesheets (deferred-*
       leaves) reach the build as plain assets, not CSS entries, so the
       default 4 KB inline budget would emit them as data: URLs. Two
       reasons to forbid that: Content-Security-Policy style-src allows
       'self' + 'unsafe-inline' but NOT data: (a data: stylesheet is
       blocked in production and the surface silently loses its styles —
       caught by e2e/landing-light-visual's console-error gate), and a
       data: blob in HTML is uncacheable bytes on every load. Fonts and
       images keep the default budget (their filePath never ends in
       .css, so the woff2 slices inlined into the critical CSS are
       unaffected). */
    assetsInlineLimit: (filePath) => {
      // Libraries fetch JSON URL imports (including tldraw's empty en.json).
      // A data: URL is blocked by connect-src; emit a same-origin file instead.
      if (typeof filePath === 'string' && (filePath.endsWith('.css') || filePath.endsWith('.json'))) return false;
      return undefined;
    },
    rollupOptions: {
      preserveEntrySignatures: false,
      onwarn(warning, defaultHandler) {
        const source = String(warning.id || (warning.loc && warning.loc.file) || warning.message || '')
          .replace(/\\/g, '/');
        /* Client-only React packages publish a `use client` boundary for
           frameworks with server components. This Vite SPA bundles every
           imported module for the browser, so Rollup drops that directive
           without changing behavior. Keep every other build warning visible. */
        if (warning.code === 'MODULE_LEVEL_DIRECTIVE'
            && warning.message.includes('"use client"')
            && source.includes('node_modules/')) return;
        /* Zod 4.6 ships two misplaced @__PURE__ comments. Rollup removes
           those comments itself because they are outside a call expression;
           ignore only that discarded-annotation notice from the dependency. */
        if (warning.code === 'INVALID_ANNOTATION'
            && warning.message.includes('comment will be removed')
            && source.includes('node_modules/zod/')) return;
        defaultHandler(warning);
      },
      output: {
        // Rolldown's manualChunks compatibility mode recursively captures
        // dependencies: an editor group can swallow React and shared helpers.
        // Keep ownership explicit and preserve side-effect evaluation order.
        strictExecutionOrder: true,
        codeSplitting: {
          includeDependenciesRecursively: false,
          groups: [{ debugName: 'explicit-vendors', name(id) {
            const f = id.split('\\').join('/');
            if (f.includes('@oxc-project') && f.includes('/helpers/')) return 'vendor-runtime';
            // The shared preload helper must not pull a lazy vendor into boot.
            if (f.includes('vite/preload-helper')) {
              return 'vendor-react';
            }
            if (f.includes('/node_modules/')) {
              // Shared positioning/store helpers must not belong to an editor.
              if (f.includes('/node_modules/@floating-ui/')) return 'vendor-floating';
              if (f.includes('/node_modules/use-sync-external-store/')) return 'vendor-react';
              if (f.includes('/node_modules/react-dom/') || f.includes('/node_modules/react/') || f.includes('/node_modules/scheduler/') || f.includes('/node_modules/zustand/')) {
                return 'vendor-react';
              }
              if (f.includes('/node_modules/@tiptap/') || f.includes('/node_modules/prosemirror-') || f.includes('/node_modules/orderedmap/')) {
                return 'vendor-editor';
              }
              if (f.includes('/node_modules/marked/') || f.includes('/node_modules/dompurify/')) {
                return 'vendor-markdown';
              }
              if (f.includes('/node_modules/tldraw/') || f.includes('/node_modules/@tldraw/')) {
                return 'vendor-tldraw';
              }
              if (f.includes('/node_modules/three/')) {
                return 'vendor-three';
              }
              if (f.includes('/node_modules/@lobehub/')) {
                return 'vendor-icons';
              }
              return;
            }
            if (f.includes('connector-icons') || f.includes('/assets/connector-icons/')) {
              return 'vendor-connector-icons';
            }
          } }],
        },
        entryFileNames: 'assets/[name]-[hash].js',
        // nginx's default MIME table serves .mjs as octet-stream. Module
        // workers enforce JavaScript MIME even for pdf.js's fake fallback.
        // Keep the content hash, but publish imported module assets as .js.
        assetFileNames(asset) {
          return asset.names.some((name) => name.endsWith('.mjs'))
            ? 'assets/[name]-[hash].js'
            : 'assets/[name]-[hash][extname]';
        },
        chunkFileNames(chunkInfo) {
          if (chunkInfo.name && chunkInfo.name.startsWith('vendor-')) {
            return 'assets/[name]-[hash].js';
          }
          return 'assets/chunk-[hash].js';
        },
      },
    },
    target: 'es2020',
    // Terser reduces public transfer size; client-side code is never secret.
    // Avoid runtime string-table obfuscation, which adds parse/decode work.
    minify: 'terser',
    terserOptions: {
      compress: {
        drop_console: true,
        drop_debugger: true,
        pure_funcs: ['console.log', 'console.debug', 'console.info'],
        passes: 2,
      },
      mangle: {
        toplevel: true,
        safari10: true,
      },
      format: {
        comments: false,
      },
    },
    sourcemap: false,
    modulePreload: { polyfill: true },
  },
  plugins: [
    tailwindcss(),
    createLocalApiStubPlugin({ localAuthBypass: LOCAL_AUTH_BYPASS }),
    createStripHtmlCommentsPlugin(),
    createPdfjsRuntimeAssetsPlugin(),
    createPrecompressedAssetsPlugin(),
    createEntryGraphPlugin(),
    createRetryDynamicImportsPlugin(),
  ],
  server: {
    fs: {
      allow: [
        searchForWorkspaceRoot(fileURLToPath(new URL('.', import.meta.url))),
        fileURLToPath(new URL('../site/media/fonts', import.meta.url)),
      ],
    },
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
