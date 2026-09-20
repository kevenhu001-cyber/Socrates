<div align="center">

<img src="docs/assets/hero.svg" alt="Socrates — AI-powered Socratic tutor" width="100%"/>

<br/>

[![App status](https://img.shields.io/badge/app-online-d8a85b?style=flat-square)](https://app.topodrive.top/)
[![Backend](https://img.shields.io/badge/backend-TypeScript%20%2B%20Node.js-3178c6?style=flat-square&logo=typescript&logoColor=white)](server/)
[![Frontend](https://img.shields.io/badge/frontend-Vite%20SPA-f3c769?style=flat-square&logo=vite&logoColor=black)](frontend/)
[![Android](https://img.shields.io/badge/android-React%20Native%20%2B%20Expo-3DDC84?style=flat-square&logo=android&logoColor=white)](mobile/)
[![Database](https://img.shields.io/badge/database-PostgreSQL%2014%2B-4169e1?style=flat-square&logo=postgresql&logoColor=white)](server/src/db/)
[![License](https://img.shields.io/badge/license-proprietary-555555?style=flat-square)](#-license)

**Socrates — AI-powered Socratic tutor**  
Streaming chat with reasoning models, interactive viz canvases, KaTeX math,
document extraction (PDF/DOCX/XLSX/PPTX/EPUB/RTF), projects & tags, agent mode,
cross-session memory, and a native Android client.

[中文版说明 →](README.zh.md) ·
[Live app](https://app.topodrive.top/) ·
[OpenAPI spec](docs/api/openapi.yaml) ·
[Android build](.github/workflows/build-apk.yml)

</div>

---

## Table of contents

- [Why Socrates](#-why-socrates)
- [Screenshots](#-screenshots)
- [Features](#-features)
- [Architecture](#-architecture)
- [Tech stack](#-tech-stack)
- [Repository layout](#-repository-layout)
- [Quick start](#-quick-start)
  - [1. Frontend (Vite SPA)](#1-frontend-vite-spa)
  - [2. Backend API server](#2-backend-api-server)
  - [3. Android client](#3-android-client)
- [Configuration](#-configuration)
- [Custom rendering pipeline](#-custom-rendering-pipeline)
- [API reference](#-api-reference)
- [Deployment](#-deployment)
- [Security model](#-security-model)
- [Repository visibility](#-repository-visibility)
- [Roadmap](#-roadmap)
- [Contributing](#-contributing)
- [License](#-license)
- [Support](#-support)

---

## Why Socrates

Most AI chat UIs are a textarea and a log. Socrates is built around a
single insight: **learning is a Socratic act, not a Q&A act.** The
shipped `prompts/teacher-mode.md` system prompt steers the model into
the role of a patient teacher who answers with examples before
definitions and uses guided questions instead of flat denials:

> 就像一位耐心温和的老师在跟你聊天。平时正常对话，不刻意教东西。
> - 对方问问题或遇到困难时，再拿出老师的引导感
> - 对方只是闲聊（比如打招呼），正常回应就好
> - 讲东西时先举例子再讲概念，用"换个角度想想"代替"你错了"
> - 偶尔用引导式提问代替直接给答案

The rest of the app is plumbing that makes the Socratic experience
feel real:

- **Streaming chat** with a custom line-by-line markdown renderer
  (see [Custom rendering pipeline](#-custom-rendering-pipeline))
  so `# Title` becomes an `<h1>` the moment the model types `# `,
  not after the model finishes its turn.
- **Reasoning models** (DeepSeek R1, QwQ, etc.) stream `<think>…</think>`
  blocks into a collapsible details; the markdown before and after
  the think block is rendered as proper HTML in the live view.
- **A notebook of viz canvases** — drop an `` ```html `` / `` ```viz `` fenced block
  into the chat and the model can ship an interactive React/HTML/SVG
  artifact, sandboxed in a same-origin iframe.
- **Document extraction** — attach PDF, DOCX, XLSX, PPTX, EPUB, or RTF
  files and the server parses them into plain text for the LLM context.
- **Projects, tags, pin, archive, share links, custom instructions,
  Cmd-K search, slash-command palette, prompt templates** — the
  operating-system features a learning app needs once you have more
  than three sessions.
- **Bring your own API key.** Socrates never charges for model usage.
  Configure OpenAI / Anthropic / MiniMax / any OpenAI-compatible
  endpoint in *Account → API keys* and the backend proxies the
  requests (so your key stays on the server, not the browser).

## Screenshots

The marketing site ([`site/`](site/)) is what the public sees; the
SPA (`frontend/`) is what learners use. Both are shipped from the
same repo. The four panels below are the live captures that
ship with the repo; any image not in `screenshot_*.png` at the
repo root is **not** referenced from `README.md` (audit 2026-09-20,
F-006).

> Capture convention: append-only `screenshot_<n>_<view>[_zh].png` at the
> repo root; PRs that update a screenshot should re-use the same filename
> when the meaning hasn't changed, and bump the index when it has.

<div align="center">

| App home (EN) | App product view |
| --- | --- |
| ![Home (EN)](screenshot_1_home.png) | ![Product (EN)](screenshot_2_product.png) |
| `screenshot_1_home.png` | `screenshot_2_product.png` |

| App home (中文) | App product view (中文) |
| --- | --- |
| ![首页 (中文)](screenshot_3_zh_home.png) | ![产品视图 (中文)](screenshot_4_zh_product.png) |
| `screenshot_3_zh_home.png` | `screenshot_4_zh_product.png` |

</div>

The SPA is a Vite-bundled **React/TypeScript** application with the Socratic
dialogue happening in the center, viz iframes inline as the model
emits them, a knowledge map sidebar on the left, and a status /
stats footer at the bottom. All user-facing surfaces are React-driven;
the legacy JS modules (`main.js` etc.) act as a state/event backbone
that React reads from through typed bridge objects
(`window.__socrates*Bridge`). A small `window.*` compatibility shim
(`windowExports.js`) and a global event delegation layer
(`src/ui/delegate.js`) support the remaining inline-handler pattern.
Production is reachable at
<https://app.topodrive.top/>; the project-local [`deploy.sh`](deploy.sh)
builds and copies the bundle into the nginx web root.

## Features

### Chat & streaming

- **Line-by-line progressive markdown.** ATX headings (`#`–`######`),
  `-` / `*` / `+` unordered lists, `1.` ordered lists, ```` ``` ```` fences,
  `>` blockquotes, `---` horizontal rules, blank-line paragraph
  breaks, and inline `**bold**` / `*italic*` / `` `code` `` /
  `[link](url)` all stream in. The renderer is purpose-built
  (see [Custom rendering pipeline](#-custom-rendering-pipeline)) —
  no flicker between raw and rendered, no escaping bugs.
- **`<think>` / `</think>` reasoning blocks.** Models that expose
  chain-of-thought get a collapsible details card; the live
  pre-think and post-think content render as proper HTML.
- **Viz / HTML fences.** Drop `` ```html `` or `` ```viz `` in the chat and the
  body becomes a sandboxed iframe (not a `<pre><code>` of raw
  HTML). Mid-stream, a loading card replaces the body so the user
  never sees raw `<div>` characters stream in.
- **KaTeX math** (display `$$…$$` and inline `$…$`) with a fallback
  to escaped text on parser failure.
- **highlight.js** for code blocks at finish time.
- **Per-message toolbar** (Copy / Edit / Delete / Regenerate /
  Thumbs) so you can redo a single turn without nuking the session.
- **Live "new reply" pill** when you've scrolled up — lets you
  jump back without forcing auto-scroll.

### Organization

- **Projects** (folders) with sidebar chips, drag-to-reorder, and
  per-project system instructions.
- **Tags** — multi-tag per session, sidebar filter, "no tag" pill.
- **Pin (sticky)** for Recents — pinned items sort to the top.
- **Archive / Trash** with 30-day retention and a Storage modal.
- **Custom instructions** (Claude-style) stored in `localStorage`
  and synced to the server.
- **Cmd-K / Ctrl-K global search** over session titles and
  content (powered by fuse.js).
- **Slash-command palette** (`/clear`, `/title`, `/regen`, etc.)
  and a **prompt templates manager** (your own reusable prompts).
- **Keyboard shortcut suite** with a cheatsheet modal.

### Backend

- **Express 5 + Drizzle ORM + PostgreSQL** with a typed schema
  (see [`server/src/db/schema.ts`](server/src/db/schema.ts)).
- **Cookie-based auth** (`sid` cookie + CSRF double-submit), with
  pending-registration email verification, captcha, and 401-replay
  handling on the client.
- **Bring-your-own-key** LLM proxy that streams from any
  OpenAI-compatible endpoint (OpenAI, Anthropic via proxy, MiniMax,
  self-hosted, etc.). The proxy never logs the API key in plaintext
  and is the only thing that talks to the upstream provider.
- **Document extraction** — server-side parsing of PDF, DOCX, XLSX,
  PPTX, EPUB, and RTF via dedicated parser modules; the extracted
  text is injected into the LLM context.
- **Web search** — parallel fan-out across MiniMax, Bing, and SearXNG
  with automatic fallback for low-latency results.
- **File / image upload** with `sharp` for thumbnail generation.
- **Public share links** (`/s/:token`) for read-only viewing of a
  single session.
- **Usage tracking** (token counters, billing dashboard) per user.
- **Cross-session memory store** that the model can write to and
  re-read.
- **Push notifications** (FCM) for new replies.
- **Team workspaces** (multi-user under one billing entity).
- **Voice transcription** endpoint for audio messages.

### Android client

- **React Native + Expo** client in [`mobile/`](mobile/), sharing the same
  backend and platform-neutral TypeScript core.
- Android's primary flows use native RN navigation and components. Complex
  editors and HTML artifacts are isolated WebView islands while they are
  being rewritten.

### Marketing & docs

- The marketing site ([`site/`](site/)) is a parallel set of static
  pages with a `base.css`, a Chinese translation in `site/zh/`,
  pricing tiers, and terms / privacy.
- The OpenAPI spec lives at [`docs/api/openapi.yaml`](docs/api/openapi.yaml).
- The `prompts/` directory ships the Socratic teacher system prompt
  verbatim.

## Architecture

The repository keeps the existing single-page web app as the regression
baseline while a React Native application talks to the same Node API and
shares protocol/session logic across Android and Web.

```mermaid
flowchart LR
  subgraph Client["Client"]
    SPA["Web SPA<br/>(React/TS + legacy JS)"]
    APK["Android / Web<br/>(React Native + Expo)"]
  end

  subgraph Edge["nginx (topodrive.top)"]
    APP["app.topodrive.top<br/>(static SPA)"]
    API["api.topodrive.top<br/>(reverse proxy)"]
  end

  subgraph Server["Backend (Node 22+ ESM)"]
    EX["Express 5"]
    AUTH["Auth + CSRF"]
    CHAT["Chat / Agent<br/>(SSE streaming)"]
    MEM["Memory / Projects / Tags / Archive"]
    FILES["Files / Uploads /<br/>Document Extraction"]
    WEB["Web Search<br/>(MiniMax+Bing+SearXNG)"]
    SHARE["Share / Public links"]
  end

  DB[("PostgreSQL<br/>(Drizzle)")]
  LLM(["OpenAI-compatible<br/>LLM provider<br/>(user's own key)"])
  FCM(["FCM push"])

  SPA -->|HTTPS| APP
  SPA -->|HTTPS SSE / REST| API
  APK -->|HTTPS| API
  API --> EX
  EX --> AUTH
  EX --> CHAT
  EX --> MEM
  EX --> FILES
  EX --> WEB
  EX --> SHARE
  AUTH --> DB
  CHAT --> DB
  CHAT -->|streaming completion| LLM
  MEM --> DB
  FILES --> DB
  WEB -->|parallel| SE["Search Engines"]
  SHARE --> DB
  EX -->|push| FCM
```

### Data flow for a single chat turn

```mermaid
sequenceDiagram
  autonumber
  participant U as User (browser)
  participant SPA as SPA
  participant API as API (Express)
  participant DB as PostgreSQL
  participant LLM as LLM provider

  U->>SPA: types message, hits Send
  SPA->>API: POST /api/chat/stream (SSE)
  API->>DB: load user, session, active API key
  API->>LLM: POST /chat/completions (stream=true)
  loop for each SSE chunk
    LLM-->>API: data: {delta}
    API-->>SPA: data: {delta}
    SPA->>SPA: append delta to bubble,<br/>re-render markdown in-place
  end
  LLM-->>API: data: [DONE]
  API->>DB: persist assistant message
  API-->>SPA: SSE end
  SPA->>SPA: final full-render pass<br/>(KaTeX, highlight.js)
```

## Tech stack

| Layer | Technology | Notes |
| --- | --- | --- |
| Web SPA | React/TypeScript + legacy JS compatibility layer, Vite build | [`frontend/`](frontend/) — ~99% migrated, all surfaces React-driven |
| Markdown | `marked` 4.3 + custom progressive renderer | see [Custom rendering pipeline](#-custom-rendering-pipeline) |
| Math | `katex` 0.16.9 (vendored, see [`frontend/src/vendor-files/katex/`](frontend/src/vendor-files/katex/)) | display + inline modes |
| Code highlight | `highlight.js` (vendored + loaded lazily at finish time) | see [`frontend/src/vendor-files/highlight.min.js`](frontend/src/vendor-files/highlight.min.js) |
| Search | `fuse.js` for the Cmd-K palette | |
| Auth | Cookie (`sid`) + CSRF double-submit | see [`server/src/middleware/auth.ts`](server/src/middleware/auth.ts) and [`server/src/middleware/csrf.ts`](server/src/middleware/csrf.ts) |
| Backend | TypeScript, Express 5, Node.js ESM | [`server/src/`](server/src/) |
| ORM | Drizzle ORM 0.40+ + `drizzle-kit` migrations | [`server/src/db/`](server/src/db/) |
| Database | PostgreSQL 14+ | `DATABASE_URL` env var |
| LLM proxy | `fetch` to any OpenAI-compatible endpoint | [`server/src/services/llm.ts`](server/src/services/llm.ts) |
| Document parsing | mammoth, SheetJS, jszip+xml2js, EPub, rtf2text | [`server/src/services/fileParsers/`](server/src/services/fileParsers/) |
| Web search | MiniMax + Bing (parallel race), SearXNG fallback | [`server/src/services/webSearch.ts`](server/src/services/webSearch.ts) |
| Image processing | `sharp` for upload thumbnails | |
| Email | `nodemailer` (SMTP) for verification, magic-link reset | |
| File upload | `multer` | |
| Code execution | Pyodide WASM (Python sandbox) | [`server/src/services/codeInterpreter.ts`](server/src/services/codeInterpreter.ts) |
| RN UI | React Native + Expo + React Navigation | [`mobile/`](mobile/) |
| RN networking/offline | TypeScript API + SSE, Android SQLite, Web storage adapter | [`mobile/src/data/`](mobile/src/data/) |
| Shared core | SSE framing, chat event routing, session pure functions | [`packages/core/`](packages/core/) |
| CI | GitHub Actions: RN checks, Web baseline, server checks, and APK | [`.github/workflows/build-apk.yml`](.github/workflows/build-apk.yml) |
| Edge | nginx reverse proxy + static file server | [deploy.sh](deploy.sh) |
| Vendored scripts | KaTeX + highlight.js + Plotly + Mermaid + ECharts (UMD under [`frontend/src/vendor-files/`](frontend/src/vendor-files/)); marked + DOMPurify + fuse.js come from npm — no CDN fallback | see [vendored-scripts-README](frontend/src/vendor-files/README.md) |

## Repository layout

```
Socrates/
├── frontend/               # Vite SPA (React/TS + legacy JS)
│   ├── index.html
│   ├── src/
│   │   ├── main.js         # State/event backbone (~930 lines)
│   │   ├── styles.css      # All CSS (~12k lines)
│   │   ├── state.js        # Reactive state object
│   │   ├── i18n.js         # I18N dictionary
│   │   ├── windowExports.js# Legacy window.* compat shim
│   │   ├── types/          # TypeScript type definitions
│   │   ├── react/          # React/TS UI layers (23 modules)
│   │   │   ├── bootstrap.tsx
│   │   │   ├── chatRuntimeStore.ts
│   │   │   ├── useChatRuntime.ts
│   │   │   ├── message-list/
│   │   │   ├── session-list/
│   │   │   ├── sidebar/
│   │   │   ├── composer/
│   │   │   ├── cmdk/
│   │   │   ├── settings/
│   │   │   ├── legacy/     # Typed bridge (gateway.ts)
│   │   │   └── ...
│   │   ├── ui/             # Legacy UI modules
│   │   │   ├── delegate.js # Global event delegation
│   │   │   └── ...
│   │   ├── render/         # Markdown renderers
│   │   ├── chat/           # Chat logic
│   │   ├── session/
│   │   ├── sidebar/
│   │   ├── storage/
│   │   ├── auth/
│   │   └── ...
│   ├── dist/               # Built bundle (gitignored)
│   ├── e2e/                # Playwright e2e tests
│   └── package.json
├── site/                   # Marketing site (topodrive.top)
│   ├── index.html
│   ├── base.css
│   └── zh/                 # Chinese translations
├── server/                 # TypeScript / Express 5 / Drizzle / PostgreSQL
│   ├── package.json
│   ├── drizzle/            # Migrations
│   └── src/
│       ├── index.js        # Stable production compatibility shim
│       ├── index.runtime.ts # Runtime entry point
│       ├── app.ts          # Express app, middleware wiring
│       ├── db/             # Drizzle schema, migrations, client
│       ├── lib/            # errors, crypto helpers
│       ├── middleware/     # auth, csrf, error
│       ├── routes/         # auth, chat, sessions, share, files, ...
│       └── services/       # llm, webSearch, fileParsers, codeInterpreter, ...
├── mobile/                 # Expo + React Native primary app
│   ├── App.tsx             # Native navigation entry point
│   ├── src/screens/        # Shared RN screens
│   └── app.json            # Expo native configuration
├── packages/
│   ├── contracts/          # API and cross-client contracts
│   └── core/               # Cross-platform SSE/session core
├── prompts/
│   └── teacher-mode.md     # The Socratic system prompt (verbatim)
├── docs/
│   ├── api/openapi.yaml    # Full REST + SSE API spec
│   └── assets/hero.svg     # README hero image
├── deploy.sh               # nginx copy + reload helper
├── README.md               # English
└── README.zh.md            # 中文
```

## Quick start

You need three things running:

1. The frontend SPA ([`frontend/`](frontend/)) — Vite dev server or built bundle.
2. The API server ([`server/`](server/)) — Node 22+, PostgreSQL 14+.
3. (Optional) An LLM provider — the user configures their own
   OpenAI-compatible key in *Account → API keys*, or the built-in
   "Beagle" provider is auto-seeded if the operator's `BEAGLE_SYSTEM_KEY`
   env var is set.

### 1. Frontend (Vite SPA)

```bash
cd frontend
npm install
npm run dev        # Dev server at http://localhost:5173
# or
npm run build      # Production build → dist/
```

### 2. Backend API server

```bash
cd server
npm install

# Configure environment
export DATABASE_URL="postgres://user:pass@localhost:5432/socrates"
export PORT=8080

# Migrate the schema
npm run db:migrate

# Run the dev server (auto-reload)
npm run dev

# Or production
npm run build
npm start
```

The server listens on `http://0.0.0.0:8080` by default.

### 3. Android client

```bash
cd mobile
npm install
npm run typecheck
npm test -- --watch=false
```

The CI workflow at [`.github/workflows/build-apk.yml`](.github/workflows/build-apk.yml)
checks RN, Web, and server compatibility, then builds a debug Android APK.
Actions rather than on a developer workstation. Trigger a debug build with
`gh workflow run build-apk.yml --ref <branch> -f build_profile=debug`; use
[`release-clients.yml`](.github/workflows/release-clients.yml) for a signed APK/AAB
and versioned Windows release.
See [`docs/plans/rn-migration.md`](docs/plans/rn-migration.md) for the phase plan and
acceptance checklist.

## Configuration

All configuration is via environment variables on the server side;
the SPA reads no config from disk (its settings live in
`localStorage`).

| Var | Required | Default | Purpose |
| --- | --- | --- | --- |
| `DATABASE_URL` | yes | — | PostgreSQL connection string |
| `PORT` | no | `8080` | HTTP listen port |
| `NODE_ENV` | no | `development` | `production` flips cookie `secure` flag and disables verbose logs |
| `COOKIE_DOMAIN` | no | auto | Set when the API and SPA are on different subdomains |
| `COOKIE_SECURE` | no | `true` in production | Force `Secure` flag on the `sid` cookie |
| `BEAGLE_SYSTEM_KEY` | no | — | If set, a built-in "Beagle" LLM provider is auto-seeded so the app works out-of-the-box for new users |
| `SMTP_HOST` / `SMTP_PORT` / `SMTP_USER` / `SMTP_PASS` / `SMTP_FROM` | no | — | Required for email verification and password reset |
| `FCM_SERVER_KEY` | no | — | Push notifications for the Android client |
| `BEAGLE_BUILT_IN.key` | no | empty | If set, the built-in provider uses this key (overrides `BEAGLE_SYSTEM_KEY`) |

The user configures their own provider at runtime in
*Account → API keys* — the backend never logs the key in plaintext,
and the browser never sees it after the user saves it (it lives
encrypted at rest in the `api_keys` table).

## Custom rendering pipeline

Socrates ships **two** markdown renderers and switches between them
based on whether the model has finished its turn:

| Renderer | Where | Used when |
| --- | --- | --- |
| `formatMsgProgressive` | [`frontend/src/main.js`](frontend/src/main.js) | Mid-stream, every animation frame. Line-by-line state machine, no `marked` dependency, handles ATX headings, lists, code fences, blockquotes, HRs, and inline `**bold**` / `*italic*` / `` `code` `` / `[link](url)`. |
| `formatMsg` | [`frontend/src/main.js`](frontend/src/main.js) | At `finish()` time, when the user re-opens a saved message, or when copying/exporting. Full pipeline: `marked` + KaTeX + highlight.js + viz iframe + think-block handling. |

The key design rules:

- **Block elements appear the instant the opener lands.** `# ` →
  `<h1>` on the same frame the space is typed.
- **`<think>…</think>` slices render as HTML too.** Pre-think content
  goes into a `<div class="think-prefix">`, post-think content into
  `<div class="think-suffix">`. The think block itself uses the full
  `formatMsg` path so its inline code, math, and links all work.
- **Chat-template artifacts are stripped at the frame level.**
  Some reasoning models leak `<|im_start|>…<|im_end|>` or `[INST]…[/INST]`
  into the stream; `stripChatArtifacts(t)` runs once per render so
  the user never sees them flicker by.
- **Escaping uses nonce placeholders** — the naive "escape → markup → restore"
  pattern breaks when user text contains the literal string `<code>`.

## API reference

The full REST + SSE spec lives at
[`docs/api/openapi.yaml`](docs/api/openapi.yaml) (OpenAPI 3.1). The
short version of the chat streaming surface:

```http
POST /api/chat/stream
Cookie: sid=...
X-CSRF-Token: ...
Content-Type: application/json

{
  "sessionId": "uuid",
  "messages": [{"role": "user", "content": "Explain Bayes' theorem"}],
  "model": "gpt-4o-mini",
  "temperature": 0.7,
  "maxTokens": 4096
}
```

```http
HTTP/1.1 200 OK
Content-Type: text/event-stream

data: {"delta":"Bayes"}
data: {"delta":"' theorem"}
data: {"delta":" says..."}
data: [DONE]
```

Other notable endpoints: `/api/agent/run` (tool-using agent),
`/api/search` (Cmd-K), `/api/fetch-batch` (URL scraping),
`/api/files/extract` (document text extraction),
`/api/share/:token` (public read-only), `/api/memory/*`
(cross-session memory), `/api/usage/*` (token tracking),
`/api/agent/files/*` (agent workspace file access).

## Deployment

The included [`deploy.sh`](deploy.sh) is the canonical "ship it"
script for the production environment. It:

1. Installs lockfile-pinned dependencies for the frontend and
   backend (`npm ci --include=dev`).
2. Builds the Vite SPA (`npm run build`) and copies `dist/` into
   `/var/www/app.topodrive.top/`.
3. Compiles the TypeScript backend into an isolated candidate
   directory (`server/.dist-next.<rand>/`). Only after the build
   succeeds does the candidate get swapped into `server/dist/`;
   the previous `dist/` is preserved as `dist.previous/` for
   one-step rollback. `server/src/index.js` (the stable systemd
   shim) delegates to `dist/index.runtime.js`.
4. Builds and copies the marketing site (`site/`) into
   `/var/www/topodrive.top/`.
5. Restarts the backend via `systemctl restart socrates-api`. If
   the restart or the post-restart health check fails, the previous
   backend build is restored automatically before the script exits
   with a non-zero status — operators never have to chase a
   half-deployed binary by hand.
6. Validates the deploy gate (frontend `index.html` MD5,
   `/api/health` reachable from the local host) and writes the
   result to the state file. A failed gate keeps the previous
   known-good state recorded, and prints the exact rollback command.

```bash
./deploy.sh                              # build + deploy
```

Deployments are serialized with `flock`; a second invocation exits
immediately while another deploy owns the lock. Deployment paths and
the nginx status-site configuration can be overridden with
`FRONTEND_DIR`, `SERVER_DIR`, `APP_WEB_ROOT`, `SITE_WEB_ROOT`,
`SITE_DIR`, `STATUS_DIR`, and `NGINX_SITE_CONF`. The default values
remain production-compatible. The frontend keeps one `.previous`
snapshot and the backend keeps one `dist.previous` tree, so operators
should archive a known-good release separately when a longer rollback
window is required.

For the local frontend merge gate:

```bash
cd frontend
npm run lint
npm run test:unit
npm run build
npm run test:smoke
```

CI runs these checks serially, cancels superseded push runs, and uploads
the Playwright HTML report as the `playwright-report` artifact.

The backend runs as a systemd unit (`Restart=always`). The
server is stateless beyond PostgreSQL, so horizontal scaling is
just a matter of running more processes behind the same nginx.

The Android client is built by
[`.github/workflows/build-apk.yml`](.github/workflows/build-apk.yml).
[`.github/workflows/release-clients.yml`](.github/workflows/release-clients.yml) for
versioned releases: it verifies, signs, checksums, and attaches Android/Windows
artifacts to a GitHub Release. Google Play publishing is opt-in and requires a service
account secret. See [`docs/audits/client-release.md`](docs/audits/client-release.md) for the complete
workflow and secret contract.

## Security model

- **Auth.** Passwords hashed with bcrypt. Sessions are 64-char
  random tokens in the `sid` cookie, `HttpOnly` and `SameSite=Lax`,
  server-side expiry enforced.
- **CSRF.** Double-submit cookie pattern. The `csrf` cookie is
  read by the SPA and echoed in the `X-CSRF-Token` header; the
  middleware rejects any state-changing request whose header
  doesn't match the cookie.
- **API keys.** Stored encrypted at rest; the SPA only sees a
  masked preview (`sk-…abcd`). The proxy holds the key in memory
  only for the duration of a single request.
- **Viz iframes.** Sandboxed (`sandbox="allow-scripts"`, no
  `allow-same-origin` by default), so a model that emits malicious
  HTML can't touch the parent DOM or the user's cookies.
- **Document uploads.** Non-image files are force-downloaded via
  `Content-Disposition: attachment`; HTML/XHTML uploads are blocked
  at the multer level to prevent XSS.
- **CSP.** Recommended for production (not currently shipped in
  the static SPA; the operator is expected to set headers at the
  nginx layer).
- **Email verification.** Required before the first session can
  be created; rate-limited per IP.

## Repository visibility

This repository is **private**. The public-facing surfaces are:

- The marketing site at <https://topodrive.top/>
- The live app at <https://app.topodrive.top/>
- The Google Play listing (when published) for the Android client

If you've been granted access to this repo, please don't make
the contents public — the SPA includes the Socratic teacher
prompt verbatim, the agent-tool implementation, and the custom
rendering pipeline that we'd like to keep proprietary for now.

## Roadmap

Roughly in priority order, no dates:

- [x] **Document extraction** — PDF, DOCX, XLSX, PPTX, EPUB, RTF parsing
- [x] **Web search** — low-latency parallel search with fallback
- [x] **Memory/performance tuning** — reduced memory footprint for constrained servers
- [x] **SSE reliability** — silence watchdog, proper error events, graceful timeouts
- [ ] **Better RAG** — vector index over past sessions for smarter context retrieval
- [ ] **Workspace sharing** — real-time co-editing of sessions
- [ ] **Mobile PWA** — manifest + service worker for installability
- [ ] **Sandboxed code execution** — run Python snippets in the viz sandbox
- [ ] **Per-message cost estimate** — computed from the provider's pricing endpoint

## Contributing

This is a private repository; PRs from outside the core team
aren't currently accepted. If you have a feature request or a
bug report, please email [help@addtech.site](mailto:help@addtech.site)
or open a ticket in the internal tracker.

For core contributors:

1. Branch off `main` (`git checkout -b pX.Y/short-name`).
2. Make your change. Keep edits scoped.
3. Run the linters:
   ```bash
   cd server && npm run lint
   ```
4. Push and open a PR.
5. Merge via squash.

## License

Proprietary. All rights reserved. See [site/terms.html](site/terms.html)
for the end-user terms; the source-code licence is "internal use
only" until a public release is announced.

## Support

- **App issues** — email [help@addtech.site](mailto:help@addtech.site)
  or use the in-app *Help* entry.
- **API spec questions** — read [`docs/api/openapi.yaml`](docs/api/openapi.yaml)
  first, then ping the backend on-call.
- **Android build failures** — the CI workflow logs include the
  Expo prebuild/Gradle stack; confirm JDK 17, Android SDK, and Gradle
  dependencies are available after an Expo/RN version bump.

<div align="center">

Built with care, for learners everywhere.

[中文版说明 →](README.zh.md)

</div>
