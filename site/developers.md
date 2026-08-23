---
title: Socrates Developers — API, auth, and MCP
description: Developer portal for the Socrates API — OpenAPI spec, OAuth 2.0 + PKCE, scoped agent keys, MCP server, rate limits, and conventions.
canonical: https://topodrive.top/developers
last-updated: 2026-08-22
---

# Socrates Developers

> Build agents on Socrates: a typed OpenAPI surface, OAuth 2.0 with PKCE, scoped long-lived agent keys, an MCP server, and machine-readable discovery at predictable URLs. HTML twin: [/developers](/developers).

## Quickstart

1. **Pick an auth route.** Third-party agents use the [OAuth 2.0 authorization-code flow with PKCE](/auth.md). First-party automation mints a scoped key via `POST /api/account/agent-keys` and calls with `Authorization: Bearer ak_<keyId>.<secret>`.
2. **Read the contract.** Every public endpoint is specified in the [OpenAPI 3.0 specification](/openapi.json) — operationIds, request/response schemas, error codes, per-operation OAuth scopes.
3. **Call the API.** Base URL `https://app.topodrive.top`. Health probe: `GET /api/v2/health`. Rate-limit headers (`RateLimit-Limit / -Remaining / -Reset`) ride every response.

## Discovery index

| Resource | URL | Format |
| --- | --- | --- |
| OpenAPI specification | [/openapi.json](/openapi.json) | `application/openapi+json` |
| Authentication reference | [/auth.md](/auth.md) | `text/markdown` |
| Protected-resource metadata (RFC 9728) | [/.well-known/oauth-protected-resource](/.well-known/oauth-protected-resource) | `application/json` |
| Authorization-server metadata (RFC 8414) | [/.well-known/oauth-authorization-server](/.well-known/oauth-authorization-server) | `application/json` |
| MCP server (Streamable HTTP, read-only tools) | [app.topodrive.top/api/mcp](https://app.topodrive.top/api/mcp) | JSON-RPC 2.0 |
| MCP server card | [/.well-known/mcp/server-card.json](/.well-known/mcp/server-card.json) | `application/json` |
| A2A agent card | [/.well-known/agent-card.json](/.well-known/agent-card.json) | `application/json` |
| Agent skills index (v0.2.0) | [/.well-known/agent-skills/index.json](/.well-known/agent-skills/index.json) | `application/json` |
| Skill package | [/SKILL.md](/SKILL.md) | `text/markdown` |
| Agent plugin manifest | [/plugin.json](/plugin.json) | `application/json` |
| API catalog (RFC 9727) | [/.well-known/api-catalog](/.well-known/api-catalog) | `application/linkset+json` |
| Agent instructions | [/agents.md](/agents.md) | `text/markdown` |
| LLM navigation | [/llms.txt](/llms.txt) · [/llms-full.txt](/llms-full.txt) | `text/plain` |

## Conventions

- **Typed errors** — `{"code": "MACHINE_READABLE_CODE", "message": "…", "detail": …}` with correct status; 401 carries an RFC 6750 `WWW-Authenticate` challenge.
- **Scopes** — closed set `chat|memory|sessions|files|projects` × `read|write`; declared per operation in OpenAPI; enforced server-side.
- **Idempotency** — `Idempotency-Key: <uuid>` on writes; 24 h replay window returns the original response.
- **Rate limits** — `RateLimit-Limit/-Remaining/-Reset` on every response; `Retry-After` on 429.
- **Pagination** — `{items, cursor, hasMore}`; pass `?cursor=` until `hasMore: false`.
- **Long jobs** — bulk import returns `202 {jobId, status}`; poll `GET /api/import/:id`.
- **Versioning** — mobile contract versioned under `/api/v2/*`; deprecations signal via `Sunset` header + announcement ≥ 90 days ahead.

## Support

Email [help@addtech.site](mailto:help@addtech.site) with your `X-Request-Id` response header for exact-call tracing.
