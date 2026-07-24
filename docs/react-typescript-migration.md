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
- [x] Cmd+K palette ported to React/TS behind `?react=1`
      (`frontend/src/react/cmdk/` + `frontend/e2e/cmd-k-compat.spec.mjs`).
      Legacy `src/ui/cmdK.js` retains state ownership and still drives
      `window.openCmdK` / `onCmdKInput` / `onCmdKKey` / `openCmdKResult`;
      React renders the modal contents via a typed `useSyncExternalStore`
      bridge (`window.__socratesCmdK`). Legacy renderer is suppressed by a
      data-attribute guard so the two never collide.
- [x] Sidebar nav buttons + recents filter chips ported to React/TS
      (`frontend/src/react/sidebar/` + `frontend/e2e/sidebar-compat.spec.mjs`).
      Legacy `src/sidebar/nav.js` and `src/sidebar/index.js` keep state
      ownership; React renders the nav buttons and chip bar via typed
      bridges (`window.__socratesSidebarNavBridge`,
      `window.__socratesRecentsFilterBridge`). Legacy `setActiveNav`,
      `setRecentsFilter`, and `renderRecentsFilterChips` still fire; the
      last one is guarded by a data attribute so React's tree isn't
      clobbered. The "More" popover remains legacy (deferred).
- [x] Composer "+" tools menu ported to React/TS
      (`frontend/src/react/composer/` +
      `frontend/e2e/composer-tools-compat.spec.mjs`). Legacy
      `src/ui/composerTools.js` still owns open/close/positioning and the
      document-level click/Escape/resize listeners; React renders the 6
      menu items via a typed bridge (`window.__socratesComposerToolsBridge`).
      The menu element is pre-created on module load so React can hydrate
      eagerly; item clicks dispatch through legacy `window.composeAction` /
      `researchAction` / `toggleExtensionByKey` / `openPromptTemplatesModal`
      / `openAttachmentPicker`. Composer input textarea, attachment chips,
      send/stop button, and effort/web-search/reasoning pickers remain
      legacy (deferred).
- [x] Attachment chip rows ported to React/TS
      (`frontend/src/react/attachments/` +
      `frontend/e2e/attachments-compat.spec.mjs`). Both `#attachmentChips`
      (chat composer) and `#topicAttachmentChips` (tutor topic setup) are
      hydrated; the pending-attachment store in `src/attachments.js`
      remains the source of truth, and React renders via a typed bridge
      (`window.__socratesAttachmentsBridge`). The legacy
      `renderAttachmentChips()` renderer is suppressed by a data-attribute
      guard; remove button dispatches through `window.removeAttachment`.
      Scope pivot from message list (Batch 4 original) to attachment chips:
      the message list is too tightly coupled to streaming + tool cards
      + thinking pills to port in one batch (each sub-component would
      need its own bridge + port).
- [x] React application shell and routing — sidebar header and footer
      ported to React/TS (`frontend/src/react/sidebar-chrome/`). The
      header (logo, new-chat button, close button) and footer (user
      avatar, name, tier badge, theme toggle, display, settings buttons)
      are rendered via `createRoot` + `render` under `?react=1`. The
      legacy `renderUserFooter()` in `ui/profile.js` is suppressed by a
      data-attribute guard and instead publishes the user snapshot to the
      `window.__socratesSidebarChromeBridge`. Remaining app-shell
      surfaces: workspace pages (library/projects/plugins) and scheduled
      page are already migrated; exam page remains legacy.
- [x] Session list and project navigation — session list (recents)
      ported to React/TS (`frontend/src/react/session-list/`). The
      `#recentsList` element is rendered via `createRoot` + `render`
      under `?react=1`. The legacy `doRenderRecents()` in `main.js` is
      suppressed by a data-attribute guard and instead publishes the
      session list data to the `window.__socratesSessionListBridge`.
      Empty states, tag pills, pin icon, mode badges, meta line, and
      delete/tag buttons are all handled by React. The legacy
      `setupRecentsListDelegated()` and `attachLongPress()` are skipped
      in React mode (delegation is built into the React tree).
- [x] Composer input, send, and stop actions — send button content
      (`#sendBtnContent`) and start button content (`#startBtnContent`)
      are now rendered by React/TS under `?react=1`, showing the
      appropriate SVG icon (arrow vs stop square) based on stream status.
      The textarea, effort picker, and topic-setup/chat-input lifecycle
      remain legacy (deferred — the textarea is tightly coupled to
      `autoResize`, `updateSendBtn`, `handleChatKey`, and streaming).
- [x] Settings modal ported to React/TS (`frontend/src/react/settings/`).
      The legacy `ui/settings.js` still generates the provider-list HTML;
      React owns the overlay shell (header, close button, backdrop click).
      The bridge publishes `open` state + `bodyHTML` through
      `window.__socratesSettingsBridge`.
- [x] Account, library, scheduled tasks, and plugins — all migrated as
      part of the workspace/scheduled page React components
      (`frontend/src/react/pages/workspace/`, `frontend/src/react/pages/scheduled/`).
- [x] `?react=1` query flag removed — React compatibility runtime now
      boots on every load. The legacy bootstrap in `main.js` always
      calls `import("./react/bootstrap.tsx")` and invokes
      `bootstrapReactCompatibilityRuntime()`. E2E tests updated to
      navigate to `'/'` instead of `'/?react=1'`.
- [x] Message list, editing, regeneration, branching, and feedback
      (`frontend/src/react/message-list/` +
      `frontend/e2e/message-list-compat.spec.mjs`). React owns
      `#msgList`; `addMessage()` and the loadSession history rebuild
      detect `data-react-migration-runtime="msg-list"` and skip their
      DOM-mutation blocks. The streaming pipeline's `finish()` /
      `abort()` / `replaceWithError()` paths drop the legacy bubble
      before the bridge publishes, so the snapshot-driven re-render
      paints exactly one finalized bubble. Toolbar callbacks dispatch
      to legacy `window.editUserMessage` /
      `regenerateAssistantMessage` / `deleteUserMessage` /
      `branchFromMessage` / `sendFeedback` / `openShareModal` /
      `toggleReadAloud`. Streaming bubbles stay legacy-managed during
      the stream (the 1300-line `addStreamingMessage` pipeline is too
      deeply coupled to incrementally port); React takes over the
      moment the entry's `html` lands.
- [x] Post-render wire hooks for tool cards and markdown (mermaid,
      viz, viz-actions, code-block expand buttons, image lightbox)
      re-fire from `MessageItem`'s `useEffect` after each
      `dangerouslySetInnerHTML` commit. The legacy
      `processPendingMermaid` / `wireCodeBlockHeaders` /
      `wireMsgBodyImages` helpers are bridged on `window` from
      `main.js`; `processPendingViz` / `processPendingVizActions` are
      already on `window` via `windowExports.js`. Each helper is
      idempotent so repeated React re-renders remain safe.
- [ ] Remove legacy DOM/window compatibility layer
      (`windowExports.js`, `window.X = X` self-bridge in `main.js`,
      inline `onclick=` handlers, per-surface `data-react-rendered`
      guards). The migration plan in
      `~/.qoder/plans/slim-wilderness-crane.md` lays out batches C1
      (trim `windowExports.js`), C2 (shrink `main.js` — drop legacy
      `buildMessageToolbar` / `stripHtmlToText`, drop the 116-line
      `window.X = X` block), C3 (drop per-surface guards now that
      every owned surface is React-driven), and C4 (delete
      `windowExports.js` entirely once no legacy reader remains).

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
