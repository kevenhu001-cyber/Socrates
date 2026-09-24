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
| Localization | `src/i18n.js` | English and Chinese dictionaries and language switching |
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

## CSS cascade

`src/styles/index.css` is the single stylesheet entry. Its order is part of the
implementation:

1. `tokens.css` and `themes.css` define shared values.
2. `legacy/index.css` imports 17 order-sensitive slices of the older sheet.
3. `foundations/`, `layout/`, `components/`, and `features/` contain modular
   styles for actively maintained surfaces.
4. `restore/index.css` loads the visual restore layer last; `restore/fixes.css`
   contains adjustments made against the current DOM.

This is a transition architecture, so equal selectors can have multiple active
owners. When changing a surface, first trace its cascade in `styles/index.css`
and its imported files. Move or delete a legacy rule only after checking the
affected desktop/mobile and light/dark views. Keep `index.css` as the only
entry point.

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

## Local development

The Vite proxy defaults to port `3037`, while the API server defaults to
`8080`. Choose one matching setup:

```sh
# In frontend/: point the proxy at the server default
API_PORT=8080 npm run dev

# Or in server/: use the proxy default
PORT=3037 npm start
```
