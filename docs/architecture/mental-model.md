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
      │       ├─ react/lib/boot/specs.tsx   35 mount specs
      │       ├─ react/lib/boot/registry.ts  ownership + failure recovery
      │       └─ react/lib/boot/ownedRoot.ts only createRoot/hydrateRoot owner
      └─ auth/index.ts → window.__socratesMountReactCompatibility()
                          mounts the remaining hosts after auth reveals the shell
```

The host registry is the only React composition root. There is no second
`#root` tree; add a new surface by adding one spec, not by building a parallel
shell.

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
  routes/chatTurns.ts            durable turn replay
  routes/agentRuns.ts            workspace-agent runs (separate contract)
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

## 4. Server boundaries

- `routes/*` owns HTTP: auth, scope, validation, status codes.
- `routes/chat/prepare/*` owns request assembly: wire schema, prompts, RAG,
  memory, client-system boundary, SSE priming, rate limits.
- `routes/chat/pipeline/*` owns one streaming turn: tool loop, SSE frames,
  finalisation.
- `services/*` owns reusable domain work; it must not import HTTP composition.
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
| HTTP route | `server/src/routes/` thin handler |
| Domain logic | `server/src/services/<domain>/` |

## 7. Verification

- Frontend: `npm run typecheck`, focused `npm run test:one -- test/<file>.test.mjs`,
  relevant Playwright spec, `npm run build`.
- Server: `npm run typecheck`, focused `npm test` file(s).
- Guards: `npm run lint` (frontend chain) and root `npm run lint` for docs,
  shims, action pinning, service boundaries.
