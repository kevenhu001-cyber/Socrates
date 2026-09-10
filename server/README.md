# Socrates API

The backend application source has migrated from ESM JavaScript to strict
TypeScript. Existing API routes and production process supervision remain
compatible through the stable JavaScript entry shim.

## Commands

```sh
npm run dev        # tsx watch over the TypeScript source tree
npm run typecheck  # strict TypeScript check
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
- `PI_AGENT_PROVIDER` / `PI_AGENT_MODEL` / `PI_AGENT_THINKING` — optional
  fallback when the user has no active provider.
- `WORKSPACE_ROOT` — workspace directory root (falls back to the legacy
  `CODEX_WORKSPACE_ROOT`); memory/disk defaults come from
  `WORKSPACE_MAX_MEMORY_MB` and `WORKSPACE_MAX_DISK_MB`.

The legacy `/api/codex/*` and `/api/agent-mcp` routes, the Codex app-server
harness, and MCP settings management have been removed. Workspace trees written
under the old Codex root remain readable through the fallback above.
