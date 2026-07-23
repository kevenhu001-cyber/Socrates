# Socrates API

The backend is migrating incrementally from ESM JavaScript to strict
TypeScript. Existing API routes and production process supervision remain
compatible throughout the migration.

## Commands

```sh
npm run dev        # tsx watch over the mixed source tree
npm run typecheck  # strict checks for migrated .ts modules
npm run build      # emit the mixed JS/TS tree into dist/
npm test           # run source tests through the tsx loader
npm start          # stable compatibility entry -> compiled runtime
```

The test command runs each test file in its own process. Only
`fetchBatch.test.js` receives Node's force-exit flag because its extractor
worker pool intentionally remains warm; this also avoids a Node 24 Windows
test-worker shutdown assertion without weakening any test assertion.

`src/index.js` is intentionally a small compatibility entry because existing
systemd installations may execute that path directly. The application runtime
is compiled to `dist/index.runtime.js`; `deploy.sh` builds it before restarting
the service.

Unmigrated `.js` files are emitted without being treated as strict TypeScript.
New `.ts` files are checked strictly. This separates existing JavaScript type
debt from the quality bar for migrated modules.
