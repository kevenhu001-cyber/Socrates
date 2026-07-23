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
- [x] Shared Express request/user and API payload types
- [x] Database client and schema boundary
- [x] Middleware and authentication services
- [x] CRUD routes (account, apiKeys, artifacts, auth, classroom, import,
      knowledgeBoundary, memory, migrate, mistakes, notifications, projects,
      prompts, publicShares, scheduledTasks, sessions, share, status, tags,
      usage, users) migrated to TypeScript. `messages` deferred to the SSE
      batch (streams the LLM); tool/connector/file routes deferred to the tool
      runtimes batch.
- [x] Chat request validation and SSE stream route (chat.ts sync handler,
      chat/helpers.ts Zod schemas + prompt-injection defence + extra_body
      sanitiser + multimodal transforms + prepareChatRequest, chat/stream.ts
      SSE handler, and messages.ts regenerate stream) migrated to TypeScript.
      Fixed a latent `clearInterval(hb)` reference bug in the messages
      regenerate path (keepalive is self-cleaning via startSseKeepalive) and
      relaxed the llm.js streamChatCompletion JSDoc so its runtime-optional
      callbacks (onReasoning/onToolUse) type as optional.
- [x] Tool runtimes, connectors, file extraction, and workers (all 16
      remaining services — codeInterpreter, pyodideWorker, contentExtractor,
      contentExtractorWorker, llm, webSearch, search, statusMonitor,
      visualization, connectorTools, projectConnectorTools, toolRegistry,
      vision, fileArtifacts, artifactOwnership, cleanupDb — plus the leaf
      search-engine/file-parser/connector modules and the 8 tool/connector/file
      routes: connectors, projectConnectors, execution, fileExtract, files,
      minimaxProxy, plugins, vision) migrated to TypeScript. Added
      `declare module` shims for jsdom/multer/pdf-parse/xml2js/rtf2text; relaxed
      the searchResultCache and sanitize JSDoc (optional userId, nullable
      locale, `Record<string, unknown>` return); loosened the llm.ts request
      `messages` type for multimodal content. Removed the same latent
      `clearInterval(<undeclared>)` reference bug in the minimaxProxy stream
      path (keepalive is self-cleaning via startSseKeepalive).
- [x] Application and runtime entry modules (`app.ts`, `index.runtime.ts`, and
      `db/migrate.ts` migrated to TypeScript; `dev`/`db:migrate` scripts repointed
      to the `.ts` sources). Added `declare module` shims for cors/cookie-parser;
      typed the CORS `origin` callback, asserted the auth-gated `req.userId` at the
      local/web/image search handlers, dropped the dead `enrich` option (webSearch
      never read it), and hardened the `unknown` catch/reason handling in the
      runtime bootstrap. The stable `src/index.js` systemd shim is intentionally
      left as JS (delegates to `dist/index.runtime.js`) until the JS-compilation
      removal batch.
- [x] Remove JavaScript compilation compatibility (all 10 remaining
      `src/lib/*.js` helpers — logger, prompts, pubsub, sanitize, searchHealth,
      searchResultCache, spawnFirecrawl, spawnMmx, sse, urlCache — migrated to
      TypeScript. `tsconfig.json` now has `allowJs: false` and `tsconfig.build.json`
      only includes `src/**/*.ts`. The stable `src/index.js` systemd shim is
      intentionally preserved as the only `.js` file (it imports the compiled
      runtime and stays outside the TS include set); delete it once the systemd
      unit is repointed at `dist/index.runtime.js`.)
- [x] Harden the production gate: builds perform full strict checking,
      deployment installs exact lockfile dependencies, emits into an isolated
      candidate directory, keeps the previous compiled tree, and automatically
      restores it when restart or post-deploy health checks fail.
- [x] Restore strict test semantics by closing the content-extractor worker
      pool explicitly and running `test:strict` without Node force-exit.

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
npm run test:strict
```

Existing baseline failures must be recorded separately and must not be hidden
by changing snapshots or weakening assertions.
