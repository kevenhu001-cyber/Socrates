---
title: Authentication — Socrates
description: For agents and developers who need to call the Socrates API or load the front-end with a real user identity.
canonical: https://topodrive.top/auth
last-updated: 2026-08-22
---

# Authentication — Socrates

> For agents and developers who need to call the Socrates API or load the front-end with a real user identity.

This document describes every authentication scheme the Socrates API exposes, with the exact request/response shapes, cookie and header conventions, and how an agent should authenticate. It is the canonical reference; the OpenAPI specification at [`/openapi.json`](/openapi.json) carries the machine-readable version of the same surface.

## Schemes at a glance

| Scheme | Used by | Status |
| --- | --- | --- |
| Browser session cookie `sid` | Web SPA, third-party OAuth callbacks | Live |
| Mobile bearer `ma.*` + refresh `mr.*` | Native mobile clients (Android, iOS) | Live |
| CSRF double-submit cookie + `X-CSRF-Token` | All browser state-changing routes | Live |
| GitHub OAuth 2.0 (third-party login) | Browser "Sign in with GitHub" | Live |
| OAuth 2.0 authorization code + PKCE (`at_*` tokens) | Third-party agents acting for a user | Live |
| Agent API key `ak_<keyId>.<secret>` (scoped) | Headless agents, first-party automation | Live |

## Discover — agent_auth discovery chain

The full chain is machine-traversable end to end. An agent starting from a single `401` challenge or this file can resolve every endpoint without guessing:

- **oauth-protected-resource** (RFC 9728): [`/.well-known/oauth-protected-resource`](/.well-known/oauth-protected-resource) — `resource`, `authorization_servers`, `scopes_supported`.
- **oauth-authorization-server** (RFC 8414): [`/.well-known/oauth-authorization-server`](/.well-known/oauth-authorization-server) — issuer `https://app.topodrive.top/api/oauth`, plus an `agent_auth` block.
- **agent_auth.register_uri**: `POST https://app.topodrive.top/api/oauth/register` — RFC 7591 dynamic client registration (open, rate-limited; PKCE + consent enabled by default).
- **agent_auth.revocation_uri**: `POST https://app.topodrive.top/api/oauth/revoke` — RFC 7009, kills both halves of a token pair.
- **agent_auth.identity_types_supported**: `["anonymous"]` — anonymous clients register with `oauth_client_credentials`. `identity_assertion` (id-jag / verified_email assertion types) is not issued yet; when it ships it will appear inside `identity_assertion.assertion_types_supported` here.
- **WWW-Authenticate**: every 401 from a protected resource carries `Bearer realm="socrates", resource_metadata="…", authorization_uri="…"` — the one-request discovery entry point.

## Pick a method

| You are | Use | Section |
| --- | --- | --- |
| A third-party agent acting for a user | OAuth 2.0 authorization-code + PKCE | §5 |
| First-party automation / headless worker | Scoped agent API key | §6 |
| A native mobile app | Mobile bearer `ma.*` | §2 |
| A browser user | `sid` session cookie | §1 |

## Register

Dynamic registration (RFC 7591), no human in the loop:

```
POST /api/oauth/register
{ "client_name": "my-agent",
  "redirect_uris": ["http://127.0.0.1:8910/callback"],
  "scope": "chat:read sessions:read" }

201 { "client_id": "cli_…", "client_secret": "…",   // secret shown once
      "token_endpoint_auth_method": "client_secret_basic", … }
```

## Claim

The resource owner claims the grant on the consent screen: `GET /api/oauth/authorize` renders the scope list, and the decision POST redirects the single-use `code` (10 min) to your registered `redirect_uri` with `state` and `iss` parameters. There is no out-of-band claim step; consent IS the claim.

## Use the credential

`Authorization: Bearer at_<token>` (OAuth, §5) or `Authorization: Bearer ak_<keyId>.<secret>` (agent key, §6). Scopes are enforced server-side per method; see §5 for the read/write mapping.

## Revocation

`POST /api/oauth/revoke` with client Basic auth and `token=<access or refresh>` (RFC 7009). Agent keys revoke via `POST /api/account/agent-keys/:id/revoke` (§6). Revocation is immediate.

## Errors

See §8 — typed JSON with machine-readable `code`, RFC 6750 challenges on 401/403.

## 1. Browser session cookie — `sid`

The browser loads at `https://app.topodrive.top`, the server sets an opaque HttpOnly cookie on `POST /api/auth/login`, and every subsequent same-origin request picks it up.

### Cookie attributes

| Attribute | Value |
| --- | --- |
| Name | `sid` |
| Value | 64-hex (256 bits) |
| `HttpOnly` | true |
| `Secure` | true in production |
| `SameSite` | `lax` |
| Domain (prod) | `.topodrive.top` (shared across `app.` and `topodrive.`) |
| Path | `/` |
| `Max-Age` | Session-bound (sliding; renewed on use) |

### Issue

```
POST /api/auth/login
Content-Type: application/json
X-CSRF-Token: <csrf-token>     ← matches the csrf-token cookie

{ "email": "user@example.com", "password": "••••••••" }
```

A successful response sets `Set-Cookie: sid=<64-hex>; HttpOnly; SameSite=Lax; Secure; Path=/; Domain=.topodrive.top`.

### Verify

```
GET /api/auth/me
Cookie: sid=<64-hex>
```

Returns `{ ok: true, user: { id, email, ... } }` on success or 401 on expiration.

### Expire

`DELETE /api/auth/logout` clears the `sid` cookie server-side.

### CSRF envelope

Every state-changing browser route (`POST`, `PUT`, `PATCH`, `DELETE`) requires a CSRF double-submit:

- `csrf-token` cookie — readable by front-end JS (NOT `HttpOnly`).
- `X-CSRF-Token` request header — must equal the cookie value timing-safely.

Get a fresh pair from `GET /api/auth/csrf-token`. The front-end SPA calls this on boot and on 403-retry.

A request that breaks any of the rules above — header and cookie present but mismatched; only one present without the other; or stale — returns `403 CSRF_TOKEN_MISMATCH` / `CSRF_TOKEN_PARTIAL`.

The middleware exempts the following paths so non-browser clients are not blocked:

- `/api/auth/csrf-token`, `/api/auth/oauth/github/*`
- `/api/auth/mobile/login|refresh|login-with-code|logout|oauth/exchange` (mobile flows)
- `/api/mcp` and `/api/mcp/` (Model Context Protocol clients)
- `/api/status/subscribe` / `/api/status/confirm`

## 2. Mobile bearer — `ma.<pairId>.<64-hex>`

Native mobile shells (Android, iOS) use a short-lived access token paired with a refresh token. The access token is a `ma.*` bearer; the refresh token is an `mr.*` long-lived credential.

### Issue

```
POST /api/mobile/login
Content-Type: application/json

{ "email": "user@example.com", "password": "••••••••" }
```

A successful response:

```json
{
  "accessToken": "ma.01HXYZAB...PQRSTUVW64",
  "refreshToken": "mr.01HXYZAB...PQRSTUVW64",
  "expiresIn": 900
}
```

`expiresIn` is in seconds (900 = 15 minutes).

### Use

Send the access token in the `Authorization` header:

```
GET /api/v2/mobile/bootstrap
Authorization: Bearer ma.01HXYZAB...PQRSTUVW64
```

### Refresh

```
POST /api/mobile/refresh
Authorization: Bearer mr.01HXYZAB...PQRSTUVW64
```

Returns a fresh `(accessToken, refreshToken)` pair. The refresh token rotates on every successful exchange; the previous `mr.*` is invalidated.

### Expire

The server revokes both tokens on `POST /api/mobile/logout`. A revoked refresh token returns `401` on the next refresh attempt.

## 3. GitHub OAuth 2.0 — third-party login

For browser users who choose "Sign in with GitHub".

```
GET /api/auth/oauth/github/start?returnTo=/app
```

The server redirects the browser to `https://github.com/login/oauth/authorize?...` with an HMAC-signed `state` parameter. The `returnTo` is restricted to a strict allow-list:

```
/, /app, /chat, /projects, /shares, /settings, /exam, /tutor, /account
```

GitHub redirects back to:

```
GET /api/auth/oauth/github/callback?code=...&state=...
```

On success the server sets `Set-Cookie: sid=...` and 302-redirects to `returnTo`. Native clients (mobile) receive a short-lived exchange token (`mo.*`) instead of a cookie.

The `state` is HMAC-SHA256 over base64url JSON of `{ userId, returnTo, ts }` keyed with `SESSION_SECRET`.

## 4. CSRF double-submit

Already covered in §1. The browser SPA calls `GET /api/auth/csrf-token` on boot, then sends the header on every state-changing request.

## 5. OAuth 2.0 authorization server + scoped agent keys

Shipped (Phase D). Socrates runs a first-class OAuth 2.0 authorization server so third-party agents can obtain scoped, revocable credentials without ever seeing a password or a session cookie.

- Issuer: `https://app.topodrive.top/api/oauth`
- Discovery (RFC 8414): [`/.well-known/oauth-authorization-server`](https://topodrive.top/.well-known/oauth-authorization-server)
- Flow: **authorization code + PKCE (S256 only)**, rotating refresh tokens, RFC 7009 revocation
- Scopes: `chat:read/write`, `memory:read/write`, `sessions:read/write`, `files:read/write`, `projects:read/write`

### The flow

```
1. Register your client with the operator (client_id + client_secret).
2. Send the user to:
   GET /api/oauth/authorize
       ?response_type=code&client_id=cli_…
       &redirect_uri=<registered>&scope=chat:read%20sessions:read
       &state=<csrf>&code_challenge=<S256(verifier)>&code_challenge_method=S256
3. The signed-in user sees a consent screen and clicks Allow/Deny.
4. Your redirect_uri receives ?code=…&state=…&iss=…   (single-use, 10 min)
5. Exchange it (Basic auth, PKCE verifier required):
   POST /api/oauth/token
   grant_type=authorization_code&code=…&redirect_uri=…&code_verifier=…
6. Call APIs with: Authorization: Bearer at_<token>     (60-min TTL)
7. Refresh with grant_type=refresh_token — the presented refresh token is
   single-use; every exchange rotates the pair inside a fixed 30-day window.
8. Revoke either half of a pair any time via POST /api/oauth/revoke.
```

Scope enforcement is server-side on the resource routers (`sessions`, `chat`, `memory`, `files`, `projects`): read methods demand `<resource>:read`, mutating ones `<resource>:write`. A token without the scope gets `403 INSUFFICIENT_SCOPE` plus an RFC 6750 `WWW-Authenticate: … error="insufficient_scope"` challenge.

## 6. Scoped agent API keys — `ak_<keyId>.<secret>`

For headless, first-party automation that should not need the interactive consent dance, an account holder can mint long-lived scoped keys from [the API-keys page](/api-keys):

```
POST /api/account/agent-keys        Cookie: sid=…  X-CSRF-Token: …
{ "label": "ci-runner-01",
  "scopes": ["chat:read", "memory:read"],
  "expiresAt": "2027-01-01T00:00:00Z" }          // expiresAt optional, ≤ 1 year

201 {
  "keyId": "ak_mrtxq9c2p4wnfhz6jbks",
  "credential": "ak_mrtxq9c2p4wnfhz6jbks.<43-char secret>",   // shown ONCE
  ...
}

GET  /api/account/agent-keys            → list (no credential material)
POST /api/account/agent-keys/:id/revoke → immediate, idempotent
```

Use the full credential as the bearer value:

```
Authorization: Bearer ak_<keyId>.<secret>
```

Storage invariant: only `SHA-256("<keyId>.<secret>")` is persisted; the plaintext secret exists exactly once, in the create response. Keys are subject to the same per-resource scope checks as OAuth tokens and stop authenticating immediately on revoke.

## 7. Security model — read carefully

The `sid` cookie is the only credential that rides ambient on every browser navigation. Its attributes (`HttpOnly`, `Secure`, `SameSite=Lax`) are the **primary defence** against cross-origin forgery; the CSRF double-submit is the secondary belt-and-braces layer. Do not change `sid` cookie attributes without a security review.

Bearer tokens (`ma.*`, `at_*`, `ak_*`) are explicitly supplied credentials, not ambient, so CSRF does not apply.

The OAuth consent POST cannot send custom headers from a plain HTML form, so it enforces its own hidden-field double-submit (`csrf_token` field vs cookie) inside the route; `/api/oauth/token` and `/api/oauth/revoke` authenticate with client credentials instead and skip CSRF entirely.

The server writes a structured audit row per login event and per agent-key create/revoke with the actor, scheme, IP, and user agent. The audit table is private.

## 8. Failure modes and HTTP codes

| Status | When |
| --- | --- |
| `200` | Success |
| `401` | Missing or invalid bearer, expired session |
| `401 invalid_client` | OAuth client authentication failed (token/revoke endpoints) |
| `403 CSRF_TOKEN_MISMATCH` | Header and cookie present, values differ |
| `403 CSRF_TOKEN_PARTIAL` | Exactly one of header/cookie present |
| `403 INSUFFICIENT_SCOPE` | Bearer valid but lacks the required scope (see RFC 6750 challenge) |
| `400 invalid_grant` | Authorization code expired/consumed, bad PKCE verifier, dead refresh token |
| `429` | Per-IP / per-session rate limit hit |
| `502 / 503` | Database or upstream dependency unreachable |

Every `401` from a protected resource carries `WWW-Authenticate: Bearer realm="socrates", authorization_uri="https://app.topodrive.top/api/oauth/authorize"` so agents can discover the flow programmatically.

## 9. Discovery endpoints

- OpenAPI specification: [`/openapi.json`](/openapi.json)
- API catalog (RFC 9727): [`/.well-known/api-catalog`](/.well-known/api-catalog)
- Authorization-server metadata (RFC 8414): [`/.well-known/oauth-authorization-server`](/.well-known/oauth-authorization-server)
- OAuth-Protected-Resource document (RFC 9728): [`/.well-known/oauth-protected-resource`](/.well-known/oauth-protected-resource)
- A2A agent card: [`/.well-known/agent-card.json`](/.well-known/agent-card.json)

## 10. Contact

- General questions: `help@addtech.site`
- Security disclosures: see `/.well-known/security.txt`
