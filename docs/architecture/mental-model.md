# Mental model (start here)

This page is the shortest accurate map of the running system. It replaces
historical milestone notes in code comments; when a comment and this page
disagree, fix the comment.

## 1. Composition roots

Production currently mounts React islands into the static shell:

```text
index.html (host ids, no #root)
  └─ src/main.ts
      ├─ app/bootstrap.ts
      │   ├─ auth gate (react/auth/authGateHost.tsx)
      │   └─ react/bootstrap.tsx
      │       ├─ react/lib/boot/specs.tsx   shell mount specs
      │       ├─ react/lib/boot/registry.ts  ownership + failure recovery
      │       ├─ react/lib/boot/mountContainer.tsx  shared portal containers
      │       └─ react/lib/boot/ownedRoot.ts only createRoot/hydrateRoot owner
      └─ auth/index.ts → window.__socratesMountReactCompatibility()
                          mounts the remaining hosts after auth reveals the shell
```

The host registry is the only React boot entry. The chrome and content
containers place independent shell components in their existing host elements
through portals. Portal content has its own error boundary, and the container
releases it when the host is detached. Hydrated, independently mounted and
imperative hosts still use the same registry and `ownedRoot.ts`.

The platform-neutral Native Island inputs live in
`packages/contracts/src/nativeIsland.ts`. The SPA iframe adapter maps the
preview kind to its sandbox permissions. TipTap and the specialized
visualization adapters own their browser resources in the SPA.

## 2. One chat turn

```text
composer
  └─ chat/sendPipeline.ts
      ├─ chat/send/input.ts        capture + commit composer state
      ├─ chat/send/dispatch.ts     queue or start
      └─ chat/turn/controller.ts   askChatTurn, called through module imports
          ├─ chat/turn/loadStreamingTurn.ts  lazy streaming renderer and placeholder
          ├─ chat/turn/cancelActiveTurn.ts   explicit cancellation and local session exit
          ├─ chat/streamAttempt.ts         POST /api/chat/stream
          │   ├─ chat/streamFrameProcessor.ts
          │   └─ chat/turn/streaming.ts → chat/turn/finish*.ts
          └─ chat/detachedTurnRecovery.ts  /api/chat-turns replay
              └─ chat/turn/client.ts        durable turn + pending pointer

server
  routes/chat/index.ts           sync /api/chat
  routes/chat/stream.ts          POST /api/chat/stream
  routes/chat/prepare/request.ts prepareChatRequest
  routes/chat/pipeline/          SSE lifecycle, tools, finalisation
  routes/chat/chatTurns.ts            durable turn replay
  routes/workspace/agentRuns.ts            workspace-agent runs (separate contract)
```

The live SSE request is the primary path. Durable turns exist for reload /
connection-loss recovery; they are not a second primary transport. Agent runs
are a separate workspace feature, not a chat transport.

Stop, supersession, edit and regenerate capture the active renderer and request
handles before interrupting a bound server turn. Each renderer still guards
its own message slot, and late cleanup from an older renderer cannot clear the
new renderer's Stop control. Resend rebuilds model content from the most recent
user message and its stored attachments, then calls the turn controller.
Session exits release browser-side handles without sending the server
interrupt used by Stop. Archive and delete completions check the current
session ID before leaving its view.

## 3. State ownership

`frontend/src/store/` is the single state factory:

- `store/bridge.ts` — snapshot + reducer + RAF commit + revision.
  - `freeze: 'deep'` for domain stores.
  - `freeze: 'shallow'` for legacy module stores via `createImmutableBridge`.
- `store/createDomainStore.ts` — bridge + read-only Zustand reader.
- `store/useBridge.ts` — React `useSyncExternalStore` hooks.
- `store/index.ts` — public hooks and types.

Rules:

- Application code reads and writes through `store/index.ts`. Use the domain
  hooks in React and the typed snapshot readers and dispatch functions in
  event handlers and other imperative code.
- Browser fixtures opt in before navigation to typed snapshot reads and state
  patches. Normal application boot publishes no state global.
- Feature-local state lives next to the feature (`*.store.ts`, `ui/*State.ts`);
  it is not a second global store. If two surfaces must share it, promote it to
  `store/` with a typed domain action.

### Session history

- `frontend/src/session/loader.impl.ts` restores a session and hands older-page
  ownership to `historyPaging.ts`. The pager deduplicates requests and aborts
  outstanding work when the session changes. `historyPagingState.ts` exposes
  the small snapshot used by the transcript without importing the loader.
- `frontend/src/ui/scrollCoordinator.ts` arbitrates programmatic writes and
  records newer scroll input. `react/message-list/` owns row mounting and DOM
  measurements. Window shifts capture and restore the visible row in the same
  frame. Layout callbacks discard stale reading positions when input advances.
- `react/session-list/VirtualSessionTimeline.tsx` measures the Recents sidebar
  with one row observer per mount and updates the rendered range at row boundaries.

## 4. Server boundaries

- `routes/<domain>/` owns HTTP authentication, scope, validation and status codes.
  The domains are `auth`, `chat`, `content`, `integrations`, `knowledge`,
  `learning`, `media`, `operations`, `providers`, `sessions` and `workspace`.
  `app.ts` imports routers directly and defines the order of Express mounts
  and shared middleware. A route's directory groups it by responsibility.
- `routes/sessions/read.ts` owns its SQL projections and pagination. Session
  read DTOs live in `packages/contracts`, and the public schemas come from
  `docs/api/openapi.yaml`. Clients pass cursors back unchanged. The Android
  list requests the versioned cursor and keeps the full session detail path.
  The older-message query checks ownership in SQL, with a separate ownership
  lookup on empty results to distinguish an empty history from a missing session.
- `routes/chat/prepare/*` owns request assembly: wire schema, prompts, RAG,
  memory, client-system boundary, SSE priming, rate limits.
- `routes/chat/pipeline/*` owns one streaming turn: tool loop, SSE frames,
  finalisation.
- `services/*` owns reusable domain work; it must not import HTTP composition.
- `services/embeddings/chunkWorkerClient.ts` sends large messages to a bounded
  Worker queue before writing the RAG index. Short messages use the same pure
  chunker directly. PostgreSQL writes and embedding requests stay in the index service.
- `lib/*` is neutral primitives (errors, policy text, sanitize, prompts).

## 5. CSS ownership

Cascade order is defined only by `frontend/src/styles/index.css`:

1. `tokens.css` — geometry/type/motion tokens.
2. `legacy/` — frozen compatibility.
3. `foundations/`, `layout/`, `components/`, `features/` — canonical components.
4. `restore/` — compatibility visuals still consumed by unmigrated surfaces.
5. `parity/` — canonical desktop surface owners.
6. `polish/` — cross-surface details and interaction states.
7. `themes.css` — only active palette and legacy token bridge, imported last.

Shared foundation and UI values come from `packages/theme/src/{tokens,ui}.ts`.
`scripts/gen-ui-tokens.mjs` projects them into CSS, and the SPA build checks
that the committed projection is current. `tokens.css` owns SPA product
geometry and aliases.

Do not add a competing palette or a second owner for a surface. The guards in
`frontend/scripts/check-*.mjs` enforce the ownership that already exists.

## 6. Where new code goes

| Change | Home |
|---|---|
| New React surface | `frontend/src/react/<feature>/`, mounted by exactly one spec |
| Shared presentational component | `packages/ui/<subpath>` (DOM-free, narrow export) |
| Global state | `frontend/src/store/` domain + typed action |
| Legacy DOM action | existing module in `frontend/src/chat|ui|render`; do not add a new window bridge |
| Chat request assembly | `server/src/routes/chat/prepare/` |
| Chat turn execution | `server/src/routes/chat/pipeline/` |
| Cross-client type | `packages/contracts` (server Zod must stay equivalent) |
| HTTP route | `server/src/routes/<domain>/` thin handler |
| Domain logic | `server/src/services/<domain>/` |

## 7. Verification

- Frontend: `npm run typecheck`, focused `npm run test:one -- test/<file>.test.mjs`,
  relevant Playwright spec, `npm run build`.
- Server: `npm run typecheck`, focused `npm test` file(s).
- Database tests without a PostgreSQL service: `npm run test:db:memory` inside
  `server/`. A migrated PGlite snapshot seeds a temporary in-memory database
  per suite. The main CI job still verifies native PostgreSQL and the
  multi-process concurrency suites.
- Playwright: `test:e2e:smoke`, `test:e2e:regression`, and `test:e2e:visual`
  select one tier. `test:smoke` runs all three with the same built SPA.
- Guards: `npm run lint` (frontend chain) and root `npm run lint` for docs,
  shims, action pinning, service boundaries.
