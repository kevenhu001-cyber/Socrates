<div align="center">

<img src="docs/assets/hero.svg" alt="Socrates — AI-powered Socratic tutor" width="100%"/>

<br/>

[![Repo visibility](https://img.shields.io/badge/visibility-private-7a6c4d?style=flat-square)](#-repository-visibility)
[![App status](https://img.shields.io/badge/app-online-d8a85b?style=flat-square)](https://app.topodrive.top/)
[![Backend](https://img.shields.io/badge/backend-TypeScript%20%2B%20Node.js-3178c6?style=flat-square&logo=typescript&logoColor=white)](server/)
[![Frontend](https://img.shields.io/badge/frontend-Vite%20SPA-f3c769?style=flat-square&logo=vite&logoColor=black)](frontend/)
[![Android](https://img.shields.io/badge/android-Kotlin%20%2B%20Compose-3DDC84?style=flat-square&logo=android&logoColor=white)](android/)
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
same repo.

<div align="center">

| Marketing landing | Pricing | About |
| --- | --- | --- |
| ![Landing](index-v2.png) | ![Pricing](pricing-v2.png) | ![About](about-v2.png) |
| `index-v2.png` | `pricing-v2.png` | `about-v2.png` |

</div>

The SPA is a Vite-bundled vanilla JS application with the Socratic
dialogue happening in the center, viz iframes inline as the model
emits them, a knowledge map sidebar on the left, and a status /
stats footer at the bottom. Production is reachable at
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
  (see [`server/src/db/schema.js`](server/src/db/schema.js)).
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

### Android

- **Kotlin + Jetpack Compose** native client in
  [`android/`](android/), sharing the same backend.
- One Gradle workflow ([`.github/workflows/build-apk.yml`](.github/workflows/build-apk.yml))
  builds debug and release APKs against a configurable
  `BASE_URL` (default `https://app.topodrive.top/`).

### Marketing & docs

- The marketing site ([`site/`](site/)) is a parallel set of static
  pages with a `base.css`, a Chinese translation in `site/zh/`,
  pricing tiers, and terms / privacy.
- The OpenAPI spec lives at [`docs/api/openapi.yaml`](docs/api/openapi.yaml).
- The `prompts/` directory ships the Socratic teacher system prompt
  verbatim.

## Architecture

The system is a single-page web app that talks to a small Node API
that fans out to an OpenAI-compatible LLM provider. The Android client
is a thin native wrapper around the same API.

```mermaid
flowchart LR
  subgraph Client["Client"]
    SPA["Web SPA<br/>(Vite + vanilla JS)"]
    APK["Android<br/>(Kotlin + Compose)"]
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
| Web SPA | Vanilla JS + opt-in React compatibility slice, Vite build | [`frontend/`](frontend/) — incremental React/TypeScript migration |
| Markdown | `marked` 4.3 + custom progressive renderer | see [Custom rendering pipeline](#-custom-rendering-pipeline) |
| Math | `katex` 0.16.9 (CDN, SRI-pinned) | display + inline modes |
| Code highlight | `highlight.js` (loaded lazily at finish time) | |
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
| Captcha | Server-issued image captcha | [`server/src/services/captcha.js`](server/src/services/captcha.js) |
| Code execution | Pyodide WASM (Python sandbox) | [`server/src/services/codeInterpreter.js`](server/src/services/codeInterpreter.js) |
| Android UI | Jetpack Compose (Material 3) | [`android/app/src/main/`](android/app/src/main/) |
| Android networking | OkHttp + Kotlinx Serialization | |
| CI | GitHub Actions: build Android APK on push to `main` | [`.github/workflows/build-apk.yml`](.github/workflows/build-apk.yml) |
| Edge | nginx reverse proxy + static file server | [deploy.sh](deploy.sh) |
| CDN deps | `cdn.jsdelivr.net` (KaTeX, marked) — all SRI-pinned | |

## Repository layout

```
Socrates/
├── frontend/               # Vite SPA (vanilla JS, modular)
│   ├── index.html
│   ├── src/
│   │   ├── main.js         # App logic (~9.8k lines)
│   │   ├── styles.css      # All CSS (~3600 lines)
│   │   ├── state.js        # Reactive state object
│   │   ├── attachments.js  # File attachment handling
│   │   └── ...
│   ├── dist/               # Built bundle (gitignored)
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
├── android/                # Kotlin / Compose client
│   ├── build.gradle.kts
│   └── app/
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
cd android
./gradlew assembleDebug                       # debug build, default API URL
./gradlew assembleRelease \
  -PBASE_URL=https://app.topodrive.top/      # release build, custom URL
```

The CI workflow at [`.github/workflows/build-apk.yml`](.github/workflows/build-apk.yml)
runs on every push to `main` and attaches the resulting APK as a workflow artefact.

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

1. Runs `vite build` in the frontend directory.
2. Copies the built `dist/` bundle to `/var/www/app.topodrive.top/`.
3. Copies the marketing site (`site/`) to `/var/www/topodrive.top/`.
4. Validates and reloads nginx.

```bash
./deploy.sh                              # build + deploy
```

For the backend, run `server/` under your process supervisor of
choice (`systemd`, `pm2`, Docker, etc.). The server is stateless
beyond PostgreSQL, so horizontal scaling is just a matter of running
more processes behind the same nginx.

The Android client is built by
[`.github/workflows/build-apk.yml`](.github/workflows/build-apk.yml);
artefacts are downloadable from the Actions tab.

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
  Gradle stack; the most common cause is a stale Android SDK
  cache after a Kotlin Compose version bump.

<div align="center">

Built with care, for learners everywhere.

[中文版说明 →](README.zh.md)

</div>
