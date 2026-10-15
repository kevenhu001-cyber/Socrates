# Core Services

This domain implements the fundamental infrastructure services for the Socrates platform: LLM proxy execution, user/session authentication, API credentials, async chat turn sequencing, scheduling, and token usage accounting.

## Key Modules

- `llm.ts`: External chat completion API proxy, streaming SSE pipeline, TCP/DNS dispatcher, and retry engine.
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
- Core services must not depend on higher-level feature routes or UI components.
