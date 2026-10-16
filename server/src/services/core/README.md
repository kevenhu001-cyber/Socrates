# Core Services

This domain implements the fundamental infrastructure services for the Socrates platform: LLM proxy execution, user/session authentication, API credentials, async chat turn sequencing, scheduling, and token usage accounting.

## Key Modules

- `llm.ts`: External chat completion API proxy, streaming SSE pipeline, TCP/DNS dispatcher, and retry engine.
- `audit.ts`: HTTP-independent execution audit event persistence.
- `durableIdempotency.ts`: Atomic DB-only writes and restart-safe replay receipts.
- `auth.ts`: User lifecycle, session verification, guest conversion, credential issuance, and password hashing.
- `chatTurns.ts`: Detached asynchronous chat turn execution and event sequencing.
- `apiKey.ts`: Model provider configurations, key encryption/decryption, and TTFB caching.
- `agentKeys.ts`: Headless agent bearer credentials and HMAC verification.
- `adminAuth.ts`: Independent operator authentication with domain-separated session tokens.
- `loginLockout.ts`: Brute-force rate limiting and lockout state management.
- `email.ts`: Transactional email dispatcher (SMTP / transport).
- `scheduler.ts`: Background recurring task runner and cron execution engine.
- `usageTracker.ts`: Token consumption metering, provenance labeling (`provider` vs `estimate`), and aggregation.
- `planning.ts`: Structured schema-based planning prompts and validation.

## Invariants

- Forwarding shims remain at `server/src/services/<module>.ts` for backward compatibility.
- Core services, other services, lib and DB modules must not reach routes, middleware, boot, app/runtime entrypoints or client UI, including through re-export shims. `npm --prefix server run lint:boundaries` enforces this with the native TypeScript AST.
- Shared permission vocabulary and parsers live in `lib/authScopes.ts`; HTTP scope checks remain in middleware. `recordAudit` lives in core; the HTTP middleware retains its compatibility export.
- The dependency baseline is frozen at zero; `--update` never accepts new violations. Nonliteral module loading in protected dependency paths must be replaced with literal imports.
