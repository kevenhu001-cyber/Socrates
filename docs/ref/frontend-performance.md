# Public SPA performance

The initial production build previously transferred about 1.6 MB of gzipped HTML, CSS, and eager JS. The code-split build transfers about 0.95 MB for the same entry references (computed from `dist/index.html` and gzip), before fonts. These are build-size comparisons, not public FCP results. The public connection measured through the Singapore proxy is substantially slower than the origin loopback; run browser measurements from the intended user regions before applying CDN changes.

## Measure

Build from `frontend/` with `npm run build`. Run `node scripts/measure-load.mjs --runs=3` for origin-loopback cold/warm anonymous sessions, or add `--public` to traverse the configured `HTTPS_PROXY` and the public CDN. The script prints individual requests, Cloudflare cache statuses, and median TTFB, FCP, LCP, long-task time, critical transfer bytes, fonts, and auth calls. For a local candidate, start `node e2e/dist-server.mjs` and use `node scripts/measure-load.mjs --url=http://127.0.0.1:4173/`; this static server does not compress responses, so compare timing rather than transfer bytes against the gzip production baseline. Repeat measurements with the same browser, network, location, and signed-in state.

## Delivery configuration

`ops/nginx/app-performance.conf.example` is the version-controlled set of **replacement** location blocks for the HTTPS `app.topodrive.top` server, not a standalone virtual host. Merge them with the existing OAuth discovery, Expo aliases, HSTS, TLS, and `/api/` legacy route; do not duplicate locations. Apply the same `proxy_hide_header Cache-Control` pattern to the legacy `/api/` proxy if it also adds a local cache policy. The SPA fallback sentinel is rewritten by `deploy.sh` on each release. Set the same no-store policy on both `/` and `index.<timestamp>.html`: Nginx's internal redirect may otherwise apply the versioned-index location's different headers. Avoid `expires` alongside an explicit `Cache-Control` to prevent duplicate fields. Keep `gzip on` and `gzip_vary on` in the global Nginx config; validate with `nginx -t` before reload.

At Cloudflare, bypass edge caching for the SPA entry and `/api/*`, and allow long-lived caching for content-hashed `/assets/*` only. Verify the actual rule precedence and `cf-cache-status` rather than inferring it from origin headers. Do not cache private API responses at the edge. There are no Cloudflare credentials in this repository, so CDN dashboard rules cannot be applied by the deploy script.

After a controlled rollout, check `curl -I` responses for `/`, a versioned index, a hashed JS asset, and `/api/v2/config` from the origin and public hostname. Confirm HTML/API are not stored, assets can become CDN HIT, no duplicate cache directive is emitted, and old hashed assets remain available across a deployment. `deploy.sh` publishes assets before switching HTML and prunes assets older than `ASSET_RETENTION_DAYS` (default 30) only after successful gates. Keep the prior frontend entry and backend `dist.previous` rollback paths intact.

Run `bash scripts/test-deploy-flow.sh`, frontend lint/build, and focused Playwright specs (`performance-loading`, `settings-modal`, `projects-directory`, `boot`, and changed chat flows) before release.
