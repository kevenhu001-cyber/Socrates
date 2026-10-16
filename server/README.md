# Socrates API

The backend application source has migrated from ESM JavaScript to strict
TypeScript. Existing API routes and production process supervision remain
compatible through the stable JavaScript entry shim.

## Commands

```sh
npm run dev        # tsx watch over the TypeScript source tree
npm run typecheck  # strict TypeScript check
npm run lint       # typecheck + service dependency boundary guard
npm run build      # strict check + emit into dist/
npm test           # source tests through tsx; force-exit safety enabled
npm run test:strict # source tests with no force-exit; detects leaked handles
npm start          # stable compatibility entry -> compiled runtime
```

The test commands run each test file in its own process. Strict mode does not
use Node's force-exit flag; worker-backed services close their pools explicitly
so leaked handles remain observable.

`src/index.js` is intentionally a small compatibility entry because existing
systemd installations may execute that path directly. The application runtime
is compiled to `dist/index.runtime.js`. `deploy.sh` installs the lockfile
dependencies, builds into an isolated candidate directory, preserves the
previous compiled tree, and restores it automatically if restart or health
checks fail.

## Workspace agent runtime (Pi)

The web Chat/Tutor flow and scheduled tasks use `/api/agent-runs` for durable
workspace runs, replayable events, artifacts, and restart recovery. Runs are
executed by the `pi` coding agent (`--mode json`, read/bash/edit/write tools)
inside a server-owned per-conversation workspace; the model, endpoint, and key
follow the user's active provider in Socrates, and built-in Beagle keeps its
monthly quota gate.

Configuration:

- `PI_AGENT_ENABLED` — set to `0` to disable the workspace agent tool.
- `PI_AGENT_BIN` — absolute path to the `pi` binary (auto-detected by deploy).
- `PI_AGENT_ISOLATION` — defaults to `bubblewrap`. Linux hosts need `bwrap`
  and permitted unprivileged user/PID namespaces. Isolation failures refuse
  the run; they never fall back to host execution. `none` is available only
  for explicitly trusted non-production development.
- `PI_AGENT_BWRAP_BIN` — optional absolute path to Bubblewrap.
- `PI_AGENT_PROVIDER` / `PI_AGENT_MODEL` / `PI_AGENT_THINKING` — optional
  fallback when the user has no active provider.
- `WORKSPACE_ROOT` — workspace directory root (falls back to the legacy
  `CODEX_WORKSPACE_ROOT`); memory/disk defaults come from
  `WORKSPACE_MAX_MEMORY_MB` and `WORKSPACE_MAX_DISK_MB`.

Bubblewrap exposes system runtime files read-only and binds only this turn's
workspace writable. The host home, application secrets, other workspaces and
host process tree are hidden. Each run gets a temporary home. A global npm
installation can be used through its actual CLI entry point; runtime code is
mounted read-only. Prefer the installed `.../pi-coding-agent/dist/cli.js` path
over package-manager dispatch shims that depend on a private home directory.
The optional per-run provider extension is shipped in both host and OCI builds.

This is filesystem and PID isolation, **not a complete execution-node policy**:
network remains shared for LLM access; Node heap limits are not process-tree
memory limits; periodic workspace checks detect growth but are not hard disk
quotas. Public untrusted execution additionally needs outbound filtering,
cgroup CPU/memory/PID limits and storage quotas on the execution host. A
container host must explicitly support the nested namespaces; do not use a
privileged container or disable isolation as a workaround.

Timeout, cancellation and normal completion terminate the turn's process
group; the PID namespace also removes descendants that start new sessions.

## Reliability contracts

Chat Turn creation and its initial event commit atomically. Concurrent writers
serialize event allocation on the turn row with a short transaction. SSE uses
cursor-paginated database reads for replay and a one-second live-tail poll;
local notifications reduce latency. Remote writers and missed notifications
therefore remain observable. Execution is claimed atomically before preparation
and model calls. A repeated attempt gets an SSE `CONFLICT` with a `turn_bound`
reconnect ID. Running turns send heartbeats; after 120 seconds without updates,
the recovery sweep marks them interrupted. Recovery never automatically replays
their tool effects. Retry explicitly with a new client turn ID.

Four DB-only writes now use **durable** `Idempotency-Key` receipts:
`POST /api/projects`, `POST /api/prompts`, `POST /api/scheduled-tasks`, and
`PUT /api/sessions/:id/tags`. The business write and receipt commit in one
transaction, so a pre-commit crash rolls both back and a post-commit retry can
replay on another instance. Receipts last 24 hours after commit, are scoped by
verified user + credential digest + operation/resource, and expire using the
DB clock. Object key order is ignored; array order is preserved. Invalid keys
return 400; changing credentials starts a new scope. Every replay runs current
authentication and existing route permission checks (the browser auth cache's
existing 30-second revocation window still applies). Results are historical:
replay does not re-read subsequently edited/deleted resources. Hourly cleanup
removes expired receipts; payloads above 256 KiB retain only completion markers.
The DB total receipt volume has no hard quota yet and needs storage monitoring.
Migration `0042_idempotency_receipts.sql` must run before serving this code.
Do not overlap old and new write-serving instances or reuse an old local cache
on rollback: old code cannot see durable receipts. See
[ADR 0018](../docs/adr/0018-transactional-idempotency-receipts.md).

For other endpoints the generic JSON middleware remains **process-local**. It
rejects concurrent repeats with `409 IDEMPOTENCY_IN_PROGRESS` plus `Retry-After`,
rejects key reuse with a different parsed JSON body with `409
IDEMPOTENCY_CONFLICT`, and caps response and in-flight entry counts. Cached
response data is limited to 256 KiB per response and 32 MiB in total. Oversized
successful responses retain a completion marker: repeats return `409
IDEMPOTENCY_RESULT_UNAVAILABLE` instead of repeating the write. Client
disconnects do not release a still-executing JSON handler's reservation. It is
not a cross-instance or restart-safe guarantee; remaining critical writes still need
database-backed business uniqueness. Streaming/non-JSON uploads need their own
operation-level idempotency contract.

## Deployment availability

`deploy.sh` keeps the backend running during frontend builds by default.
`STOP_BACKEND_DURING_BUILD=1` explicitly restores the legacy low-memory-host
tradeoff; build failures restart that stopped service. The final swap still
restarts the service, so this is reduced downtime rather than zero downtime.
Host dependency installation is still in place and can affect lazily loaded
modules; immutable CI artifact deployment remains the follow-up.

## Scheduled execution leases

Migration `0041_scheduled_task_leases.sql` adds the private scheduler lease
table. Both manual and automatic runs claim the same task row, renew a 90-second
lease every 20 seconds, and fence result writes with the current owner token.
Results, counters, next-run time and lease completion commit together. Native
LLM tasks can recover expired leases; workspace-agent outcomes are paused for
review instead of automatically replaying possible external effects.

`SCHEDULER_ENABLED=0` disables automatic polling, including on startup; manual
run endpoints remain available. A multi-instance upgrade must drain old
executors before enabling the lease-aware version, since old code ignores
leases. Retain the added table on rollback and reconcile pending executions.
See [ADR 0017](../docs/adr/0017-execution-claims-and-scheduler-leases.md) for
semantics, limitations and the rollout/rollback procedure.

The legacy `/api/codex/*` and `/api/agent-mcp` routes, the Codex app-server
harness, and MCP settings management have been removed. Workspace trees written
under the old Codex root remain readable through the fallback above.


## Service dependency boundary

`npm run lint:boundaries` checks all production source imports. `services/`,
`lib/`, and `db/` cannot reach routes, middleware, boot, app/runtime entrypoints,
or client UI, including through neutral intermediaries and compatibility
re-exports. Runtime imports of Express/React are also rejected; external
framework type imports remain allowed. Shared local contracts belong in `lib/`,
not route or middleware modules, even when the import is type-only.

The guard uses the existing TypeScript 7 native AST API. It checks static imports,
re-exports, literal dynamic imports, import types, CommonJS require/resolve and
createRequire aliases; tsconfig aliases resolve through the compiler. Computed
module imports in protected dependency paths fail closed. Comments and content
strings are not scanned as code. The frozen baseline starts empty; `--update`
refreshes it only after a clean scan and never adds exceptions. Both server CI
lanes run this as part of lint. Root `npm run lint:server-boundaries` runs the
same check without frontend lint. Parser/configuration failures fail the check.

The scope is dependency direction, not all service cycles or arbitrary runtime
code loading. See [ADR 0019](../docs/adr/0019-service-dependency-boundaries.md).
No runtime configuration or database migration is required for this guard.
