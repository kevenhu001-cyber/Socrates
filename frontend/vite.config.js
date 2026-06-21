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
    // Single-file-friendly: keep things in one CSS and one JS chunk
    // to mimic the current single-file SPA shape (no per-route splits
    // yet — that would be a multi-page migration, out of scope).
    cssCodeSplit: false,
    rollupOptions: {
      output: {
        manualChunks: undefined,
      },
    },
    target: 'es2020',
    minify: 'esbuild',
    sourcemap: false,
  },
  server: {
    port: 5173,
    strictPort: false,
    // Proxy API and asset paths to the live production backend so
    // local dev uses the same auth/cookies as production.
    proxy: {
      '/api': 'http://127.0.0.1:3037',
    },
  },
});
