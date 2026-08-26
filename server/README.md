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

## Unified Codex runtime

The web Chat/Tutor flow uses `/api/agent-runs` for durable workspace runs,
replayable events, approvals, artifacts, and restart recovery. The legacy
`/api/codex/*` routes remain available for compatibility. The rollout switches
are `CODEX_UNIFIED_RUNTIME`, `CODEX_BACKGROUND`, and `CODEX_MCP`; all default to
enabled when Codex itself is enabled.

MCP servers are server-owned. Set `CODEX_MCP_URL` for the Socrates discovery
server or `CODEX_MCP_SERVERS` to a JSON array/object of approved HTTPS
endpoints. Users can only toggle those catalog entries globally or per project
through `/api/agent-mcp`; credentials and arbitrary client-supplied URLs are
never passed to Codex.
