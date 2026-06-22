import { defineConfig } from 'vite';

// Vite config for the Socrates app. The build output is a single
// HTML + a small JS/CSS bundle that gets deployed to
// /var/www/app.topodrive.top via deploy.sh.
export default defineConfig({
  root: '.',
  publicDir: 'public',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    cssCodeSplit: false,
    rollupOptions: {
      output: {
        manualChunks: undefined,
        format: 'iife',
        entryFileNames: 'assets/[name]-[hash].js',
      },
    },
    target: 'es2020',
    minify: 'esbuild',
    sourcemap: false,
    modulePreload: false,
  },
  server: {
    port: 5173,
    strictPort: false,
    proxy: {
      '/api': 'http://127.0.0.1:3037',
    },
  },
  plugins: [{
    /* Strip `type="module"` and fix CDN script ordering at build time.
     *
     * The dev server must keep `type="module"` on <script src="/src/main.js">
     * so Vite resolves `import './state.js'` / `import './i18n.js'` correctly.
     * At build time Vite bundles everything into an IIFE, so the module
     * attribute would cause "Cannot use import statement outside a module".
     *
     * CDN ordering: Vite injects the bundle into <head> by default, but the
     * CDN scripts (marked, katex, hljs, mermaid, fuse) stay in <body> where
     * the source HTML placed them. This makes the bundle execute before the CDN
     * scripts load — every CDN global is undefined on first access and core
     * features (markdown, KaTeX, highlight.js, mermaid, search) silently fail.
     * We move the bundle <script> from <head> to after the last CDN script. */
    name: 'remove-module-type',
    apply: 'build',
    transformIndexHtml(html) {
      let result = html.replace(/ type="module"/g, '');
      /* Regex matches the bundle injected by Vite, e.g.
         <script crossorigin src="/assets/index-abc123.js"></script> */
      const bundleRe = /<script\s[^>]*src="\/assets\/index-[^"]+\.js"[^>]*><\/script>/;
      const bundleMatch = result.match(bundleRe);
      if (bundleMatch) {
        const bundleTag = bundleMatch[0];
        result = result.replace(bundleTag, '');
        result = result.replace(
          '<!-- Settings Modal -->',
          bundleTag + '\n\n<!-- Settings Modal -->'
        );
      }
      return result;
    },
  }],
});
