<div align="center">

<img src="docs/assets/hero.svg" alt="Socrates — AI-powered Socratic tutor" width="100%"/>

<br/>

[![Repo visibility](https://img.shields.io/badge/visibility-private-7a6c4d?style=flat-square)](#-repository-visibility)
[![App status](https://img.shields.io/badge/app-online-d8a85b?style=flat-square)](https://app.topodrive.top/)
[![Backend](https://img.shields.io/badge/backend-Node.js%2020%20%2B%20ESM-3c873a?style=flat-square&logo=node.js&logoColor=white)](server/)
[![Frontend](https://img.shields.io/badge/frontend-single--file%20SPA-f3c769?style=flat-square&logo=html5&logoColor=black)](index.html)
[![Android](https://img.shields.io/badge/android-Kotlin%20%2B%20Compose-3DDC84?style=flat-square&logo=android&logoColor=white)](android/)
[![License](https://img.shields.io/badge/license-proprietary-555555?style=flat-square)](#-license)

**Socrates is a streaming, Socratic AI tutor.**  
It pairs an OpenAI-compatible chat model with a notebook, projects, tags,
viz canvases, KaTeX, an Android client, and a Socratic teacher prompt —
all in a single-page web app served from a static directory.

[Live app](https://app.topodrive.top/) ·
[OpenAPI spec](docs/api/openapi.yaml) ·
[Android build](.github/workflows/build-apk.yml) ·
[Issue tracker](#-support)

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
  - [1. Web SPA (static file)](#1-web-spa-static-file)
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
  the think block is rendered as proper HTML in the live view
  (no more "# Title - item 1" run-on blobs).
- **A notebook of viz canvases** — drop an `html` / `viz` fenced block
  into the chat and the model can ship an interactive React/HTML/SVG
  artifact, sandboxed in a same-origin iframe.
- **Projects, tags, pin, archive, share links, custom instructions,
  Cmd-K search, slash-command palette, prompt templates** — the
  normal operating-system features a learning app needs once you
  have more than three sessions.
- **Bring your own API key.** Socrates never charges for model usage.
  Configure OpenAI / Anthropic / MiniMax / any OpenAI-compatible
  endpoint in *Account → API keys* and the backend proxies the
  requests (so your key stays on the server, not the browser).

## Screenshots

The marketing site ([`site/`](site/)) is what the public sees; the
SPA ([`index.html`](index.html)) is what learners use. Both are
shipped from the same repo.

<div align="center">

| Marketing landing | Pricing | About |
| --- | --- | --- |
| ![Landing](index-v2.png) | ![Pricing](pricing-v2.png) | ![About](about-v2.png) |
| `index-v2.png` | `pricing-v2.png` | `about-v2.png` |

</div>

The SPA itself is a 12 000-line single HTML file (with the Socratic
dialogue happening in the center, viz iframes inline as the model
emits them, a knowledge map sidebar on the left, and a status /
stats footer at the bottom). Production is reachable at
<https://app.topodrive.top/>; the project-local [`deploy.sh`](deploy.sh)
copies the file into the nginx web root.

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
- **Viz / HTML fences.** Drop ```html or ```viz in the chat and the
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
- **REST + SSE** chat and agent endpoints.
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
    SPA["Web SPA<br/>(index.html<br/>~12k LoC)"]
    APK["Android<br/>(Kotlin + Compose)"]
  end

  subgraph Edge["nginx (topodrive.top)"]
    APP["app.topodrive.top<br/>(static SPA)"]
    API["api.topodrive.top<br/>(reverse proxy)"]
  end

  subgraph Server["Backend (Node 20+ ESM)"]
    EX["Express 5"]
    AUTH["Auth + CSRF"]
    CHAT["Chat / Agent<br/>(SSE streaming)"]
    MEM["Memory / Projects / Tags / Archive"]
    FILES["Files / Uploads"]
    SHARE["Share / Public links"]
  end

  DB[("PostgreSQL<br/>(Drizzle)")]
  LLM(["OpenAI-compatible<br/>LLM provider<br/>(user's own key)")]
  FCM(["FCM push"])

  SPA -->|HTTPS| APP
  SPA -->|HTTPS SSE / REST| API
  APK -->|HTTPS| API
  API --> EX
  EX --> AUTH
  EX --> CHAT
  EX --> MEM
  EX --> FILES
  EX --> SHARE
  AUTH --> DB
  CHAT --> DB
  CHAT -->|streaming completion| LLM
  MEM --> DB
  FILES --> DB
  SHARE --> DB
  EX -->|push| FCM
```

### Data flow for a single chat turn

```mermaid
sequenceDiagram
  autonumber
  participant U as User (browser)
  participant SPA as SPA (index.html)
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
| Web SPA | Hand-written HTML / CSS / vanilla JS in one file | [`index.html`](index.html) is the only frontend artefact. No build step. |
| Markdown | `marked` 4.3 + custom progressive renderer | see [Custom rendering pipeline](#-custom-rendering-pipeline) |
| Math | `katex` 0.16.9 (CDN, SRI-pinned) | display + inline modes |
| Code highlight | `highlight.js` (loaded lazily at finish time) | |
| Search | `fuse.js` for the Cmd-K palette | |
| Auth | Cookie (`sid`) + CSRF double-submit | see [`server/src/middleware/auth.js`](server/src/middleware/auth.js) and [`server/src/middleware/csrf.js`](server/src/middleware/csrf.js) |
| Backend | Node.js 20+, Express 5, ESM | [`server/src/`](server/src/) |
| ORM | Drizzle ORM 0.40 + `drizzle-kit` migrations | [`server/src/db/`](server/src/db/) |
| Database | PostgreSQL 14+ | `DATABASE_URL` env var |
| LLM proxy | `fetch` to any OpenAI-compatible endpoint | [`server/src/services/llm.js`](server/src/services/llm.js) |
| Image processing | `sharp` for upload thumbnails | |
| Email | `nodemailer` (SMTP) for verification, magic-link reset | |
| File upload | `multer` | |
| Captcha | Server-issued image captcha | [`server/src/services/captcha.js`](server/src/services/captcha.js) |
| Android UI | Jetpack Compose (Material 3) | [`android/app/src/main/`](android/app/src/main/) |
| Android networking | OkHttp + Kotlinx Serialization | |
| CI | GitHub Actions: build Android APK on push to `main` | [`.github/workflows/build-apk.yml`](.github/workflows/build-apk.yml) |
| Edge | nginx reverse proxy + static file server | [deploy.sh](deploy.sh) |
| CDN deps | `cdn.jsdelivr.net` (KaTeX, marked) — all SRI-pinned | |

## Repository layout

```
Socrates/
├── index.html              # The entire web SPA (~12k LoC, no build)
├── site/                   # Marketing site (topodrive.top)
│   ├── index.html
│   ├── pricing.html
│   ├── guide.html
│   ├── about.html
│   ├── contact.html
│   ├── terms.html
│   ├── privacy.html
│   ├── account.html
│   ├── api-keys.html
│   ├── profile.html
│   ├── checkout.html
│   ├── base.css
│   └── zh/                 # Chinese translations of every page
├── server/                 # Node 20+ / Express 5 / Drizzle / PostgreSQL
│   ├── package.json
│   ├── drizzle.config.js
│   ├── drizzle/            # Migrations
│   └── src/
│       ├── index.js        # entry point
│       ├── app.js          # Express app, middleware wiring
│       ├── db/             # Drizzle schema, migrations, client
│       ├── lib/            # errors, crypto helpers
│       ├── middleware/     # auth, csrf, error
│       ├── routes/         # auth, chat, sessions, share, files, ...
│       └── services/       # llm, email, captcha, search, apiKey, ...
├── android/                # Kotlin / Compose client
│   ├── build.gradle.kts
│   ├── settings.gradle.kts
│   └── app/
│       ├── build.gradle.kts
│       └── src/main/
│           ├── AndroidManifest.xml
│           ├── java/com/socrates/app/...
│           └── res/
├── prompts/
│   └── teacher-mode.md     # The Socratic system prompt
├── docs/
│   ├── api/openapi.yaml    # Full REST + SSE API spec
│   └── assets/             # README hero, etc.
├── .github/workflows/
│   └── build-apk.yml       # Android CI
├── deploy.sh               # nginx copy + reload helper
├── about-v2.png            # marketing screenshots
├── pricing-v2.png
├── index-v2.png
├── ...
├── .gitignore
└── README.md               # you are here
```

## Quick start

You need three things running:

1. The static SPA ([`index.html`](index.html)) — open it or serve
   it from nginx.
2. The API server ([`server/`](server/)) — Node 20+, PostgreSQL 14+.
3. (Optional) An LLM provider — the user configures their own
   OpenAI-compatible key in *Account → API keys*, or the build-in
   "Beagle" provider is auto-seeded if the operator's `MINIMAX_API_KEY`
   env var is set.

### 1. Web SPA (static file)

The simplest possible setup — open the file in a browser:

```bash
git clone https://github.com/kevenhu001-cyber/Socrates.git
cd Socrates
python3 -m http.server 8000
# Open http://localhost:8000/index.html
```

For production, copy the file to your nginx web root (this is what
[`deploy.sh`](deploy.sh) does):

```bash
sudo install -m 644 -o www-data -g www-data \
  index.html /var/www/app.topodrive.top/index.html
sudo nginx -s reload
```

### 2. Backend API server

```bash
cd server
npm install

# Configure environment (see Configuration below)
cp .env.example .env   # if present; otherwise set in your shell
export DATABASE_URL="postgres://user:pass@localhost:5432/socrates"
export PORT=8080

# Migrate the schema
npm run db:migrate

# Run the dev server (auto-reload on file change)
npm run dev

# Or production
npm start
```

The server listens on `http://0.0.0.0:8080` by default. The SPA
expects it at the same origin (or behind a same-domain reverse
proxy). For local development, set up a line in `/etc/hosts` or a
CORS-allowing reverse proxy.

### 3. Android client

```bash
cd android
./gradlew assembleDebug                       # debug build, default API URL
./gradlew assembleRelease \
  -PBASE_URL=https://app.topodrive.top/      # release build, custom URL
```

The CI workflow at [`.github/workflows/build-apk.yml`](.github/workflows/build-apk.yml)
runs on every push to `main` and on `workflow_dispatch`, and
attaches the resulting APK as a workflow artefact.

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
| `MINIMAX_API_KEY` | no | — | If set, a built-in "Beagle" LLM provider is auto-seeded so the app works out-of-the-box for new users |
| `SMTP_HOST` / `SMTP_PORT` / `SMTP_USER` / `SMTP_PASS` / `SMTP_FROM` | no | — | Required for email verification and password reset |
| `FCM_SERVER_KEY` | no | — | Push notifications for the Android client |
| `BEAGLE_BUILT_IN.key` | no | empty | If set, the built-in provider uses this key (overrides `MINIMAX_API_KEY` at runtime) |

The user configures their own provider at runtime in
*Account → API keys* — the backend never logs the key in plaintext,
and the browser never sees it after the user saves it (it lives
encrypted at rest in the `api_keys` table).

## Custom rendering pipeline

Socrates ships **two** markdown renderers and switches between them
based on whether the model has finished its turn:

| Renderer | Where | Used when |
| --- | --- | --- |
| `formatMsgProgressive` | [`index.html`](index.html) (function `formatMsgProgressive(t)`) | Mid-stream, every animation frame. Line-by-line state machine, no `marked` dependency, handles ATX headings, lists, code fences, blockquotes, HRs, and inline `**bold**` / `*italic*` / `` `code` `` / `[link](url)`. |
| `formatMsg` | [`index.html`](index.html) (function `formatMsg(t)`) | At `finish()` time, when the user re-opens a saved message, or when copying/exporting. Full pipeline: `marked` + KaTeX + highlight.js + viz iframe + think-block handling. |

The key design rules:

- **Block elements appear the instant the opener lands.** `# ` →
  `<h1>` on the same frame the space is typed. The user never sees
  a frame of `# Title` raw text.
- **`<think>…</think>` slices render as HTML too.** Pre-think content
  goes into a `<div class="think-prefix">`, post-think content into
  `<div class="think-suffix">`. The think block itself uses the full
  `formatMsg` path so its inline code, math, and links all work.
- **Chat-template artifacts are stripped at the frame level.**
  Some reasoning models leak `<|im_start|>…<|im_end|>` or `[INST]…[/INST]`
  into the stream; `stripChatArtifacts(t)` runs once per render so
  the user never sees them flicker by.
- **Escaping uses nonce placeholders**, not the naive
  "escape → markup → restore" pattern. The latter breaks when
  user text contains the literal string `<code>`; the former
  can't be tricked into producing a real tag.

A worked example for a DeepSeek-R1-style response that mixes a
heading, an unordered list, a think block, and inline `code`/`**bold**`:

```text
input:
  ## Step 1
  Calculate x.

  - pick A
  - pick B

  <think>
  Let me think...
  </think>

  Final answer is **42**.

mid-stream frame (lastRendered slices):
  think-prefix : "<h2>Step 1</h2><p>Calculate x.</p><ul><li>pick A</li><li>pick B</li></ul>"
  think-block  : <details class="think-block">…<p>Let me think...</p>…</details>
  think-suffix : "<p>Final answer is <strong>42</strong>.</p>"

finish() pass:
  body.innerHTML = formatMsg(full)
  // → flat HTML with all the same structures, but
  //   KaTeX, highlight.js, viz, and the full think
  //   block rendering now apply.
```

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
data: {"delta":"<|im_end|>"}            # filtered by stripChatArtifacts
data: [DONE]
```

Other notable endpoints: `/api/agent/run` (tool-using agent),
`/api/search` (Cmd-K), `/api/fetch-batch` (URL scraping),
`/api/share/:token` (public read-only), `/api/memory/*`
(cross-session memory), `/api/usage/*` (token tracking),
`/api/agent/files/*` (agent workspace file access).

## Deployment

The included [`deploy.sh`](deploy.sh) is the canonical "ship it"
script for the production environment. It:

1. Copies [`index.html`](index.html) to
   `/var/www/app.topodrive.top/index.html` (the SPA origin).
2. Copies [`site/base.css`](site/base.css) and every page in
   [`site/`](site/) (including the [`site/zh/`](site/zh/) Chinese
   translations) to `/var/www/topodrive.top/`.
3. Validates and reloads nginx.

```bash
./deploy.sh                              # deploy index.html
./deploy.sh /path/to/index.html          # deploy a different file
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
- **CSP.** Recommended for production (not currently shipped in
  the static SPA; the operator is expected to set headers at the
  nginx layer).
- **Email verification.** Required before the first session can
  be created; rate-limited per IP.

## Repository visibility

This repository is **private**. The public-facing surfaces are:

- The marketing site at <https://topodrive.top/> (served from
  the `site/` directory of an internal mirror, not from this
  repository).
- The live app at <https://app.topodrive.top/> (also served from
  a private build artefact).
- The Google Play listing (when published) for the Android client.

If you've been granted access to this repo, please don't make
the contents public — the SPA includes the Socratic teacher
prompt verbatim, the agent-tool implementation, and the custom
rendering pipeline that we'd like to keep proprietary for now.

## Roadmap

Roughly in priority order, no dates:

- [ ] **Multi-modal input.** Image / PDF attach-and-ask is
  partially implemented; voice transcription exists; we want
  a unified "drop a file" affordance in the input bar.
- [ ] **Better RAG.** Today's memory store is keyword + recent;
  a vector index over past sessions would let the model surface
  older answers when a new question is a re-phrasing.
- [ ] **Workspace sharing.** Workspaces exist (P5.5) but
  collaboration is single-user; we'd like real-time co-editing
  of a session.
- [ ] **Mobile PWA installability.** The SPA is installable on
  iOS Safari via "Add to Home Screen" but the manifest and
  service worker are still in-progress.
- [ ] **Sandboxed code execution** for the viz / agent story,
  so the model can ship a tiny Python snippet and have it
  actually run, not just render.
- [ ] **Per-message cost estimate** in the toolbar, computed
  from the provider's pricing endpoint when available.

## Contributing

This is a private repository; PRs from outside the core team
aren't currently accepted. If you have a feature request or a
bug report, please email [help@addtech.site](mailto:help@addtech.site)
or open a ticket in the internal tracker.

For core contributors:

1. Branch off `main` (`git checkout -b pX.Y/short-name`).
2. Make your change. Keep edits scoped; don't touch unrelated
   files. The SPA is one giant HTML file, so be careful with
   unrelated `index.html` churn.
3. Run the linters:
   ```bash
   cd server && npm run lint
   ```
4. Push and open a PR. The CI workflow builds the Android APK
   on every push; if your change only touches `server/` you
   can skip the APK build by labelling the PR `skip-apk`.
5. Merge via squash.

The commit message convention is `Pn.m: short summary` where
`n.m` is the milestone / phase number. Examples: `P1.4: render
think-block prefix/suffix as markdown, not raw text` (this
release), `P2.1: Projects (folders) with sidebar chips`.

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

</div>
