# React + TypeScript Migration

This migration preserves the current UI, copy, routes, API payloads, and
deployment behavior. React replaces DOM ownership incrementally; TypeScript
replaces JavaScript module by module.

## Current status

All user-facing surfaces are React-driven under the always-on runtime.
The legacy DOM/window compatibility layer has been progressively
shredded: every `_reactOwnsXxx()` guard is gone, and most of the
legacy renderers that lived behind those guards have been deleted
or collapsed into React-only paths.

Concrete progress since the runtime landed:

- `_reactOwnsXxx()` guards deleted from `main.js`, every `ui/*.js`,
  and every module surface (commits `40dd5d7`, `b2668ab`,
  `a0de1fc`, `ca22389`, `d63279c`, `f8d9460`, `2dacaa3`).
- `addMessage` collapsed to React-only (commit `1b5a081`).
- `loadIntoHistory` collapsed to React-only: 130-line legacy DOM
  rebuild loop, the viz/mermaid/code-block post-process pass, the
  legacy local-recovery DOM mount, and the legacy
  streamingText-recovery DOM mount all deleted; state push + bridge
  publish is authoritative; retry click delegated on `msgList`
  (commit `526c19d`).
- `branchFromMessage` legacy DOM-rebuild loop replaced with a
  direct `state-synced` publish (commit `526c19d`).
- `doRenderRecents` collapsed to `_publishSessionList()` +
  `renderRecentsFilterChips()`; 130-line legacy innerHTML render
  path (filter / search / per-row HTML / `attachLongPress` /
  `setupRecentsListDelegated`) deleted (commit `526c19d`).
- `replaceWithError` legacy `body.innerHTML=errHtml` fallback
  collapsed to React-mode state push + click delegation
  (commit `526c19d`).
- `setChatStopState` legacy innerHTML icon swap deleted; React
  re-renders `#sendBtnContent` from `dataset.stop` (commit
  `526c19d`).
- Bug fix: streaming-finish / streaming-abort / streaming-error
  cleanup paths referenced an undeclared `msgList` instead of the
  closure's `list`, so the guard never fired and the legacy
  bubble persisted in the DOM after every stream — visible as a
  duplicate bubble. Also, the retry-click delegation on
  React-rendered error bubbles never fired. Fixed by using the
  declared `list` and dropping the redundant
  `dataset.reactMigrationRuntime === "msg-list"` guard (commit
  `069e82d`).
- 47 dead `*.ts` duplicates outside `react/` deleted — only the
  `src/render/*.ts` files are wired through re-export bridges
  (`export * from './foo.ts'`) in the `.js` siblings; everything
  else was stale code drifting away from its live `.js` twin
  (commits `77394bc`, `734e5f3`).

Remaining work is described in the [legacy DOM/window
compatibility layer removal section](#legacy-domwindow-compatibility-layer-removal)
below.

### Frontend

- [x] Strict TypeScript configuration and shared chat contracts
- [x] React runtime always-on — the `?react=1` query flag was removed,
      so the legacy bootstrap always imports
      `"./react/bootstrap.tsx"` and calls
      `bootstrapReactCompatibilityRuntime()`.
- [x] New-reply pill hydrated by React
- [x] Legacy chat state and stream lifecycle exposed through an immutable
      `useSyncExternalStore` boundary
- [x] Send/stop button content hydrated from derived stream status
- [x] Cmd+K palette ported to React/TS
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
      (`window.__socratesAttachmentsBridge`). Remove button dispatches
      through `window.removeAttachment`. Scope pivot from message list
      (Batch 4 original) to attachment chips: the message list is too
      tightly coupled to streaming + tool cards + thinking pills to port
      in one batch (each sub-component would need its own bridge + port).
- [x] React application shell and routing — sidebar header and footer
      ported to React/TS (`frontend/src/react/sidebar-chrome/`). The
      header (logo, new-chat button, close button) and footer (user
      avatar, name, tier badge, theme toggle, display, settings buttons)
      are rendered via `createRoot` + `render` under the always-on
      runtime. Remaining app-shell surfaces: workspace pages
      (library/projects/plugins) and scheduled page are already migrated;
      exam page remains legacy.
- [x] Session list and project navigation — session list (recents)
      ported to React/TS (`frontend/src/react/session-list/`). The
      `#recentsList` element is rendered via `createRoot` + `render`
      under the always-on runtime; `doRenderRecents()` in `main.js`
      publishes the session list data to the
      `window.__socratesSessionListBridge`. Empty states, tag pills, pin
      icon, mode badges, meta line, and delete/tag buttons are all
      handled by React.
- [x] Composer input, send, and stop actions — send button content
      (`#sendBtnContent`) and start button content (`#startBtnContent`)
      are now rendered by React/TS, showing the appropriate SVG icon
      (arrow vs stop square) based on stream status. The textarea,
      effort picker, and topic-setup/chat-input lifecycle remain legacy
      (deferred — the textarea is tightly coupled to `autoResize`,
      `updateSendBtn`, `handleChatKey`, and streaming).
- [x] Settings modal ported to React/TS (`frontend/src/react/settings/`).
      React owns the overlay shell (header, close button, backdrop click).
      The bridge publishes `open` state + `bodyHTML` through
      `window.__socratesSettingsBridge`.
- [x] Account, library, scheduled tasks, and plugins — all migrated as
      part of the workspace/scheduled page React components
      (`frontend/src/react/pages/workspace/`, `frontend/src/react/pages/scheduled/`).
- [x] Message list, editing, regeneration, branching, and feedback
      (`frontend/src/react/message-list/` +
      `frontend/e2e/message-list-compat.spec.mjs`). React owns
      `#msgList`; `addMessage()` and the loadSession history rebuild
      push into `state.messages` and let React paint from the snapshot.
      The streaming pipeline's `finish()` / `abort()` /
      `replaceWithError()` paths drop the legacy bubble before the
      bridge publishes, so the snapshot-driven re-render paints exactly
      one finalized bubble. Toolbar callbacks dispatch to legacy
      `window.editUserMessage` /
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

### Legacy DOM/window compatibility layer removal

- [x] **C2 (full)** — `buildMessageToolbar` / `stripHtmlToText` /
      `legacyCopy` already deleted (commit `223d7b4`); only comments
      referencing the migration remain in `main.js`.
- [x] **Per-surface `data-react-rendered` guards dropped** — every
      `_reactOwnsXxx()` guard is gone (commits `40dd5d7`,
      `b2668ab`, `a0de1fc`, `ca22389`, `d63279c`, `f8d9460`,
      `2dacaa3`). The remaining `data-react-rendered` /
      `reactMigrationRuntime` checks in `main.js` are limited to
      streaming bubble cleanup (detach the legacy bubble so React's
      snapshot-driven re-render doesn't duplicate it), which still
      does real work.
- [x] **`main.js` legacy render paths collapsed** — `addMessage`,
      `loadIntoHistory`, `branchFromMessage`, `doRenderRecents`,
      `replaceWithError`, `setChatStopState` are now React-only.
      Net: ~458 lines of dead DOM-mutation code removed (commit
      `526c19d`).
- [x] **Bug fix** — streaming controllers' cleanup guards referenced
      an undeclared `msgList`, so the legacy bubble was never detached
      before React re-rendered (visible as a duplicate bubble after
      every stream). Fixed by using the closure's `list` and dropping
      the redundant `dataset.reactMigrationRuntime === "msg-list"`
      guard (commit `069e82d`).
- [x] **Dead `*.ts` duplicates removed** — 47 stale `.ts` files
      outside `react/` deleted. Only `src/render/*.ts` are wired
      through re-export bridges in the `.js` siblings; every other
      `.ts` twin was drifting away from its live `.js` version and
      was never reached at runtime (commits `77394bc`, `734e5f3`).
- [x] **C1** — trim `windowExports.js` (removed 72 unused bindings
      that were never read via `window.*` by any external module or
      inline handler. See commit details for the full list.)
- [x] **C1'** — trim the `bridgeMainJsFunctions()` self-bridge in
      `main.js` (the 11-line `window.switchTab / setRecentsSearch /
      toggleSidebarView / resetApp / submitChatMessage / startSession /
      signOut / showToast` set) and the 97 other inline
      `window.X = X` lines. Removed ~50 redundant bindings including
      bridgeMainJsFunctions (duplicated in bulk bridge), display/colors
      no-external-consumer bindings, api/safe/viz bindings now handled
      by windowExports.js, and duplicate/safe-to-remove bindings from
      the bulk bridge block.
- [ ] **C4** — delete `windowExports.js` once no legacy reader
      remains.
- [x] **B3** — TS migrate `render/widgetParsers.js` and
      `chat/toolRuntime.js` + `chat/toolRunState.js` (independent of C,
      low priority). `widgetParsers.js` was already a re-export shim for
      its `.ts` twin; `toolRuntime.js` and `toolRunState.js` now re-export
      from their `.ts` sources.
- [x] **P0.2** — ported `ui/findInSession.js` to React/TS as
      `react/find-in-session/FindInSession.tsx` with a typed bridge store
      and extracted DOM highlighting.
- [x] **B4** — TS migrate `chat/offline.js`, `chat/lang.js`, `chat/format.js`,
      `chat/quickActions.js` to TypeScript with full type definitions.

## Required gates

Each migration batch must keep these commands green:

```sh
cd frontend
npm run typecheck
npm run build
npx playwright test e2e/react-compat.spec.mjs e2e/message-list-compat.spec.mjs --config=playwright.config.mjs

cd ../server
npm run typecheck
npm run build
npm run test:strict
```

Pass `--retries=1` on the Playwright suite to absorb the Vite
preview cold-start flakiness the message-list specs trigger when a
brand-new preview server is launched at the start of the run.

Existing baseline failures must be recorded separately and must not be hidden
by changing snapshots or weakening assertions.

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

## LobeHub-alignment baseline (2026-09-04, M1 start)

Recorded before the Zustand/window-bridge decommission (ADR 0001).
M1 is done when the counters below reach zero.

| Metric | Baseline |
|---|---|
| `src/main.js` lines | 9,902 |
| Unique `window.X` bindings in `src/windowExports.js` | 200 |
| `window.X =` self-definitions inside `main.js` | ~138 |
| Unique `window.X` references across `frontend/src` | 1,070 |
| Files using `window.__socrates*` bridges (`src/react/**`) | 37 |
| Distinct `__socrates*` bridge names | 98 |

M5 progress (2026-09-04): 59 dead bridge statements removed after a
full-reference audit (no `window.X` reads in src/e2e/index.html and no
inline `="X("` attribute uses); `windowExports.js` is down to 142 unique
bindings. Imports were kept so module evaluation order is unchanged.

M5 progress (2026-09-05, batch 2): six more URL-history bridges
(`window.getChatIdFromURL / setChatIdInURL / pushChatIdToURL /
getExamIdFromURL / setExamIdInURL / pushExamIdToURL`) deleted from
`main.js`; the helpers are exported by `src/session/store.js` and now
consumed via direct import from `main.js`, `auth/index.js`, and
`exam.js`. `showToast` extracted to `src/ui/toast.js` so 14 consumer
modules (`auth/boot.js`, `batchStorage.js`, `pickers.js`,
`sidebar/nav.js`, `ui/cmdK.js`, `ui/promptTemplates.js`,
`ui/readAloud.js`, `ui/settings.js`, `ui/share.js`, `ui/voiceInput.js`,
`agent/researchAgent.js`, `attachments/render.js`, plus `main.js`
itself) take a real ES import instead of the `window.showToast`
indirection. The misleading `function toast(msg, ms)` wrapper in
`attachments/render.js` (which never propagated `ms` even in the
`window.showToast` era) is gone; inlined into the new module.
`window.showToast` stays as a backward-compat alias for the React
legacy gateway and e2e mocks. Two stray debug files from the previous
batch (`frontend/console-check.tmp.mjs`,
`frontend/e2e/_debug-slow.spec.mjs`) deleted.

M5 progress (2026-09-05, batch 3): three dead `__socratesLegacy` bag
entries retired after a full-reference audit. A regex-based audit
(`scripts/audit-legacy-bag.mjs`) crawled every React reader of
`getLegacyActions().ns.field`, including the
`const X = getLegacyActions().ns; X.field(...)` and
`const { field } = getLegacyActions().ns` patterns, and confirmed
that 111 of 114 assembly fields are still read. The three that are
not — `settings.renderProviderList`, `settings.syncSettingsUI`,
`confirm.showConfirm` — were removed from the `main.js` assembly and
from the `react/legacy/types.ts` declarations. Underlying functions
and window bindings stay: `renderProviderList` and `syncSettingsUI`
are still imported directly by `ui/dangerConfirms.js` and called
within `ui/settings.js`; `window.showConfirm` is still called by
`ui/dangerConfirms.js`, `ui/promptTemplates.js`, `sidebar/nav.js`,
and `ui/confirm.js`; `window.renderProviderList` is still called by
`config/providers.js`. The gateway now types-correctly reports only
the entries the React tree actually consumes. Two audit scripts
(`scripts/audit-window-bridges.mjs` for the `window.X =` surface and
`scripts/audit-legacy-bag.mjs` for the typed legacy bag) are checked
in so future batches can re-run the same reference analysis.

M4 follow-up (2026-09-05): per-message TTS persistence. The
ephemeral `TtsCache` LRU in `server/src/services/ttsCache.ts` was
promoted to a two-tier cache with a durable
`server/src/services/ttsStore.ts` backing it. A new
`tts_results` table (`server/drizzle/0029_tts_results.sql`,
FK `messages.id` ON DELETE CASCADE) stores the synthesized audio
bytes keyed by `(message_id, voice, format, lang, text_hash)`. The
`text_hash` is sha256 of the trimmed text, so an edit to the
message content drops the stale row in `PATCH /api/messages`
(only rows whose `text_hash` no longer matches are deleted — same-
shape attachment-only edits keep their cached audio). A forged
`messageId` cannot read or persist another user's audio because
`ttsStore.verifyOwnership` re-joins `messages` × `sessions` on
`user_id` on every lookup and every save. The wire contract for
`POST /api/tts` is `text, lang, voice?, format?, messageId?` — the
`messageId` is optional so legacy callers keep working. The SPA
toolbar's read-aloud handler now forwards the assistant message's
id (`useMessageActions.ts` → `legacy.messages.toggleReadAloud`,
signature widened in `react/legacy/types.ts` to
`(element, text, messageId?)`). The two new backend test files
(`server/test/ttsStore.test.js`, `server/test/ttsRoute.test.js`)
cover the pure helpers, the ownership gate, the round-trip of a
saved row, the stale-hash miss, and the body-shape guard. Test
pass: server 49/49 suites (was 47), frontend 323/323 unit tests.

Baseline verification (all green at record time):

- `npm run lint` (tsc --noEmit): clean
- `npm run test:unit`: 321/321 pass
- `npm run build`: ok
- `npx playwright test --config=playwright.config.mjs`: 171/171 pass
  (after pre-existing-failure fixes: stale tutor-tab label
  `工作`→`辅导` in `e2e/mode-switch.spec.mjs` +
  `e2e/mobile-composer-reference.spec.mjs`; and
  `P_hide-mode-switch-in-conversation` CSS over-hiding the mode pill on
  the mobile landing — `src/styles.css` now scopes the hide to
  conversation-active only, per the user contract the rule documents.)
