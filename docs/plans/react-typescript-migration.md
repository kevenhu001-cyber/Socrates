# React + TypeScript Migration

Current frontend convergence work follows
[`2026-10-05-frontend-convergence.md`](2026-10-05-frontend-convergence.md).

This migration preserves the current UI, copy, routes, API payloads, and
deployment behavior. React replaces DOM ownership incrementally; TypeScript
replaces JavaScript module by module.

## Current status

TypeScript inventory as of 2026-10-30: all 88 remaining first-party JavaScript modules under
`frontend/src/` have been migrated to TypeScript. `frontend/tsconfig.json` has
`allowJs: false`, and `scripts/check-legacy-js.mjs` has an empty baseline;
third-party UMD bundles under `src/vendor-files/` are excluded. The React
runtime is always on and owns the surfaces listed as migrated below. Some
compatibility, navigation, session, chat, and rendering runtime code remains,
but it now lives in typed modules and is bridged through typed interfaces.
React migration describes surface ownership; it does not mean every runtime
compatibility path has been removed. The compatibility layer has also been
progressively reduced: every `_reactOwnsXxx()` guard is gone, and most legacy
renderers that lived behind those guards have been deleted or collapsed into
React-only paths.

React ownership update, 2026-10-31: the exam route and shared exam view,
creation surfaces, knowledge and mistake panels, public shared transcripts,
and streaming assistant rows now render through React roots/components. Retry
actions for active and recovered turns are React event handlers. The composer
effort control and top-bar model switcher now render from provider/preference
state; React owns provider selection, the hidden compatibility picker and its
DOM synchronizers have been removed. The Extensions picker controller also
had no live host, so it is retired; extension actions now dispatch through
the registry and the React composer tools. The imperative `ui/effortPicker.ts`
owner plus its `syncEffortUI` window alias are gone. Focused coverage is in the
exam, share, message-list, pending-turn restore, composer-tools, and top-bar
specs. Web Search reads the typed state store directly; the old `#searchPill`
writer was removed after confirming the application has no such host.

React ownership update, 2026-10-31 (usage modal): usage API results now enter a
structured typed snapshot; React renders the totals, Beagle limit summary,
activity calendar, monthly table, period controls, loading/error states, and
day tooltip. The old HTML string builder, delegated tab/hover listeners, and
body-level tooltip writer were removed. The modal open state now comes from the
same snapshot, with React reflecting it to the existing accessible overlay
host so the shared focus manager continues to observe open/close transitions.

React ownership update, 2026-10-31 (voice input): the microphone service now
publishes recording phase, elapsed time, transcript, and sampled waveform data
to a typed Zustand store. React renders the recording strip, waveform, timer,
cancel/stop actions, microphone pressed state, and composer recording layout;
the service retains only speech recognition, audio capture, and cleanup. The
recording bar no longer creates nodes or writes labels, waveform styles, or
composer classes directly. Focused Playwright coverage exercises transcript
commit, cancellation, and track cleanup.

React ownership update, 2026-10-31 (agent activity): workspace-agent plans,
steps, disclosures, elapsed time, status, and output are now rendered from the
persisted tool-call snapshot by `ToolRunAgentSteps`. `ui/agentSteps.ts` now
contains only types and display-model helpers; its imperative section/row
upserts and shared DOM timer were removed. The existing streamed-agent spec
continues to cover step updates, plan progress, final duration, and expanded
output.

React ownership update, 2026-10-31 (detail and message auxiliaries): the shared
detail surface renders its body content as React children; artifact previews,
site previews, and library details no longer pass DOM nodes into that shell.
Message image preview clicks now belong to `MessageBody`, and the old
per-image listener that opened the unrelated visualization modal was removed.
Fetched page previews and the missing-URL hint are stored as ephemeral message
data and rendered by `LinkPreviews`; they no longer append cards to a React row.
Home quick actions and tutor starters now own their click handlers, research
toggle state, and dismissed-action state in React. Legacy web-search result
cards render from a React root with sanitized links and React copy feedback.
Focused coverage now includes detail preview interaction, fetched and missing
link previews, the sanitized search-result model, and React-rendered result
markup.

React ownership update, 2026-10-31 (authentication gate): the auth tree now
owns view selection, tab selection, controlled form fields, validation and
request feedback, code-login steps, and focus requests through a typed auth UI
store. React handles tab, link, and form events directly; selector-bound auth
listeners have been removed. Auth request/session-adoption logic remains in
`auth/forms.ts`, while the outer auth/app shell visibility and legacy i18n pass
stay at the browser integration boundary. `auth-direct-handlers.spec.mjs` now
exercises the React-owned flow, with focused state coverage in
`test/authUiState.test.mjs`.

React ownership update, 2026-10-31 (mistake redo): practice and quiz retries
now append structured assistant messages to the typed session store. React
renders each row and the existing React tutor-widget roots own answer input,
feedback, and quiz selection. The mistake card no longer inserts message DOM,
replaces a quiz subtree, or scrolls the transcript directly; quiz mistakes are
re-associated with the new slot so a correct retry resolves the right entry.
Focused unit and Playwright coverage checks both retry types and slot cleanup.

React ownership update, 2026-10-31 (message editing): `MessageItem` now owns
the inline edit state and controlled form. Committing delegates only the
conversation rollback, persistence, attachment rebuild, and replay work; the
React row updates from the session store. The temporary edit root and the
message-body `innerHTML` restore helper were removed, along with the edit
window bridge. Browser coverage exercises opening/canceling and editing a
streamed turn; unit coverage checks state pruning and ordered server replay.

React ownership update, 2026-10-31 (saved tool artifacts): `ArtifactOutput`
now renders sandboxed HTML previews and download links directly, and owns the
failed-file retry state. The imperative `ui/toolArtifacts.ts` renderer and its
`postRender.appendInlineArtifact` bridge were removed; history recovery no
longer inserts a second file node beside the React output. Generated images
remain hidden until referenced by assistant prose. Focused tool-output browser
coverage checks the sandbox, preview action, legacy artifact records, and a
404-to-success retry.

React ownership update, 2026-10-31 (continued): the Chat/Tutor mode control now
subscribes to provider mode state, and its active label and roving tab stop
render in React. The unreachable `#mobileMode` dropdown was removed after the
active phone CSS proved it hidden at every viewport. Sidebar open state and incognito
state now use explicit subscriptions; the top-bar/sidebar buttons render their
visibility and accessible labels from those snapshots. The session search
input is controlled by the React session-list store. Direct actions for the
topbar, composer, sidebar view buttons, and settings button now live on their
React components; the shell-wide document click dispatcher and its bootstrap
action table were removed. The sidebar's recents/knowledge/mistakes selection
now lives in the sidebar Zustand store, while React renders the selected button
state and CSS applies it to the three panel hosts. The old `switchTab` DOM class
mutator is gone; native web sessions still enter through `toggleSidebarView`,
now a thin store-updating compatibility action.

React ownership update, 2026-10-31 (composer tools): the plus menu now uses a
typed Zustand store and React-rendered root. React owns disclosure, accessible
expanded state, outside-click/Escape dismissal, and viewport-change listeners;
the placement helper only measures the committed menu and applies its geometry.
The legacy `ui/composerTools.ts` owner, `toggleComposerTools` window alias, and
composer action bridge entry were removed. Coverage opens the menu through the
actual React trigger and checks topic/chat behavior, action dispatch, and
dismissal.

React ownership update, 2026-10-31 (conversation chrome): `ModeSwitch` now
derives active-conversation visibility from the typed session and knowledge
stores. The message-list `MutationObserver`, inline visibility writer, and
`syncConversationActive` window callback were removed; React publishes the
body attribute used by the responsive shell CSS.

React ownership update, 2026-10-31 (display preferences): the sidebar theme,
display, text-size, width, grid, and background controls now use direct React
handlers and state. React owns the popover visibility, outside-click dismissal,
positioning, selected radio state, and control values. The document-level
display-preferences click/input handlers and DOM control synchronizer are gone;
the typed preference module retains persistence and applies theme variables to
the document. Existing More-menu/native entry points dispatch a typed UI event.

Compatibility bridge update, 2026-10-31: the unused `syncAppModeUI` and
`launchDeepResearch` window aliases were removed. Locale and post-auth flows
import mode synchronization directly; the chat send pipeline lazy-loads
`startDeepResearch` directly. API requests, CSRF lookup, active-provider
reads, Chat/Tutor mode state, web-search preference, and pending attachments
now use their owning modules instead of `window` aliases. Attachment coverage
selects files through the real composer input and checks rendered chips and
actions. The `appMode` and attachment array mirrors are gone. All former
`windowExports.ts` callers now use direct imports or the typed legacy gateway;
the extension window delegates were also removed, so C4 is complete.

Concrete progress since the runtime landed:

- `_reactOwnsXxx()` guards deleted from `main.js`, every `ui/*.js`,
  and every module surface (commits `40dd5d7`, `b2668ab`,
  `a0de1fc`, `ca22389`, `d63279c`, `f8d9460`, `2dacaa3`).
- `addMessage` collapsed to React-only (commit `1b5a081`).
- `loadIntoHistory` collapsed to React-only: 130-line legacy DOM
  rebuild loop, the viz/mermaid/code-block post-process pass, the
  legacy local-recovery DOM mount, and the legacy
  streamingText-recovery DOM mount all deleted; state push + bridge
  publish is authoritative; retry actions are direct React handlers
  (commit `526c19d`).
- `branchFromMessage` legacy DOM-rebuild loop replaced with a
  direct `state-synced` publish (commit `526c19d`).
- `doRenderRecents` collapsed to `_publishSessionList()` +
  `renderRecentsFilterChips()`; 130-line legacy innerHTML render
  path (filter / search / per-row HTML / `attachLongPress` /
  `setupRecentsListDelegated`) deleted (commit `526c19d`).
- `replaceWithError` legacy `body.innerHTML=errHtml` fallback
  collapsed to React-mode state push + direct React retry callback
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
- 47 dead `*.ts` duplicates outside `react/` deleted (commits
  `77394bc`, `734e5f3`); first-party JavaScript modules have since
  been migrated too, and no active `.js` re-export shells remain under
  `frontend/src`.
- At that stage, the tracked untyped-JS inventory shrank from 109 to 107 paths.
- Pure lifecycle decision helpers `modeDecision` and `resetDecision` migrated
  to typed `.ts` modules; their JS callers and focused test imports now point
  directly to the typed sources. The remaining callers were migrated in the
  2026-10-30 TypeScript conversion.

Remaining work is described in the [legacy DOM/window
compatibility layer removal section](#legacy-domwindow-compatibility-layer-removal)
below.

### Frontend

- [x] Strict TypeScript configuration and shared chat contracts
- [x] React runtime always-on — the `?react=1` query flag was removed,
      so the legacy bootstrap always imports
      `"./react/bootstrap.tsx"` and calls
      `bootstrapReactCompatibilityRuntime()`.
- [x] Top-bar model selector and reasoning popover ported to React
      (`frontend/src/react/topbar/` + `frontend/src/react/chat-configuration/`).
      Provider selection, model labels, effort, and speed render from the
      provider/preference stores; the retired hidden picker and its imperative
      DOM synchronization have been removed.
- [x] New-reply pill hydrated by React
- [x] Legacy chat state and stream lifecycle exposed through an immutable
      `useSyncExternalStore` boundary
- [x] Send/stop button content hydrated from derived stream status
- [x] Cmd+K palette ported to React/TS
      (`frontend/src/react/cmdk/` + `frontend/e2e/cmd-k-compat.spec.mjs`).
      Legacy `src/ui/cmdK.ts` retains state ownership; `window.openCmdK` and
      `window.closeCmdK` remain shell entry points, while React input, key, and
      result actions use the typed `__socratesLegacy.cmdK` gateway. Redundant
      root-level `onCmdKInput` / `onCmdKKey` aliases have been removed;
      `src/ui/cmdK.impl.ts` publishes state to `src/ui/cmdKState.ts`, which
      React subscribes to directly. The legacy renderer is suppressed by a
      data-attribute guard so the two never collide.
- [x] Sidebar nav buttons + recents filter chips ported to React/TS
      (`frontend/src/react/sidebar/` + `frontend/e2e/sidebar-compat.spec.mjs`).
      Typed navigation/sidebar stores and services own destination state,
      route/history handling, drawer dismissal, recents filtering, and
      actions. `src/sidebar/index.js` and the old nav/recents bridges are
      removed. Workspace and scheduled page data/actions and their dialogs
      are typed; destination page adapters live in
      `src/sidebar/navigation.adapters.ts`. `src/sidebar/nav.ts` retains the
      connector OAuth return context and local icon/slash-command adapters.
      The More menu is React-owned: Zustand drives visibility, React positions
      it, and React handles Escape/outside-click dismissal and trigger state.
- [x] Composer "+" tools menu ported to React/TS
      (`frontend/src/react/composer/` +
      `frontend/e2e/composer-tools-compat.spec.mjs`). A typed Zustand store
      drives the disclosure state; React owns the menu markup, accessible
      expanded state, outside-click/Escape dismissal, and viewport listeners.
      A layout adapter measures the committed menu and applies its geometry.
      Item clicks dispatch through typed feature actions for compose/research,
      extensions, prompt templates, and attachment pickers. React also owns
      the input, attachment chips, send/stop controls, and effort trigger.
- [x] Attachment chip rows ported to React/TS
      (`frontend/src/react/attachments/` +
      `frontend/e2e/attachments-compat.spec.mjs`). The active
      `#composerAttachmentChips` row is hydrated by React; the pending
      attachment module remains the source of truth and React renders
      snapshots from `src/ui/attachmentsState.ts`. Remove and retry actions
      dispatch through the typed composer gateway. The `window.attachments`
      array alias has been removed; E2E coverage uses the file input and
      rendered chip actions.
- [x] React application shell and routing — sidebar header and footer
      ported to React/TS (`frontend/src/react/sidebar-chrome/`). The
      header (logo, new-chat button, close button) and footer (user
      avatar, name, tier badge, theme toggle, display, settings buttons)
      are rendered via `createRoot` + `render` under the always-on
      runtime. Workspace pages (library/projects/plugins), scheduled page,
      and exam page are React-owned; public shared exams use the same React
      view in read-only mode. Route and lifecycle commands remain typed
      imperative adapters around those React surfaces.
- [x] Session list and project navigation — session list (recents)
      ported to React/TS (`frontend/src/react/session-list/`). The
      `#recentsList` element is rendered via `createRoot` + `render`
      under the always-on runtime; `doRenderRecents()` in `main.js`
      publishes the session list data to
      `ui/sessionListState.ts`. Empty states, tag pills, pin
      icon, mode badges, meta line, and delete/tag buttons are all
      handled by React.
- [x] Composer input, send, and stop actions — send button content
      (`#sendBtnContent`) and start button content (`#startBtnContent`)
      are now rendered by React/TS, showing the appropriate SVG icon
      (arrow vs stop square) based on stream status. A typed Composer store
      and controller now own the single Tiptap editor, active surface, topic
      and chat drafts, extension tokens, and send/stop/reset commands. The
      React also owns the effort trigger, which derives its label from
      provider/preference state and opens the shared configuration popover.
      The tools popover is React-owned through its typed Zustand store and
      placement adapter.
- [x] Settings modal ported to React/TS (`frontend/src/react/settings/`).
      React owns the overlay and its interactive surface. Provider state and
      provider API operations now live in a typed provider store/service;
      Settings keeps modal and external-API presentation state. Provider
      snapshots expose key presence without plaintext credentials, and the
      old `window.apiConfig` and `window.renderProviderList` aliases are gone.
- [x] Display preferences popover and controls ported to React/TS
      (`frontend/src/react/sidebar-chrome/SidebarFooterActions.tsx`). React
      owns the open state, selection state, direct control handlers, dismissal,
      and measured placement. The preference module owns persistence and the
      document-level theme/background variables.
- [x] Account, library, scheduled tasks, and plugins — all migrated as
      part of the workspace/scheduled page React components
      (`frontend/src/react/pages/workspace/`, `frontend/src/react/pages/scheduled/`).
- [x] Message list, editing, regeneration, branching, and feedback
      (`frontend/src/react/message-list/` +
      `frontend/e2e/message-list-compat.spec.mjs`). React owns
      `#msgList`; `addMessage()` and the loadSession history rebuild
      push into `state.messages` and let React paint from the snapshot.
      The streaming pipeline publishes its live assistant row and status into
      the chat snapshot, so React owns the same row from the first rendered
      token through the settled commit. Toolbar callbacks dispatch to typed
      legacy actions for
      `window.editUserMessage` /
      `regenerateAssistantMessage` / `deleteUserMessage` /
      `branchFromMessage` / `sendFeedback` / `openShareModal` /
      `toggleReadAloud`. Public shared transcripts use the same message
      components in read-only mode, and recovered interrupted turns expose
      retry through the React status control.
- [x] Post-render wire hooks for tool cards and markdown (mermaid,
      viz, viz-actions, code-block expand buttons)
      re-fire from `MessageItem`'s `useEffect` after each
      `dangerouslySetInnerHTML` commit. The legacy
      `wireMsgBodyImages` helper has been retired; image preview clicks are
      handled directly by `MessageBody`. `processPendingMermaid`,
      `wireCodeBlockHeaders`, and the viz helpers are dispatched through the
      typed `__socratesLegacy.postRender` gateway. Each helper is idempotent so
      repeated React re-renders remain safe.

### Legacy DOM/window compatibility layer removal

- [x] **C2 (full)** — `buildMessageToolbar` / `stripHtmlToText` /
      `legacyCopy` already deleted (commit `223d7b4`); only comments
      referencing the migration remain in `main.ts`.
- [x] **Per-surface `data-react-rendered` guards dropped** — every
      `_reactOwnsXxx()` guard is gone (commits `40dd5d7`,
      `b2668ab`, `a0de1fc`, `ca22389`, `d63279c`, `f8d9460`,
      `2dacaa3`). The old `data-react-rendered` and
      `reactMigrationRuntime` attributes no longer occur in active
      first-party frontend source. React owns live streaming rows directly.
- [x] **`main.ts` legacy render paths collapsed** — `addMessage`,
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
      outside `react/` deleted. The first-party `.js` siblings have since
      been migrated too; no active `.js` re-export shells remain under
      `frontend/src` (commits `77394bc`, `734e5f3` and the 2026-10-30 TS
      conversion).
- [x] **C1** — trim `windowExports.ts` (removed 72 unused bindings
      that were never read via `window.*` by any external module or
      inline handler. See commit details for the full list.)
- [x] **C1'** — trim the `bridgeMainJsFunctions()` self-bridge in
      `main.ts` (the 11-line `window.switchTab / setRecentsSearch /
      toggleSidebarView / resetApp / submitChatMessage / startSession /
      signOut / showToast` set) and the 97 other inline
      `window.X = X` lines. Removed ~50 redundant bindings including
      bridgeMainJsFunctions (duplicated in bulk bridge), display/colors
      no-external-consumer bindings, api/safe/viz bindings now handled
      by windowExports.ts, and duplicate/safe-to-remove bindings from
      the bulk bridge block.
- [x] **C4** — deleted `windowExports.ts` after replacing its remaining
      callers with direct module imports or the typed legacy gateway. The
      extension action window delegates and obsolete quick-chip DOM mirror
      were removed with it; `main.ts` now imports the navigation adapters
      directly.
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
| `src/main.ts` lines | 9,902 |
| Unique `window.X` bindings in `src/windowExports.ts` | 200 |
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
`sidebar/nav.ts`, `ui/cmdK.ts`, `ui/promptTemplates.ts`,
`ui/readAloud.ts`, `ui/settings.js`, `ui/share.ts`, `ui/voiceInput.ts`,
`agent/researchAgent.ts`, `attachments/render.ts`, plus `main.js`
itself) take a real ES import instead of the `window.showToast`
indirection. The misleading `function toast(msg, ms)` wrapper in
`attachments/render.ts` (which never propagated `ms` even in the
`window.showToast` era) is gone; inlined into the new module.
`window.showToast` stays as a backward-compat alias for the React
legacy gateway and e2e mocks. Two stray debug files from the previous
batch (`frontend/console-check.tmp.mjs`,
`frontend/e2e/_debug-slow.spec.mjs`) deleted.

M5 progress (2026-09-05, batch 3): three dead `__socratesLegacy` bag
entries retired after a full-reference audit. A regex-based audit
(`scripts/archive/audit-legacy-bag.mjs`) crawled every React reader of
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
`ui/dangerConfirms.js`, `ui/promptTemplates.ts`, `sidebar/nav.ts`,
and `ui/confirm.js`; `window.renderProviderList` is still called by
`config/providers.js`. The gateway now types-correctly reports only
the entries the React tree actually consumes. Two audit scripts
(`scripts/archive/audit-window-bridges.mjs` for the `window.X =` surface and
`scripts/archive/audit-legacy-bag.mjs` for the typed legacy bag) are checked
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

M4 follow-up (2026-09-05): 30-day TTS retention sweep. The
per-message TTS persistence hook above is wired into the
existing `cleanupDb` interval. `TTS_RETENTION_DAYS` (env-tunable,
default 30) bounds how long the durable audio rows live. A
scheduled sweep is the right cost control: a 2 MB MP3 × every
assistant message × every voice/language × every user adds up.
Sweep runs every hour (existing schedule) and is unref'd so it
never keeps the process alive on its own.

M3 deferred (2026-09-05): session-scoped RAG persistence. The
existing pure `server/src/services/rag.ts` (chunkText + BM25 +
searchRagIndex, all covered by `rag.test.js`) was waiting on a
durable chunk index. A new `session_chunks` table
(`server/drizzle/0030_session_chunks.sql`, FKs `messages.id` and
`sessions.id` both ON DELETE CASCADE) holds one row per chunk
keyed by `(message_id, ordinal)` (unique). The unique key makes
re-indexing idempotent. `server/src/services/chunkIndex.ts`
exposes `indexMessageChunks`, `removeMessageChunks`,
`searchSessionChunks`, and the pure owner-check helper
`sessionOwnedBy`. Two write paths auto-index: the session-save
route (`POST /api/sessions`) hooks the index call to the
multi-row upsert's RETURNING so a re-save of an existing session
re-indexes in place, and the PATCH-regenerate path (`PATCH
/api/messages?regenerate=true`) indexes the freshly-stored
assistant row. The index write is intentionally outside the
session transaction (chunking is O(N) in text length and would
inflate the lock window for the chat hot path). A new endpoint
`POST /api/rag/search` accepts `{ sessionId, query, limit?,
minScore? }`, owner-checks the session via
`sessionOwnedBy`, runs BM25 in-memory over the session's chunks,
and returns ranked hits. Search is O(chunks_in_session); a
future work item can promote it to a persisted index or
pgvector + embedding re-ranking without changing the wire
contract. New test file `server/test/chunkIndex.test.js` covers
ownership, idempotent re-index, stale-text replacement,
whitespace clearing, cross-session isolation, and BM25 ranking.
Test pass: server 50/50 suites (was 49), frontend 323/323 unit
tests.

C5 island 1 (2026-09-05): `publishReactChatRuntime` extracted from
`frontend/src/main.ts` (10,162-line closure-bound legacy file) into
`frontend/src/ui/reactBridge.js`. This is the cross-tree
notification channel between the legacy JS pipeline and the
React tree, with 18+ callsites in main.js and zero closure
dependencies on the rest of the file — the smallest meaningful
unit that can move. main.js now imports the function from the
new module, the local definition is gone, and the callsites are
unchanged. New `frontend/test/reactBridge.test.mjs` covers the
bridge path, the CustomEvent path, the missing-bridge fallback,
a throwing subscriber (must not break the producer), and the
null-event → empty-detail contract. Test pass: frontend 328/328
unit tests (was 323, +5 for reactBridge).

Follow-up (2026-10-30): the runtime store now lives in
`frontend/src/ui/chatRuntimeStore.ts`; React hooks and legacy modules import
the same singleton. `window.__socratesReactChatBridge`, the React-only
`chatRuntime.bridge.ts` adapter file, and `createImmutableBridge`'s
`windowKey` publishing option were removed. `publishReactChatRuntime` remains
the typed application publisher and keeps the CustomEvent observation hook;
tool execution gets the publisher by dependency injection. The old e2e
fixtures and visual scripts now use module imports or the actual `addMessage`
entry point.

Vector layer (2026-09-05): pgvector embedding enrichment + hybrid
BM25+vector retrieval. Completes the vector half of the
session_chunks retrieval. A nullable `vector(1536)` column on
`session_chunks` (`server/drizzle/0031_session_chunks_embedding.sql`,
guarded `CREATE EXTENSION` so an operator without the pgvector .so
is not surprised by a hard migration failure) plus an HNSW cosine
index. `services/embedding.ts` is the OpenAI-compatible
`/embeddings` client: it reads the active row from a new
admin-managed `embedding_config` table, decrypts the AES-GCM key
(same crypto as `api_keys`), validates the response shape
defensively (exact vector count × exact dimension match, else
null → skip enrichment), and mirrors the apiKeys SSRF posture
(https-only, no private/loopback/link-local). Writing the fix
surfaced an IPv6 bracket bug in the shared guard: WHATWG URL
keeps `[::1]` in `.hostname`, so the `startsWith('fe8')` link-
local check never fired; the same fix is applied to
`routes/apiKeys.ts#isAllowedProviderUrl`. `indexMessageChunks`
now embeds the first 64 chunks of each message after the BM25
rows are written (best-effort, logged-and-swallowed, skipped
entirely when no provider is active). `searchSessionChunksHybrid`
fuses the BM25 and cosine lists with Reciprocal Rank Fusion
(k=60) so the two score scales never need calibration; the
`/api/rag/search` endpoint transparently degrades to BM25-only
when no provider is configured.

Admin backend (2026-09-05): two admin-managed config surfaces +
the modal UI. `POST /api/embedding-config` (GET list / PUT upsert /
DELETE) and `POST /api/system-models` (GET / PUT) let an operator
configure (a) the embedding provider — URL, model ID, dimensions,
key — and (b) the built-in "Beagle" system model — URL, model ID,
label, key, multimodal flag — from a UI without touching env
vars or restarting. Both routes share a fail-closed admin gate
via `ADMIN_EMAILS` (comma-separated, case-insensitive; the users
table has no role column, so the operator list is deployment
config, and a missing ADMIN_EMAILS closes the endpoints
entirely). `keyCiphertext` never leaves the server
(`SAFE_PROJECTION` with `hasKey` as a derived boolean). The SPA
side is `frontend/src/react/adminModal/` (`types.ts` +
`admin.bridge.ts` + `AdminModal.tsx` + `legacyApi.ts`), mounted
lazily via the boot registry (`#adminModalReactRoot`) and opened
via `window.openAdminModal()` from main.js. The two new backend
test files pin the route surface and the middleware ordering;
`server/test/embedding.test.js` pins the 8-case SSRF guard.
Test pass: server 53/53 suites, frontend 328/328 unit tests.

Admin console v2 (2026-09-05): dedicated /admin page with its own
password credential. The previous ADMIN_EMAILS allowlist gate is
replaced by an independent operator password: the console is no
longer coupled to a user account. `services/adminAuth.ts` issues
an HMAC-signed, stateless 8-hour session token keyed under
SESSION_SECRET (constant-time signature check; the password
check HMACs both sides before timingSafeEqual so a direct string
compare cannot leak prefix-match timing). `routes/adminAuth.ts`
exposes POST /login (authLimiter-backed, sets an httpOnly
cookie), POST /logout, GET /status (public — tells the login
form whether ADMIN_PASSWORD is provisioned), and GET /verify.
`middleware/adminAuth.ts#requireAdminSession` replaces the old
requireAuth + ADMIN_EMAILS pair on both config routes; the user
session cookie is deliberately NOT accepted — the /admin page
must be reachable without a user login, and an authenticated
user session must never silently grant admin powers.

/admin page (frontend): a main-content page
(`#adminPanel` in index.html, `AdminPage.tsx` mounted into
`#adminPanelBody` via the boot registry's
`window.__socratesMountAdmin` hook). The console is a standalone
page reached by direct URL only — it is deliberately NOT a sidebar
destination (no nav button; `SidebarNav` renders the 7 primary
destinations, `/admin` stays reachable through the legacy
`WORKSPACE_ROUTES` + `openAdmin` route handler). The page verifies the stored token on mount (sessionStorage, plus
the httpOnly cookie as the XHR fallback), renders the login
form when unauthenticated, and renders the system-model and
embedding-provider sections after sign-in. The previous
modal-based entry (`AdminModal.tsx` + `window.openAdminModal`)
stays for backward compatibility but the page is the primary
surface.

Multi-embedding-provider: `PUT /api/embedding-config` now
accepts an optional `id` — present means update the existing
row, absent means create a new row. Multiple providers can be
stored for audit / quick switch; exactly one is active (the PUT
clears every other row's flag), and the embedding service reads
the active row.

RAG context injection: the chat pipeline now opts into
session-scoped recall. `ChatPayloadSchema` gains an optional
`ragSessionId`; `appendRagContext` (routes/chat/helpers.ts)
retrieves against the session's chunk index using the last user
message as the query (owner-checked, hybrid BM25+vector, max 6
hits × 1200 chars, 8000-char total budget) and appends the hits
to the first system message as an untrusted
`[Server context: session-recall]` block — explicitly marked as
background recall, not instructions, before the
final-output-constraints step so the no-dash rule still closes
the prompt. Every failure mode (missing id, unowned session,
empty index, retrieval error, empty query) degrades to
no-injection; the chat turn never fails because RAG failed. The
SPA builder (`chat/api.js#buildChatRequestBody`) sets
`ragSessionId` from the active session id.

Admin console v3 — public-exposure hardening (2026-09-05): the
independent-password gate was reviewed against a public-internet
threat model and four gaps closed. (1) Slow hash: ADMIN_PASSWORD
is now bcrypt-hashed once (cost 12, the same BCRYPT_ROUNDS as
user passwords) and memoized — every verification is a
bcrypt.compare, so an online guess costs ~100ms+ of CPU instead
of a microsecond HMAC digest; the memo is keyed to the source
string so a rotation via env reload re-hashes on the next
attempt without a restart, and a bcrypt failure fails closed.
(2) Key separation: admin session tokens are signed under a key
derived from SESSION_SECRET with a domain-separation label
(`socrates:admin-session:v1`), never the raw user-session
secret, and the token payload now begins with a purpose segment
(`admin-session:v1.<random>.<expiry>.<hmac>`) that is itself
covered by the signature — a user-session token cannot be
replayed as an admin token. (3) IP allowlist:
`ADMIN_IP_ALLOWLIST` (comma-separated exact IPs and/or IPv4
CIDRs; IPv6 exact-string only, `::ffff:`-mapped v4 normalised)
gates the login route, the /verify check, AND every
requireAdminSession config request — a token exfiltrated from an
allowlisted machine is worthless when replayed from outside the
allowlist, and a blocked client gets an identical 403 before any
credential work so the endpoint never reveals whether
ADMIN_PASSWORD is set. Unset = allow all (documented; setting it
is recommended for public exposure). (4) Login-failure lockout:
the DB-backed `login_failures` table (services/loginLockout.ts)
is reused under the `admin-ip:<ip>` key namespace so the lockout
is process-global across cluster workers; the lockout helpers
now take an optional threshold (default 5 for user logins,
3 for admin) and the check runs BEFORE the bcrypt compare so a
locked-out attacker never gets another slow-hash attempt. The
login route also mounts a dedicated 5-attempts/15min/IP
`adminLoginLimiter` (separate budget from the shared
authLimiter), and `GET /status` now returns `ipAllowed` so a
legitimate admin behind a new office IP gets an actionable
message instead of a silent failure. Test pass: adminAuth
22/22 (was 10).

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

M5 progress (2026-09-05, batch 4): two dead admin-modal window
bridges retired. `window.openAdminModal / window.closeAdminModal`
(main.js:9888-89, left over from the modal → /admin page migration)
had zero external readers across src/, index.html, and e2e helpers
(`scripts/archive/audit-window-bridges.mjs` now reports 125/125 kept, 0
dead, down from 127 bindings). The assignments and their stale
comment are deleted; the `legacyApi.js` import stays so module
evaluation order is unchanged (batch-1 precedent), and the
underlying functions stay for AdminModal's internal use. Verified:
frontend tsc clean, vite build ok.

Deploy hardening for the admin release (2026-09-05): the release
surfaced three gaps between the repo and production, all closed
before deploy. (1) `server/drizzle/0029–0031` were never registered
in `meta/_journal.json`, so `db:migrate` silently skipped them —
all three are now registered, plus a new `0032_embedding_config`
(the `embedding_config` table previously existed only in
`db/schema.ts`, so the admin provider UI could never persist).
The full chain was verified on a scratch database (33/33 apply,
idempotent re-run, then dropped). (2) `0031`'s pgvector guard only
handled already-exists, not extension-unavailable: without the
`.so`, `CREATE EXTENSION` errored and would have failed the whole
migration. Block 1 now catches the error with RAISE NOTICE and
skips the column + index (the chunkIndex vector leg is try/caught,
so retrieval degrades to BM25-only as documented). Production got
`postgresql-16-pgvector` installed and `CREATE EXTENSION vector`
pre-created, so the `embedding` column + HNSW index landed.
(3) `deploy.sh` grew three release-matching gates: a post-migrate
schema check (`server/scripts/verify-deploy-schema.ts`, fail-closed
before the service stops), a build-time `#adminPanel` marker check
on the SPA bundle, and two health-gate probes — public
`/api/admin-auth/status` (200 + `{ configured, ipAllowed }`,
records `adminConsoleConfigured`) and a fail-closed proof that
unauthenticated `GET /api/embedding-config` returns 403. The
fixture suite (`scripts/test-deploy-flow.sh`) mirrors the new
bundle marker, the 403 expectation, and the new state keys.
Deploy result: all gates green, state file updated; the script
prints an operator action item when `ADMIN_PASSWORD` is unset
(the /admin console stays disabled until it is set).
