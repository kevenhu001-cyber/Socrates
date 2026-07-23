# React + TypeScript Migration

This migration preserves the current UI, copy, routes, API payloads, and
deployment behavior. React replaces DOM ownership incrementally; TypeScript
replaces JavaScript module by module.

## Current status

The migration is **not complete**.

### Frontend

- [x] Strict TypeScript configuration and shared chat contracts
- [x] React loaded only behind `?react=1`
- [x] New-reply pill hydrated by React
- [x] Legacy chat state and stream lifecycle exposed through an immutable
      `useSyncExternalStore` boundary
- [x] Send/stop button content hydrated from derived stream status
- [ ] React application shell and routing
- [ ] Session list and project navigation
- [ ] Composer input, attachments, send, and stop actions
- [ ] Message list, editing, regeneration, branching, and feedback
- [ ] Tool cards, visualizations, Markdown, and artifact rendering
- [ ] Settings, account, library, scheduled tasks, and plugins
- [ ] Remove the query flag and legacy DOM/window compatibility layer

### Backend

- [x] Strict TypeScript configuration for migrated modules
- [x] Mixed JS/TS production build to `server/dist`
- [x] Stable `src/index.js` compatibility entry for existing systemd units
- [x] Deployment builds the backend before restart
- [x] Errors, UUID validation, cryptography, usage tracking, log redaction,
      cookie-domain selection, multimodal detection, and tier limits migrated
      to TypeScript
- [ ] Shared Express request/user and API payload types
- [ ] Database client and schema boundary
- [ ] Middleware and authentication services
- [ ] CRUD routes
- [ ] Chat request validation and SSE stream route
- [ ] Tool runtimes, connectors, file extraction, and workers
- [ ] Application and runtime entry modules
- [ ] Remove JavaScript compilation compatibility

## Required gates

Each migration batch must keep these commands green:

```sh
cd frontend
npm run typecheck
npm run build
npx playwright test e2e/react-compat.spec.mjs --config=playwright.config.mjs

cd ../server
npm run typecheck
npm run build
npm test
```

Existing baseline failures must be recorded separately and must not be hidden
by changing snapshots or weakening assertions.
