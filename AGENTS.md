# Socrates agent guide

## Task entrypoints and ownership

- `frontend/` owns the Vite SPA, tutor/chat flows, exam UI, visualization cards, and Playwright coverage. Start with `frontend/src/main.js`, then follow extracted modules under `frontend/src/`. Verify with `npm run lint`, `npm run test:unit`, `npm run build`, and the relevant Playwright specs.
- `server/` owns Express APIs, Drizzle/PostgreSQL persistence, LLM/tool execution, authentication, and the Python sandbox. The source entry is `server/src/index.runtime.ts`; `server/src/index.js` is only a compatibility shim that imports `../dist/index.runtime.js` for existing systemd units. Verify with `npm run typecheck` and `npm test`.
  - `npm test` runs `scripts/run-tests.mjs`, which spawns one Node process per file with `--import dotenv/config`. DB-backed suites skip unless `DATABASE_URL` is set.
  - For a one-shot local run that mirrors CI's loader (no per-file spawn, `tsx` resolving the `.js` imports back to the `.ts` source — F-016 in `docs/audits/2026-09-20-structural-review.md`): `npm run test:unit`. DB-backed suites still skip here too unless `DATABASE_URL` is set.
- `mobile/` was **retired and completely removed in commit 06eb47a4 on 2026-10-12** (previously frozen on 2026-10-06). All active multi-platform (Android, Web, iOS) development belongs to the Universal App in `apps/socrates/` + `packages/`. `frontend/` is the current visual/functional baseline until the per-module migration in `docs/plans/universal-app-migration.md` signs off.
- `apps/socrates-android/` is the explicitly user-requested **standalone Kotlin + Jetpack Compose Android client** (ADR `docs/adr/0021-native-android-client.md`), an exception to the Expo-only Android policy above. It does not resurrect `mobile/` or Capacitor, or replace the Universal App. Verify with `./gradlew assembleDebug testDebugUnitTest lintDebug` from that directory and `connectedDebugAndroidTest` on a device; preserve `/api/v2` compatibility and unknown session/message wire fields. Its independent CI lane is `native-android-build.yml`.
- `desktop/` contains **only the gitignored Expo web export** (`desktop/dist/`). It is not a source tree and owns nothing — do not commit it or document it as a component.
- `packages/` owns the shared TypeScript packages (`@socrates/core`, `@socrates/contracts`, `@socrates/api`, `@socrates/chat`, `@socrates/auth`, `@socrates/settings`, `@socrates/platform`, `@socrates/theme`, `@socrates/ui`) used by `apps/socrates/`. All packages must stay DOM-free (no `document`/`window`/`localStorage`/`react-dom`); enforced by `scripts/check-packages-dom.mjs`. Both are published by path, not by npm.
- `apps/socrates/` is the new Universal App (React Native + Expo + RN Web + Zustand + Reanimated). It ships the same `Sidebar` / `ChatMessageList` / `Composer` from `@socrates/ui` on Web + Android; heavy editors (TipTap/tldraw/HTML-viz/Mermaid/Three.js) stay in isolated `ArtifactIsland` WebViews, never in shared core. Desktop (Windows/macOS) is `*.windows.ts` / `*.macos.ts` adapters only.
- `site/` is a separate static marketing/docs site deployed to its own vhost. It is not part of the SPA build.
- `tools-rust/` owns the Rust crates (`protocol`, `format`, `stream`, `fetch`, `wasm`). The WASM output is consumed by the frontend via `npm run build:wasm`.
- `open-connector/` **was removed on 2026-09-26** (ADR `docs/adr/0014-open-connector-removal-cloud-only.md`). The vendored `oomol-lab/OpenConnector` fork and its localhost sidecar (`openConnectorSidecar.ts`, `OC_SIDECAR_*` envs, `scripts/gen-oc-cloud-auth.mjs`) are gone; Socrates reaches every OpenConnector app through the OOMOL-hosted runtime (`@oomol-lab/connector` + `OOMOL_PROJECT_API_KEY`). The surviving integration surface is `server/src/services/integrations/openConnector{ChatTools,Catalog,AppInventory,CloudAuth.generated}.ts` (the generated auth file is now a hand-maintained frozen snapshot — no generator), the chat executor `server/src/routes/chat/pipeline/executors/openConnector.ts`, and `server/src/routes/projectConnectors.ts` + their tests. Historical descriptions of a sidecar topology (e.g. F-003 in `docs/audits/2026-09-20-structural-review.md`) are stale snapshots.
- `capacitor/` **was removed on 2026-10-15** (ADR `docs/adr/0016-capacitor-shell-removal.md`), together with `.github/workflows/build-capacitor-apk.yml` — its only consumer, a `workflow_dispatch`-only manual job that never took part in the merge gate. This closes the F-007 "half-alive" question in `docs/audits/2026-09-20-structural-review.md` (that audit is a dated snapshot — leave its text as-is). The dead frontend Capacitor bridge (`capacitorBridge.js`, `main.js` hook, and the `window.Capacitor` boot probe in `index.html`) was completely removed on 2026-10-16 with synchronized CSP hashes, fully completing the shell retirement.

## Boundaries and risk routes

- Do not commit generated `dist/`, test reports, secrets, or deployment state.
- Treat `frontend/src/main.js` (it composes extracted modules, and `batchStorage.js` must remain its first side-effect import), `server/src/app.ts`, `server/src/boot/` (startup/lifecycle stages), auth, migrations, and `deploy.sh` as high-churn or high-impact surfaces. Prefer extracted modules and add focused regression coverage. Keep `e2e/storage-bootstrap.spec.mjs` as the import-order contract when editing the frontend entrypoint. Larger companion files that also warrant the same caution: `frontend/src/styles/legacy/` (the old `styles.css` monolith was split into order-sensitive slices; cascade order is defined by `styles/index.css` → `legacy/index.css`), `frontend/src/i18n.js` (the zh dictionary is split into `frontend/src/i18n/zh.js`), `frontend/src/chat/streamingTurn.js`, `frontend/src/render/{markdown.ts,viz.js}`.
- **CSS contract (2026-09-30):** `frontend/src/styles/themes.css` is imported exactly once and last; it is the sole active palette plus the bridge for `--cg-*`, `--chatgpt-*`, `--conversation-*`, and legacy HSL channels. `legacy/` and `restore/` are compatibility geometry only. Current desktop surface owners are `parity/{sidebar,topbar,composer-unified,transcript}.css`, with scoped auxiliaries enforced by `npm run lint:surface-css`; never add a competing palette or desktop owner to compatibility CSS.
- **Control sizing (2026-10-10):** `tokens.css` declares `--ui-control-sm/md/touch` = 32/40/44px, but the **shipped desktop density is 36px** (topbar `#topModelSwitcher`/`#findBtn`, Library toolbar, directory tabs) and the search pill is 42px; `polish/buttons.css`'s `.btn`/`.btn-icon` grammar is barely used in markup (12 `.btn-icon` vs a long tail of `exam-btn`/`settings-btn`/… feature classes). Mobile is a **separate, reference-pinned density** — `polish/mobile-directories.css` (36px search, 40px tabs) is asserted by `e2e/reference-ui-visual.spec.mjs` against `docs/ref/mobile-reference-2026-10-04.md`; do not align mobile to desktop. New work should pick the ladder rung that matches the surface it sits on rather than assuming one global size, and `npm run lint:button-sizes` blocks new literal off-ladder heights.
- `deploy.sh` must remain single-writer, preserve `dist.previous`, and restore the previous backend after a failed restart or health gate. If changing its swap/rollback flow, test the lock, candidate cleanup, and error trap paths.
- `.github/workflows/ci.yml` is the frontend/server merge gate. Keep type checks, build, unit tests, and frontend Playwright smoke tests intact; preserve concurrency cancellation and failure artifacts. **CI coverage as of 2026-10-15**: `ci.yml` is the gate; `server-ci.yml` covers `server/`; `security.yml` is the supply-chain/SAST + weekly advisory gate (deliberately not path-filtered); `image.yml` builds and verifies a signed OCI image of the API server on every push — it does **not** deploy, `deploy.sh` still builds on the host; `universal-app-build.yml` covers `apps/socrates/` web export and smoke; `agent-tooling-ci.yml` covers `tools-rust/`-related harnesses. (Legacy `mobile-apk.yml`, `build-apk.yml`, `release-clients.yml`, and `android-device-smoke.yml` were retired in commit `06eb47a4`; `capacitor/` + `build-capacitor-apk.yml` were removed 2026-10-15 in ADR 0016). `site/` and `packages/` are verified through the changes filter and shared unit/DOM-free tests.
- **Brand assets — favicon is locked to `logo.png`.** `frontend/public/favicon.png` and `site/favicon.png` must stay byte-identical to their respective `logo.png` siblings (currently 2077 bytes each). Do not replace either favicon with a tray variant, an emoji, a service icon, or any auto-generated image. If the logo itself is updated, re-copy `logo.png` over `favicon.png` in the same directory; both files move together.
- **Site static assets are cache-busted by query string.** `site/*.css` and `site/*.js` are served with `cache-control: public, max-age=604800, immutable`, so a browser keeps the old bytes for a week unless the URL changes. Every asset the site references carries `?cb=<version>`: `chrome.css` / `public.css` / `fonts.css` / `chrome.js` / `motion.js` / `locale.js` take their version from `scripts/sync-site-chrome.mjs` (bump the constant, then run `npm run site:sync`), while a stylesheet linked by hand (e.g. `site.css`) carries its own version in the pages that link it. **Changing a site stylesheet without bumping its version publishes a fix that nobody sees.**
- **`allowScripts` is an allow-list, not a switch.** `server/package.json` and `frontend/package.json` declare `allowScripts: { "esbuild": true }`. Only esbuild genuinely needs a script (its postinstall fetches the platform binary; without it `vite build` fails). Do not widen this back to `"*"`. If a new dependency needs a script, add it by name and say why in the commit.
- **CI installs with `--ignore-scripts` where it can.** `server-ci.yml` and the Security workflow's audit jobs use it because a typecheck or an advisory lookup never needs a package's install hook. The main `ci.yml` jobs do not, because they build.

## Next checks

- Frontend behavior/UI: build first, then run a focused Playwright spec; inspect a screenshot for visual work.
- Server or schema: run typecheck and focused tests; document migration/rollback implications.
- Cross-client API changes: update the OpenAPI description and check `apps/socrates/` + `packages/contracts` compatibility.
- Deployment changes: use a non-production dry-run environment or shell-level validation before operating on web roots or services.
- Model-capability / provider-contract work: read `docs/plans/2026-10-23-stability-hardening-handoff.md` first. It carries the current verification baseline, the rules for extending `server/src/lib/modelCapabilities.ts`, and the open backlog. Only models whose vendor documentation has been checked may be added to that registry.

## Architecture guards (run inside `npm run lint`)

`npm run lint` is not just `tsc` + `eslint` — it ends in a chain of custom ratchets. When you add a new guard, add it to both `lint` and a `lint:<name>` script, and give it a `--update` baseline that may only shrink.

| Guard | Enforces |
|---|---|
| `check-react-globals.mjs` | React does not read legacy `window.*` functions directly; the typed gateway (`react/legacy/gateway.ts`) is the only boundary. The `window.__socrates*Bridge` objects are exempt as bridge infrastructure — that exemption is why `check-state-ownership.mjs` exists |
| `check-state-ownership.mjs` | React state access converges on `store/index.ts` typed hooks: no new `window.__socrates*Bridge` reads and no new string-keyed `stateStore.dispatch` writes. Shrink-only baseline (also `lint:state-ownership`) |
| `check-button-primitive.mjs` | Raw JSX `<button>` elements under `src/react/**` (outside `src/react/ui/`) stay at or below their frozen count — counted from the TypeScript AST, so an HTML template string is not mistaken for an element. Use the shared primitives in `src/react/ui/` instead. Shrink-only baseline (also `lint:button-primitive`) |
| `check-react-roots.mjs` | React root creation and hydration stay in `react/lib/boot/ownedRoot.ts`; retired transcript mount globals cannot return. Includes `lint:react-roots` and a shrink-only `--update` baseline |
| `check-css-debt.mjs` | `!important` / hex colors / literal radii / stacked IDs stay at or below their frozen counts; the cascade order in `index.html` is proved against `styles/index.css` (nested `@import`s included), and no `@import` may sit after a style rule — the browser drops those silently |
| `check-button-sizes.mjs` | Interactive controls reach the size ladder (`--ui-control-sm` 32 / `md` 40 / `touch` 44) instead of a literal px height; off-ladder count stays at or below its baseline (also `lint:button-sizes`) |
| `check-z-index.mjs` | Live sheets use the `--ui-z-*` rungs (20/30/40/80/90/200/400/1600) instead of literal `z-index` ≥ 10 (local 0–9 allowed); off-token count stays at or below its baseline (also `lint:z-index`) |
| `check-empty-catch.mjs` | Every empty `catch` carries a reasoned `empty-catch: intentional — …` marker (AST-based, so strings/regexes never count) |
| `check-composer-css.mjs` | Exactly one owner for composer CSS: `styles/parity/composer-unified.css` |
| `check-surface-ownership.mjs` | Sidebar / topbar / transcript each have one desktop owner under `styles/parity/` |
| `check-surface-ladder.mjs` | The four-step background ladder holds for **every** theme discovered in `themes.css`: exactly four rungs, no pure black, role order, steps inside the 1.5%–7% band, and the legacy HSL channels tracking the rungs they carry. Themes are cross-checked against the runtime `THEME_STYLES` list, so a theme registered in one place but not the other fails. The baseline records each theme's scale / shared-projection policy (also `lint:surface-ladder`) |
| `check-focus-ring.mjs` | Focus states use the `--ui-focus-shadow` double ring with a ≥3:1 outer ring; no bare visible `outline` survives, and every `!important` that clears an outline carries a forced-colors fallback (also `lint:focus-ring`) |
| `check-font-weight.mjs` | Font weights come from tokens, not literals, and the dark canvas steps medium and bold down to 450 / 600 (also `lint:font-weight`) |
| `check-prompt-dashes.mjs` | Prompt text uses a single dash convention; the baseline records the entries that are deliberately exempt (also `lint:prompt-dashes`) |
| `check-mobile-css.mjs` | Mobile CSS stays in the mobile owner files |
| `check-i18n-locales.mjs` | `en` and `zh` carry the same key set |
| `check-e2e-artifacts.mjs` | e2e writes screenshots under `test-results/`, never to absolute paths like `/tmp` (which break on non-POSIX runners and leak across runs) |
| `check-chat-layering.mjs` | `src/chat/**` must not import `src/react/**` — `src/react/types/**` is the allowed shared contract. The legacy chat layer must not depend on the React component tree; put shared pieces in `src/ui/` or `src/react/types/`. |
| `check-legacy-js.mjs` | First-party `.js` files under `frontend/src` stay at or below the frozen set — `tsc` runs with `checkJs: false`, so new modules must be `.ts`/`.tsx` (also `lint:legacy-js`) |
| `check-external-hosts.mjs` | The SPA keeps every runtime byte on our own origin. Scans `index.html` + `src/**` (comments stripped, `src/vendor-files/**` skipped) and fails on any absolute `http(s)` host that is not allowlisted — our own domains, provider base URLs shown as placeholder text, `www.w3.org` XML namespaces, and GeoGebra's CDN (the one deliberately remaining third-party host, lazily loaded for `math_construction` cards). Baseline is empty and may only shrink (also `lint:external-hosts`) |
| `../scripts/check-packages-dom.mjs` | `packages/*` stay DOM-free (no `document`/`window`/`localStorage`/`react-dom`); platform diffs live in `apps/socrates/src/*.web|android|windows|macos|native` (also `lint:packages-dom`) |
| `../scripts/gen-csp-hashes.mjs` | CSP drift gate: regenerates `ops/nginx/csp-spa.conf` and the `script-src` hashes for the two inline `index.html` scripts; lint fails when the committed artifacts drift (also `lint:csp-hashes`) |
| `../scripts/check-doc-paths.mjs` | Entry docs (`README.md`, `README.zh.md`, `AGENTS.md`, `CLAUDE.md`) only link to paths that exist. Catches the class that left `mobile/` and its APK workflows advertised in the README for days after the tree was deleted; `docs/audits/**` are dated snapshots and are not scanned (also `lint:docs`) |
| `check-cjk-punctuation-fonts.mjs` | Chinese punctuation keeps full-width metrics. A `@font-face` without a `unicode-range` may claim every code point, and Geist Sans (first in the stack) carries narrow glyphs for U+3000-303F / U+FF00-FFEF — so ，。！？；：（） rendered at half width even though the text was full width in the DOM. Covers `frontend/src/styles` (strict: every face declares a range) and `site/` (a face may omit the range only when it points at an explicitly subsetted file, e.g. `*-latin-*.woff2`) (also `lint:cjk-punctuation-fonts`) |
| `../scripts/check-forwarding-shims.mjs` | Freezes the count of re-export-only files (`export * from './canonical.js'`) in `frontend/src` and `server/src`. New code imports the canonical module; deleting a shell lowers the baseline with `--update` (also `lint:shims`) |

Conventions these follow: a failing check prints the offending `file:line` and exits 1; a baseline lives next to the script as `<name>.baseline.json` and can only move down; a `--update` run regenerates it and prints what it dropped, so a shrinking ratchet is an explicit act.

## Incremental testing (required)

Do not run the full `test:unit` / Playwright suites for every change. Tests are slow
(unit ≈2 min, full Playwright much longer), so map the diff to tests and run only those.

1. Find the change set: `git status --short` + `git diff --name-only HEAD` (or diff
   against the last verified commit you recorded).
2. Map changed files to specs:
   - `frontend/src/styles*` (tokens/themes/shell CSS) → `e2e/landing-light-visual`,
     `e2e/chat-light-palette`, `e2e/theme-system`, `e2e/chat-workbench`,
     `e2e/home-customization`.
   - `frontend/src/ui/sidebarResize.js`, sidebar chrome/nav → `e2e/sidebar-resize`,
     `e2e/sidebar-compat`, `e2e/sidebar-nav`.
   - Composer (`react/composer-input`, `ui/composerTools`, `#chatInputWrap`) →
     `e2e/composer-*`, `e2e/chat-workbench`, `e2e/repro-input-overlap`.
   - `frontend/src/chat/*` / `render/*` → `e2e/chat-send`, `e2e/chat-stop-resend`,
     `e2e/streaming-render`, `e2e/message-list-compat`, plus `test/<module>.test.mjs`.
   - New modules with no matching spec: run only the smallest relevant unit file
     (`node --experimental-strip-types --test test/<file>.test.mjs`) and add a focused
     spec instead of relying on the full suite.
3. Run a subset, e.g.:
   `npx playwright test --config=playwright.config.mjs e2e/<spec>.spec.mjs --workers=1`
4. If an existing spec fails, rebuild `git stash`-clean HEAD (or inspect the traces)
   to confirm it is pre-existing before attributing it to the change.
