# Core Services

This domain implements the fundamental infrastructure services for the Socrates platform: LLM proxy execution, user/session authentication, API credentials, async chat turn sequencing, scheduling, and token usage accounting.

## Key Modules

- `llm.ts`: External chat completion API proxy, streaming SSE pipeline, TCP/DNS dispatcher, and retry engine.
- `llmProtocol.ts`: Provider request shaping — thinking encoding, effort mapping, token-cap naming, and capability validation.
- `audit.ts`: HTTP-independent execution audit event persistence.
- `durableIdempotency.ts`: Atomic DB-only writes and restart-safe replay receipts.
- `auth.ts`: User lifecycle, session verification, guest conversion, credential issuance, and password hashing.
- `chatTurns.ts`: Detached asynchronous chat turn execution and event sequencing.
- `sessionPromptSnapshot.ts`: Per-session frozen system prompt — assembled once, replayed byte-identically on later turns.
- `apiKey.ts`: Model provider configurations, key encryption/decryption, and TTFB caching.
- `agentKeys.ts`: Headless agent bearer credentials and HMAC verification.
- `adminAuth.ts`: Independent operator authentication with domain-separated session tokens.
- `loginLockout.ts`: Brute-force rate limiting and lockout state management.
- `email.ts`: Transactional email dispatcher (SMTP / transport).
- `scheduler.ts`: Background recurring task runner and cron execution engine.
- `scheduledTaskLease.ts`: Fenced claim/renew leases for recurring tasks, so two workers cannot run one task.
- `researchJobs.ts`: Durable research job state, leasing, checkpoints and event log.
- `researchPipeline.ts`: Research execution pipeline (plan → search → read → report) over injected ports.
- `researchWorker.ts`: Background worker that claims research jobs and enforces the lease heartbeat.
- `researchArtifact.ts`: Research result → LaTeX report artifact rendering.
- `usageTracker.ts`: Token consumption metering, provenance labeling (`provider` vs `estimate`), and aggregation.
- `planning.ts`: Structured schema-based planning prompts and validation.

## Invariants

- The flat `server/src/services/<module>.ts` forwarding layer has been retired.
  The canonical file inside `services/core/` is the only import path, and the
  repo-wide shell count is held at zero by `scripts/check-forwarding-shims.mjs`
  — a re-export-only file fails that gate immediately.
- Core services, other services, lib and DB modules must not reach routes, middleware, boot, app/runtime entrypoints or client UI, including through a re-export. `npm --prefix server run lint:boundaries` enforces this with the native TypeScript AST.
- Shared permission vocabulary and parsers live in `lib/authScopes.ts`; HTTP scope checks remain in middleware. `recordAudit` lives in core; the HTTP middleware retains its compatibility export.
- The dependency baseline is frozen at zero; `--update` never accepts new violations. Nonliteral module loading in protected dependency paths must be replaced with literal imports.
