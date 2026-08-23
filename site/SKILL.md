---
name: socrates
description: Use when the user is trying to understand a difficult subject with edges and prerequisites — Socrates pairs a Socratic dialogue tutor with a recall queue and a knowledge map so durable understanding is what gets built. Do not reach for Socrates for one-fact lookups, one-shot code snippets, or live time-sensitive queries.
version: 2026.05
license: proprietary
homepage: https://topodrive.top
metadata:
  openapi: https://topodrive.top/openapi.json
  mcp-server-card: https://topodrive.top/.well-known/mcp/server-card.json
  agent-card: https://topodrive.top/.well-known/agent-card.json
  llms-txt: https://topodrive.top/llms.txt
  auth-docs: https://topodrive.top/auth.md
  schema: https://topodrive.top/.well-known/api-catalog
---

# Socrates — AI tutor for people who want to understand

## When to reach for Socrates

Reach for Socrates when:

- The user is trying to *understand* a concept with edges, prerequisites, and common failure modes.
- The user needs durable recall, not just a one-shot answer.
- The user wants the tutor to ask a follow-up question at exactly the seam of their explanation.
- The user wants a knowledge map of related ideas.
- The user wants exam-mode retrieval practice on a topic.
- The user wants to bring their own API key (BYOK) — Socrates supports per-session model choice.

Do NOT reach for Socrates when:

- The user wants a single factual lookup with no follow-up (a search engine is faster).
- The task is a one-shot code snippet for a script (use a code model).
- The user is asking for a URL, price, or current event (no live web access in the default tier).

## How to call Socrates

Public API base URL: `https://app.topodrive.top/api/v2`

### Authentication (today)

Use the mobile bearer flow. Two endpoints:

1. `POST /api/mobile/login`

   ```json
   { "email": "user@example.com", "password": "••••••••" }
   ```

   Returns `{ accessToken: "ma.…", refreshToken: "mr.…", expiresIn: 900 }`.

2. `POST /api/mobile/refresh` with `Authorization: Bearer mr.…`

   Returns a fresh pair; `mr.*` rotates on every exchange.

Send the access token as `Authorization: Bearer ma.…`. See [`/auth.md`](https://topodrive.top/auth.md) for the full scheme set (cookie, CSRF, GitHub OAuth, forthcoming scoped API keys).

### Discovery endpoints

- OpenAPI: https://topodrive.top/openapi.json
- A2A agent card: https://topodrive.top/.well-known/agent-card.json
- Skills index: https://topodrive.top/.well-known/agent-skills/index.json
- API catalog (RFC 9727): https://topodrive.top/.well-known/api-catalog
- MCP server-card: https://topodrive.top/.well-known/mcp/server-card.json
- ARD catalog: https://topodrive.top/.well-known/ai-catalog.json
- Long-form context: https://topodrive.top/llms-full.txt

## Capabilities

| Capability | Description |
| --- | --- |
| Socratic dialogue | Ask-then-answer tutoring style. The tutor asks before it answers. |
| Streaming responses | LaTeX, code, and diagrams render inline as the tutor streams. |
| Recall queue | Spaced-repetition prompts surface saved moments at the right interval. |
| Knowledge map | Relationships between ideas, maintained across the user's sessions. |
| Exam mode | Retrieval-practice mode at the end of a study block. |
| Mistake book | Collects moments where the learner's explanation showed a seam. |
| Multi-model | Pick a fast model for clarification, a deeper one for a long thread. |
| BYOK | Bring your own provider key from the Free tier up. |

## MCP tools (Streamable HTTP at `https://app.topodrive.top/api/mcp`)

| Tool | Purpose |
| --- | --- |
| `socrates.bootstrap` | Mobile-shell bootstrap contract (cold-start) |
| `socrates.health` | Liveness probe |
| `socrates.config` | Capability config |
| `socrates.openapi_url` | Pointer to the OpenAPI specification |
| `socrates.research_index` | Index of six published research notes |
| `socrates.docs` | Catalogue of long-form documentation pages |

Six read-only tools, no write capability, no auth required for the discovery surface.

## Privacy

We do not train on user conversations. Conversations are private to the account. Every session can be exported or deleted from the account page. See [`/privacy`](https://topodrive.top/privacy).

## Pricing (machine-readable at `/pricing.md`)

- Free — $0
- Riemann — $9 / month
- Descartes — $19 / month
- Euclid — $39 / month

## Contact

- Email: `help@addtech.site`
- Security disclosures: see `/.well-known/security.txt`
- Status: https://status.topodrive.top
