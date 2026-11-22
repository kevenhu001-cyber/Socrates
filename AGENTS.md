# Socrates agent guide

This file is the engineering contract for anyone — human or agent — changing this repository.
`CLAUDE.md` is a symlink to it. For how the system works today read
[`docs/architecture/`](docs/architecture/README.md); for why a decision was made read
[`docs/adr/`](docs/adr/README.md). This file covers where work belongs, what must not break, and how
to verify a change.

## Task entrypoints and ownership

- `frontend/` owns the Vite SPA: chat and tutor flows, exam UI, visualization and learning cards, the
  typed state layer, and the Playwright suites. Start at `frontend/src/main.ts`, then follow the
  extracted modules under `frontend/src/`. Verify with `npm run lint`, focused
  `npm run test:one -- test/<file>.test.mjs` files, `npm run build`, and the relevant Playwright spec.
- `server/` owns the Express API, Drizzle/PostgreSQL persistence, LLM and tool execution,
  authentication, the Python sandbox and the workspace agent. The source entry is
  `server/src/index.runtime.ts`; `server/src/index.js` is only a compatibility shim for existing
  systemd units and imports `../dist/index.runtime.js`. `routes/<domain>/` owns HTTP concerns,
  `services/<domain>/` owns domain work and must not import HTTP composition, `lib/` holds neutral
  primitives. Verify with `npm run typecheck`, `npm run lint:boundaries`, and focused test files.
  - `npm test` runs `scripts/run-tests.mjs`, which spawns one Node process per test file with
    `--import dotenv/config`. DB-backed suites skip unless a test database is configured.
  - `npm run test:unit` is the one-shot runner with the same loader (`tsx` resolves the `.js` imports
    back to `.ts` source) — use it for a single file, not the whole suite.
  - `npm run test:db:memory` runs the PGlite-compatible suites with the real migrations and pgvector
    in memory; append filenames to select suites. Server CI still exercises real PostgreSQL and the
    cross-process concurrency contract.
- `apps/socrates-android/` is the standalone Kotlin + Jetpack Compose client (ADR
  [`0021`](docs/adr/0021-native-android-client.md)). It is the only other active client, talks to the
  same `/api/v2` API, and depends on `@socrates/core` through `app/build.gradle.kts`. Verify with
  `./gradlew assembleDebug testDebugUnitTest lintDebug` in that directory and
  `connectedDebugAndroidTest` on a device; preserve `/api/v2` compatibility and unknown
  session/message wire fields. Its CI lane is `native-android-build.yml`.
- `packages/` owns the shared TypeScript packages (`@socrates/core`, `@socrates/contracts`,
  `@socrates/theme`, `@socrates/ui`) consumed by `frontend/` and, for `core`, by the Android client.
  All packages must stay DOM-free (no `document`/`window`/`localStorage`/`react-dom`), enforced by
  `scripts/check-packages-dom.mjs`. They are published by path, not to npm. `frontend/` imports only
  narrow `@socrates/ui/*` subpaths — the root barrel was removed and `check-ui-entry.mjs` keeps it
  that way.
- **React DOM is the only UI stack (ADR [`0027`](docs/adr/0027-react-dom-only-retire-rn-shim.md)).**
  `packages/ui` components are plain React DOM components; the React Native conversion is retired.
  The local `packages/ui/src/react-web.tsx` shim is frozen: do not add imports, do not add RN-shaped
  props, and `check-rn-shim.mjs` holds its direct importer count shrink-only (currently 5). Migrate
  one surface at a time to DOM elements + CSS and lower the baseline; delete the shim when it reaches
  zero. Heavy editors (TipTap/tldraw/HTML-viz/Mermaid/Three.js) stay Web-only native islands, never in
  shared core. The transcript body stays server-rendered HTML; only shells, toolbars and tool rows are
  migrated.
- `site/` is the static marketing and docs site on its own vhost (EN + `site/zh/`). It is not part of
  the SPA build and has its own tests (`npm run test:site`).
- `tools-rust/` owns the Rust crates (`protocol`, `format`, `stream`, `fetch`, `wasm`). The WASM
  output is consumed by the frontend through `npm run build:wasm`; TypeScript fallbacks must keep
  working when no artifact is built.
- `prompts/` owns server-injected prompt text (`teacher-mode.md`, `learning-modes.md`,
  `code-interpreter.md`, `beagle.md`). Changing it changes model behaviour without a type error:
  verify with the affected server tests and a focused chat run.
- `chat-demo/` is the vendored upstream DeepSeek web client (`deepseek-ai/chat-demo`, MIT), kept as a
  **read-only reference sample** for chat/markdown/Mermaid/KaTeX rendering. It is not a Socrates
  component, is not built by any pipeline, and owns nothing. **Do not modify its contents** — read
  it, cite it in design notes, and port ideas by writing new code under `frontend/` or `packages/`.
  Its `package.json`, `pnpm-lock.yaml` and `.github/workflows/` are upstream artifacts; leave them
  alone.

**Retired trees — do not resurrect or document as components:** `mobile/` (removed 2026-10-12),
`capacitor/` (ADR [`0016`](docs/adr/0016-capacitor-shell-removal.md)), `open-connector/` (ADR
[`0014`](docs/adr/0014-open-connector-removal-cloud-only.md)), the Expo Universal App
`apps/socrates/` (ADR [`0025`](docs/adr/0025-remove-universal-app-spa-only-rn.md)), and the
`desktop/` web export. Their workflows were removed with them. `docs/audits/**` may still describe
them — those files are dated snapshots, not current state.

## Boundaries and risk routes

- Do not commit generated `dist/`, test reports, screenshots, secrets, or deployment state.
- Treat `frontend/src/main.ts` (it composes extracted modules, and `batchStorage.ts` must remain its
  first side-effect import), `server/src/app.ts`, `server/src/boot/`, auth, migrations and
  `deploy.sh` as high-churn or high-impact surfaces. Prefer extracted modules and add focused
  regression coverage. Keep `e2e/storage-bootstrap.spec.mjs` as the import-order contract when
  editing the frontend entrypoint.
- Other files that warrant the same caution: `frontend/src/styles/legacy/` (the old `styles.css`
  monolith split into order-sensitive slices; cascade order is defined by `styles/index.css` →
  `legacy/index.css`), `frontend/src/i18n/index.ts` (locale tables live in `frontend/src/i18n/{en,zh}.ts`),
  `frontend/src/chat/turn/` (the streaming-turn core), and `frontend/src/render/{markdown.ts,viz.ts}`.
- **CSS contract.** `frontend/src/styles/themes.css` is imported exactly once and last; it is the sole
  active palette plus the bridge for `--cg-*`, `--chatgpt-*`, `--conversation-*` and legacy HSL
  channels. `legacy/` and `restore/` are compatibility geometry only. Current desktop surface owners
  are `parity/{sidebar,topbar,composer-unified,transcript}.css`, with scoped auxiliaries enforced by
  `npm run lint:surface-css`; never add a competing palette or a second desktop owner to
  compatibility CSS.
- **Control sizing.** `tokens.css` declares `--ui-control-sm/md/touch` = 32/40/44 px, but the shipped
  desktop density is 36 px (topbar `#topModelSwitcher`/`#findBtn`, Library toolbar, directory tabs)
  and the search pill is 42 px; `polish/buttons.css`'s `.btn`/`.btn-icon` grammar is barely used in
  markup. Mobile is a **separate, reference-pinned density** — `polish/mobile-directories.css`
  (36 px search, 40 px tabs) is asserted by `e2e/reference-ui-visual.spec.mjs` against
  `docs/ref/mobile-reference-2026-10-04.md`; do not align mobile to desktop. Pick the ladder rung that
  matches the surface, and `npm run lint:button-sizes` blocks new literal off-ladder heights.
- `deploy.sh` must remain single-writer, preserve `dist.previous`, and restore the previous backend
  after a failed restart or health gate. If you change its swap/rollback flow, test the lock,
  candidate cleanup and error-trap paths. The CI merge gate is advisory by default
  (`--require-ci` / `DEPLOY_REQUIRE_CI_CHECK=1` makes it enforcing) — keep the verdict recorded in
  `.deploy-state.json` either way.
- `.github/workflows/ci.yml` is the frontend/server merge gate: `changes` classification → `sanity`,
  `site`, `frontend`, `server`, `shared` → `gate`. Keep type checks, build, unit tests and the
  required Playwright tiers intact; preserve concurrency cancellation and failure artifacts.
  Companion workflows: `server-ci.yml` (server against real PostgreSQL), `security.yml`
  (supply-chain/SAST plus a weekly advisory gate, deliberately not path-filtered), `image.yml`
  (builds and verifies a signed OCI image; it does **not** deploy), `native-android-build.yml`, and
  `agent-tooling-ci.yml`. Coverage is measured per project over its own `src/**`: advisory on pull
  requests, blocking on `main`. Theme/contrast specs are blocking; screenshot and golden-geometry
  specs are advisory (`test:e2e:required` vs `test:e2e:visual`).
- **Brand assets — favicon is locked to `logo.png`.** `frontend/public/favicon.png` and
  `site/favicon.png` must stay byte-identical to their `logo.png` siblings (currently 2077 bytes
  each). Do not replace either favicon with a tray variant, an emoji, a service icon or a generated
  image. If the logo changes, re-copy it over `favicon.png` in the same directory; both files move
  together.
- **Site static assets are cache-busted by query string.** `site/*.css` and `site/*.js` are served
  with `cache-control: public, max-age=604800, immutable`, so a browser keeps the old bytes for a
  week unless the URL changes. Every asset the site references carries `?cb=<version>`: `chrome.css`,
  `public.css`, `fonts.css`, `chrome.js`, `motion.js` and `locale.js` take theirs from
  `scripts/sync-site-chrome.mjs` (bump the constant, then run `npm run site:sync`), while a
  stylesheet linked by hand (e.g. `inner.css`) carries its own version in the pages that link it.
  **Changing a site stylesheet without bumping its version publishes a fix nobody sees.**
- **`allowScripts` is an allow-list, not a switch.** `server/package.json` and
  `frontend/package.json` declare reviewed entries by name — never `"*"`. If a new dependency needs an
  install script, add it by name and say why in the commit. Current entries: `esbuild` (postinstall
  fetches the platform binary; without it `vite build` fails), `protobufjs` (server only, transitive
  via `@grpc/proto-loader` → `@opentelemetry/sdk-node`; its postinstall is a version-scheme advisory
  worth seeing), and `@openuidev/lang-core` (both trees; its postinstall writes
  `~/.config/openui/telemetry.json` and sends a pseudonymous install event to PostHog — set
  `DO_NOT_TRACK=1` or `OPENUI_TELEMETRY_DISABLED=1` to keep the script but suppress egress).
- **CI installs with `--ignore-scripts` where it can.** `server-ci.yml` and the Security audit jobs
  use it because a typecheck or an advisory lookup never needs an install hook. The main `ci.yml`
  jobs do not, because they build.

## Next checks

- Unsure which document describes the current system? Start at
  [`docs/architecture/README.md`](docs/architecture/README.md). `docs/audits/**` and `docs/plans/**`
  are dated snapshots; do not treat them as current reality (see
  [`docs/audits/README.md`](docs/audits/README.md)).
- Frontend behaviour/UI: build first, then run a focused Playwright spec; inspect a screenshot for
  visual work. Choose `test:e2e:smoke`, `test:e2e:regression`, `test:e2e:theme` or `test:e2e:visual`
  for one tier; `test:e2e:required` runs smoke + regression + theme.
- Server or schema: run typecheck and focused tests; document migration and rollback implications.
- Cross-client API changes: update the OpenAPI description and check `apps/socrates-android/` plus
  `packages/contracts` compatibility.
- Deployment changes: validate on a non-production dry run or with shell-level checks before touching
  web roots or services.
- Model-capability or provider-contract work: read
  [`docs/plans/2026-10-23-stability-hardening-handoff.md`](docs/plans/2026-10-23-stability-hardening-handoff.md)
  first — it carries the verification baseline, the rules for extending
  `server/src/lib/modelCapabilities.ts`, and the open backlog. Only models whose vendor
  documentation has been checked may be added to that registry.

## Architecture guards (run inside `npm run lint`)

`npm run lint` is not just `tsc` + ESLint — it ends in a chain of custom ratchets. When you add a
guard, add it to both `lint` and a `lint:<name>` script, and give it an `--update` baseline that may
only shrink.

| Guard | Enforces |
|---|---|
| `check-react-globals.mjs` | React does not read legacy `window.*` globals directly; `react/legacy/gateway.ts` is the only legacy boundary inside `src/react` (the legacy i18n globals live in `ui/legacyI18n.ts`, outside the scanned tree). No blanket `__socrates*` bridge exemption remains |
| `check-state-ownership.mjs` | React state access converges on `store/index.ts` typed hooks: no new string-keyed `stateStore.dispatch` writes. Baseline 0, shrink-only (also `lint:state-ownership`) |
| `check-state-facade.mjs` | Rejects imports of the retired `state/store.ts` facade and any `window.stateStore` access. The file was deleted, so typed hooks and bridges in `store/index.ts` are the only state API. Baseline 0, shrink-only (also `lint:state-facade`) |
| `check-button-primitive.mjs` | Raw JSX `<button>` elements under `src/react/**` (outside `src/react/ui/`) stay at or below their frozen count — counted from the TypeScript AST, so an HTML template string is not mistaken for an element. Use the shared primitives in `src/react/ui/` (also `lint:button-primitive`) |
| `check-button-sizes.mjs` | Interactive controls reach the size ladder (`--ui-control-sm` 32 / `md` 40 / `touch` 44) instead of a literal px height; off-ladder count stays at or below baseline (also `lint:button-sizes`) |
| `check-shadcn-adoption.mjs` | Shared control primitives are adopted: raw controls, unadapted primitives, compatibility controls, retained markup and legacy DOM/template controls each stay at or below their frozen per-bucket count (also `lint:shadcn`) |
| `check-react-roots.mjs` | React root creation and hydration stay in `react/lib/boot/ownedRoot.ts`; retired transcript mount globals cannot return. Includes a shrink-only baseline (also `lint:react-roots`) |
| `check-css-debt.mjs` | `!important`, hex colours, literal radii, stacked IDs and literal font sizes stay at or below their frozen counts; the cascade order in `index.html` is proved against `styles/index.css` (nested `@import`s included), and no `@import` may sit after a style rule — browsers drop those silently |
| `check-frozen-liveness.mjs` | A rule in the frozen compatibility trees (`styles/legacy/`, `styles/restore/`) whose selector names no class emitted anywhere in `frontend/src`, `frontend/test`, `frontend/e2e`, `packages/`, `server/src` or `index.html` cannot style anything. Counted per file with an all-of identity-class rule and a shrink-only baseline; generic state words (`.selected`, `.ok`, `.active`) never decide liveness (also `lint:frozen-liveness`) |
| `check-z-index.mjs` | Live sheets use the `--ui-z-*` rungs (20/30/40/80/90/200/400/1600) instead of literal `z-index` ≥ 10 (local 0–9 allowed); off-token count stays at or below baseline (also `lint:z-index`) |
| `../scripts/check-empty-catch.mjs` | Every empty `catch` in `frontend/src`, `server/src` and `packages/*/src` is either instrumented or carries a reasoned `empty-catch: intentional — …` marker; per-tree baseline may only shrink (AST-based, so strings and regexes never count). It runs from the frontend/root lint, which installs the TypeScript compiler API; the server tree is scanned from there. |
| `check-composer-css.mjs` | Exactly one owner for composer CSS: `styles/parity/composer-unified.css` |
| `check-surface-ownership.mjs` | Sidebar, topbar and transcript each have one desktop owner under `styles/parity/` |
| `check-surface-ladder.mjs` | The four-step background ladder holds for every theme discovered in `themes.css`: exactly four rungs, no pure black (unless the theme's baseline declares `blackCanvas`), role order, steps inside the 1.5%–7% band, and legacy HSL channels tracking the rungs they carry. Themes are cross-checked against the runtime `THEME_STYLES` list (also `lint:surface-ladder`) |
| `check-focus-ring.mjs` | Focus states use the `--ui-focus-shadow` double ring with a ≥3:1 outer ring; no bare visible `outline` survives, and every `!important` that clears an outline carries a forced-colors fallback (also `lint:focus-ring`) |
| `check-font-weight.mjs` | Font weights come from tokens, not literals, and the dark canvas steps medium and bold down to 450/600 (also `lint:font-weight`) |
| `check-cjk-punctuation-fonts.mjs` | Chinese punctuation keeps full-width metrics. A `@font-face` without a `unicode-range` may claim every code point, and Geist Sans carries narrow glyphs for U+3000-303F / U+FF00-FFEF. Covers `frontend/src/styles` (every face declares a range) and `site/` (a face may omit it only when it points at an explicitly subsetted file) (also `lint:cjk-punctuation-fonts`) |
| `check-prompt-dashes.mjs` | Prompt text uses a single dash convention; the baseline records deliberately exempt entries (also `lint:prompt-dashes`) |
| `check-mobile-css.mjs` | Mobile CSS stays in the mobile owner files |
| `check-i18n-locales.mjs` | `en` and `zh` carry the same key set |
| `check-e2e-artifacts.mjs` | e2e writes screenshots under `test-results/`, never to absolute paths like `/tmp` (which break on non-POSIX runners and leak across runs) |
| `check-chat-layering.mjs` | `src/chat/**` must not import `src/react/**`; `src/react/types/**` is the allowed shared contract. Baseline 0, shrink-only |
| `check-legacy-js.mjs` | No first-party `.js` / `.mjs` / `.cjs` / `.jsx` under `frontend/src` (`vendor-files/` is third-party); `allowJs` is disabled and the baseline is empty (also `lint:legacy-js`) |
| `check-orphans.mjs` | Every module under `frontend/src` has at least one inbound import from `src`, `test`, `e2e` or `scripts`. Baseline 0, shrink-only (also `lint:orphans`) |
| `check-external-hosts.mjs` | The SPA keeps every runtime byte on our own origin. Scans `index.html` + `src/**` (comments stripped, `vendor-files/**` skipped) and fails on any absolute `http(s)` host that is not allowlisted — our domains, provider base URLs shown as placeholder text, `www.w3.org` namespaces, and GeoGebra's CDN (the one remaining third-party host, lazily loaded for `math_construction` cards). Baseline empty, shrink-only (also `lint:external-hosts`) |
| `check-ui-entry.mjs` | `frontend/src` may only import narrow `@socrates/ui/*` subpaths; any import from the removed root barrel `@socrates/ui` fails with `file:line` (also `lint:ui-entry`) |
| `check-rn-shim.mjs` | `packages/ui/src` may not gain new importers of the frozen `react-web` shim. The direct-importer count is shrink-only (currently 5) and `react-native*` dependencies are rejected (also `lint:rn-shim`) |
| `../scripts/check-packages-dom.mjs` | `packages/*` stay DOM-free (no `document`/`window`/`localStorage`/`react-dom`); platform diffs live in host adapters such as `frontend/src/react/rn/` (also `lint:packages-dom`) |
| `../scripts/check-explicit-any.mjs` | Production TypeScript under `frontend/src`, `server/src` and `packages/*/src` contains no explicit `any`; baseline 0, shrink-only (also `lint:explicit-any`) |
| `../scripts/check-core-declarations.mjs` | Every hand-written `packages/core/src/*.d.ts` still describes its `.js` sibling: same exported runtime values, same parameter count and names (type-only exports are not compared). `packages/core` ships `.js` with `allowJs` off, so a drifted declaration would be believed and never checked. Shrink-only (also `lint:core-declarations`) |
| `../scripts/check-forwarding-shims.mjs` | Freezes the count of re-export-only files (`export * from './canonical.js'`) in `frontend/src` and `server/src`. New code imports the canonical module; deleting a shell lowers the baseline with `--update`. Baseline 0 (also `lint:shims`) |
| `../scripts/check-milestone-markers.mjs` | Freezes the `P_*` / `main.js` / `B6 batch` / `region N` / `Wave N` dialect that [`docs/architecture/naming.md`](docs/architecture/naming.md) forbids. New code states the invariant and links an ADR; baseline 0, shrink-only (also `lint:markers`) |
| `../scripts/check-doc-paths.mjs` | Entry docs (`README.md`, `README.zh.md`, `AGENTS.md`, `CLAUDE.md`) only link to paths that exist. `docs/audits/**` are dated snapshots and are not scanned (also `lint:docs`) |
| `../scripts/check-drizzle-drift.mjs` | Migrations and `server/drizzle/meta/*_snapshot.json` stay in sync, so `db:generate` cannot re-emit an already-applied change in non-idempotent form (also `lint:drizzle`) |
| `../scripts/gen-csp-hashes.mjs` | CSP drift gate: regenerates `ops/nginx/csp-spa.conf` and the `script-src` hashes for the two inline `index.html` scripts; lint fails when the committed artifacts drift (also `lint:csp-hashes`) |
| `../scripts/check-action-pinning.mjs` | Every third-party GitHub Action in `.github/workflows/` is pinned to a 40-hex commit SHA, never a tag — a tag is a mutable pointer an upstream owner can repoint at code that then runs with this repo's token and secrets. `scripts/pin-actions.mjs` re-pins via `git ls-remote`; baseline 0, shrink-only (also `lint:action-pinning`) |
| `../scripts/check-bundle-size.mjs` | The built SPA bundle stays under an explicit ceiling: entry JS (raw + gzip), total JS, largest single chunk, total CSS. It measures the BUILD artifact, so it runs in CI after `npm run build` rather than inside `npm run lint`; `--update` is the explicit act that raises a ceiling (also `lint:bundle`) |

Conventions these follow: a failing check prints the offending `file:line` and exits 1; a baseline
lives next to the script as `<name>.baseline.json` and can only move down; `--update` regenerates it
and prints what it dropped, so a shrinking ratchet is an explicit act.

**Formatting** is Prettier (`.prettierrc.json`, `.prettierignore`) and is part of `npm run lint` via
`lint:format`; `npm run format` writes it. Generated artifacts (`*.generated.*`,
`tokens.generated.css`, `fonts-cjk.css`, `server/src/generated`), HTML/CSP-bearing files, and
non-code surfaces (`site/`, `docs/`, `apps/`, `tools-rust/`, Markdown) are excluded so a format pass
cannot invalidate a byte-identical generator or a CSP hash.

## Incremental testing (required)

**Strict rule — no massive test suites (user directive).**
**严禁随意运行全量或大范围测试套件！**

- 严禁跑完整的 `npm run test:unit`（1400+ 测试，耗时数分钟）或大范围 Playwright 套件，长周期测试会严重拖慢开发与交付进度。
- **如果有测试需要，必须只做针对性的小测试**：仅针对本次修改涉及的具体模块运行单个测试文件（例如 `npm run test:one -- test/<specific>.test.mjs`）或单个相关 Playwright spec（如 `npx playwright test e2e/<specific>.spec.mjs`）。
- 优先保持开发迭代节奏，切勿把时间耗费在全量测试等待上。

**Testing cadence (user instruction).** Complete all planned changes in the current pass before
starting builds or tests, then run one consolidated verification pass scoped to the final diff. Do
not alternate between small implementation batches and testing each one. After a failure, fix the
issue and rerun only the affected checks. This timing rule takes precedence over any earlier
instruction to build or test during implementation.

Use the affected-test runner instead of guessing:

- `npm run test:fast` — only the test files affected by the current git changes (staged, unstaged,
  untracked).
- `node scripts/run-affected-tests.mjs --dry-run` — inspect the mapping without executing.
- `node scripts/run-affected-tests.mjs --e2e` — also include affected Playwright specs.
- `npm run test:fast -- <path>` — test specific modified files.

When running manually, map the diff to specs:

| Changed | Run |
| --- | --- |
| `frontend/src/styles*` (tokens/themes/shell CSS) | `e2e/landing-light-visual`, `e2e/chat-light-palette`, `e2e/theme-system`, `e2e/chat-workbench`, `e2e/home-customization` |
| `frontend/src/ui/sidebarResize.ts`, sidebar chrome/nav | `e2e/sidebar-resize`, `e2e/sidebar-compat`, `e2e/sidebar-nav` |
| composer (`react/composer-input`, `ui/composerTools`, `#chatInputWrap`) | `e2e/composer-*`, `e2e/chat-workbench`, `e2e/repro-input-overlap` |
| `frontend/src/chat/*`, `frontend/src/render/*` | `e2e/chat-send`, `e2e/chat-stop-resend`, `e2e/streaming-render`, `e2e/message-list-compat`, plus `test/<module>.test.mjs` |
| new module with no matching spec | the smallest relevant `test:one` file, and add a focused spec instead of relying on the full suite |

Bare `node --experimental-strip-types --test` cannot resolve the `@socrates/*` and `@/*` imports —
those packages are published by path (tsconfig `paths`, no npm entry for all of them), so per-file
runs must go through the same `tsx` loader `test:unit` uses; `test:one` is exactly that loader scoped
to the files you pass.

Run a subset with:

```bash
npx playwright test --config=playwright.config.mjs e2e/<spec>.spec.mjs --workers=1
```

If a spec or test fails, treat it as a defect to fix — do not rebuild `git stash`-clean HEAD to prove
it is "pre-existing" first. Root-cause and repair the underlying issue (stale assertion, broken
guarantee, harness bug); time saved on re-verification goes into the fix. If the failure is
environmental (DNS, snapshots regenerated only for another platform), fix the artifact or document
it, then move on. A "pre-existing" label is a comment in the change description, never a reason to
stop.
