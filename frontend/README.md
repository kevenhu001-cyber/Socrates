# Socrates frontend

The frontend is a Vite single-page app. It uses React and TypeScript for many
visible surfaces while the existing JavaScript modules still own important
chat, session, streaming, and rendering behavior. Treat it as a hybrid app with
explicit migration boundaries; React does not own every user-facing flow yet.

## Where to look

| Area | Main entry points | Responsibility |
|---|---|---|
| App startup | `src/main.js`, `src/app/` | Boot wiring, compatibility exports, and application lifecycle |
| React surfaces | `src/react/` | Composer, sidebar, messages, dialogs, and workspace views |
| Chat runtime | `src/chat/`, `src/session/` | Sending, streaming turns, session loading, and persistence |
| Rendering | `src/render/` | Markdown, code blocks, diagrams, visualizations, and artifacts |
| Legacy UI modules | `src/ui/`, `src/sidebar/` | Existing DOM behaviors and adapters used during migration |
| Extensions | `src/extensions/` | Shared declarations and dispatch for composer workflows |
| Localization | `src/i18n.js`, `src/i18n/` | English dictionary in `i18n.js`; Chinese split into `i18n/zh.js`; language switching |
| Styles | `src/styles/index.css` | The only CSS entry point and the cascade manifest |
| Browser checks | `e2e/`, `playwright*.config.mjs` | Focused Playwright flows and responsive checks |

## Runtime and state boundaries

`src/main.js` is the browser entry. It loads `src/windowExports.js` and
`src/app/legacyBridge.js` to keep older JavaScript callers working and to
publish the typed `window.__socratesLegacy` action gateway. React code should
call `getLegacyActions()` from `src/react/legacy/gateway.ts`; use the temporary
global-value reader there only for legacy state that has not moved to a typed
store. New state should have one domain owner and a typed snapshot/action
boundary. Do not remove same-name `.js` and `.ts` files in bulk: some are
compatibility adapters and must be checked at their call sites.

The React bootstrap in `src/react/bootstrap.tsx` hydrates the surfaces that
have migrated. Chat lifecycle, SSE streaming, session behavior, and parts of
Markdown rendering remain in JavaScript modules. Keep those existing behaviors
covered while moving one user flow at a time.

## React controls

Use `src/react/ui/Button.tsx` for new React buttons and `IconButton.tsx` for
icon-only controls; the latter requires an accessible label. Both render a
native button and default to `type="button"`, so form submissions must set
`type="submit"` explicitly. Use the plain variant when a feature still owns
its styling; the shared variants opt into the button size and style grammar.
Loading disables the control and exposes its busy state. The button ratchet
tracks remaining raw React buttons and only allows its baseline to shrink.

## CSS cascade

`src/styles/index.css` is the single stylesheet entry. Its order is part of the
implementation:

1. `tokens.css` defines theme-independent geometry, typography and motion.
2. `legacy/index.css` loads order-sensitive compatibility styles.
3. `foundations/`, `layout/`, `components/`, and `features/` contain modular
   styles for actively maintained surfaces.
4. `restore/index.css` supplies compatibility rules; `parity/index.css` owns
   the current desktop surfaces, followed by shared `polish/` details.
5. `themes.css` loads exactly once, last, and owns the palette and legacy
   token mappings.

This is a transition architecture: compatibility selectors remain for surfaces
not yet migrated. When changing a surface, trace its cascade in `styles/index.css`
and its imports, and use the designated owner for the four desktop surfaces.
Move or delete a legacy rule only after checking the affected desktop/mobile
and light/dark views. Keep `index.css` as the only entry point.

## Checks

```sh
npm run lint                 # TypeScript check and ESLint
npm run build                # TypeScript check and production Vite build
npm run test:unit            # Full Node unit suite (use focused files while iterating)
npx playwright test --config=playwright.config.mjs e2e/<spec>.spec.mjs --workers=1
npm run test:smoke:mobile    # 400 × 890 mobile Web flow
```

For UI changes, build first and run the smallest matching unit and Playwright
coverage. Save temporary screenshots under the ignored `test-results/` folder;
do not commit build output or test reports. The regular Playwright config covers
desktop Chromium; the mobile config intentionally runs only its focused Web
flow instead of duplicating the full suite.

`index.html` is heavily commented: those comments explain why the boot shell is
shaped the way it is, so they stay in the source. The production build strips
them from the shipped document (`P_perf-strip-html-comments` in
`vite.config.js`) because they cost about 6.6 KB of gzip on the render-blocking
path. The entry budget in `e2e/performance-loading.spec.mjs` is a ratchet —
keep the built document under it rather than raising the limit.

## Local development

The Vite proxy defaults to port `3037`, while the API server defaults to
`8080`. Choose one matching setup:

```sh
# In frontend/: point the proxy at the server default
API_PORT=8080 npm run dev

# Or in server/: use the proxy default
PORT=3037 npm start
```

## Credits

Chinese text is rendered with **MiSans**, a free font published by Xiaomi Mobile
Software Co., Ltd., bundled from the `misans` npm package. MiSans is required by
its IP license to be credited in software that uses it; the subsetted webfont
slices ship inside the bundle (`node_modules/misans/lib/Normal/`) and are served
from this app's own origin.
