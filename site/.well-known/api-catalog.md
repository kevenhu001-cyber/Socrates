---
title: Socrates API catalog (RFC 9727)
description: Machine-readable linkset (and its human-readable twin) advertising the Socrates service descriptions, discovery endpoints, MCP servers, auth metadata, and agent-facing resources.
canonical: https://topodrive.top/.well-known/api-catalog
last-updated: 2026-08-22
---

# Socrates API catalog (RFC 9727)

> Machine-readable twin: [/.well-known/api-catalog](/api-catalog) — `application/linkset+json`.

| Relation | Resource | Type |
| --- | --- | --- |
| service-desc | [Socrates OpenAPI specification](https://topodrive.top/openapi.json) | `application/openapi+json` |
| service-doc | [Socrates developer portal](https://topodrive.top/developers) | `text/html` |
| authorization-doc | [Socrates authentication reference](https://topodrive.top/auth.md) | `text/markdown` |
| describedby | [Socrates long-form context for LLMs](https://topodrive.top/llms-full.txt) | `text/plain` |
| describedby | [Socrates llms.txt (navigation index)](https://topodrive.top/llms.txt) | `text/plain` |
| describedby | [Socrates agent instructions](https://topodrive.top/agents.md) | `text/markdown` |
| describedby | [Socrates A2A agent card](https://topodrive.top/.well-known/agent-card.json) | `application/json` |
| describedby | [Socrates agent-skills index](https://topodrive.top/.well-known/agent-skills/index.json) | `application/json` |
| oauth-protected-resource | [Socrates OAuth 2.0 protected-resource metadata (RFC 9728)](https://topodrive.top/.well-known/oauth-protected-resource) | `application/json` |
| oauth-authorization-server | [Socrates authorization-server metadata (RFC 8414)](https://topodrive.top/.well-known/oauth-authorization-server) | `application/json` |
| mcp-server | [Socrates MCP server (Streamable HTTP)](https://app.topodrive.top/api/mcp) | `application/json` |
| describedby | [Socrates MCP server card](https://topodrive.top/.well-known/mcp/server-card.json) | `application/json` |
| health | [Socrates health probe](https://app.topodrive.top/api/v2/health) | `application/json` |
| service-doc | [Socrates mobile bootstrap contract](https://app.topodrive.top/api/v2/mobile/bootstrap) | `application/json` |
| service-desc | [Socrates NLWeb natural-language query endpoint (Microsoft NLWeb)](https://app.topodrive.top/api/nlweb/ask) | `application/json` |
| service-desc | [Socrates NLWeb SSE streaming endpoint](https://app.topodrive.top/api/nlweb/stream) | `text/event-stream` |
| mcp-server | [Socrates docs MCP server — long-form documentation corpus](https://app.topodrive.top/api/mcp/docs) | `application/json` |
| http-message-signatures-directory | [Socrates Web Bot Auth directory (RFC 9421)](https://topodrive.top/.well-known/http-message-signatures-directory) | `application/json` |
| describedby | [Socrates Agent Plugins manifest (agent-plugins.org)](https://topodrive.top/plugin.json) | `application/json` |
| describedby | [Socrates SKILL.md (skills.sh / agentskills.io)](https://topodrive.top/SKILL.md) | `text/markdown` |
| describedby | [Socrates llms.txt — developers scope](https://topodrive.top/developers/llms.txt) | `text/plain` |
| describedby | [Socrates llms.txt — API scope](https://topodrive.top/api/llms.txt) | `text/plain` |
| describedby | [Socrates llms.txt — auth scope](https://topodrive.top/auth/llms.txt) | `text/plain` |
| sitemap | [Socrates sitemap](https://topodrive.top/sitemap.xml) | `application/xml` |
