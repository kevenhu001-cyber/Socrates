# Design QA — supplied mobile states

## Visual baseline

The four user-provided screenshots are the reference for this update:

- Plugin directory: `/tmp/paseo-attachments-KFkElB/b2cbb0cd4cad450758ff01e0e8def6b8b14353a7829c69fee32f96b6a9f36650.jpg`
- Sidebar drawer: `/tmp/paseo-attachments-KFkElB/29dfb1c727e402749815ea66d8d96eff66de9b0e33e472b713fffe59bdd0c620.jpg`
- Composer tools menu: `/tmp/paseo-attachments-KFkElB/4799c78c9f415bdccd1b40b0de0c48a2c846daa95f003c244889414ad4cfea16.jpg`
- Chat composer: `/tmp/paseo-attachments-KFkElB/5c32182f2090420f597719d6807d0ea3fcc8c44c33dddd226f4c947dabb38def.jpg`

Each reference is 1200 × 2670 physical pixels. Browser status/address chrome was excluded at y=303; the app-owned 1200 × 2367 region was normalized to 390 × 769. Playwright captured the app at a 390 × 769 CSS-pixel viewport. The comparison PNGs are 780 × 799 with the reference on the left and the implementation on the right:

- `/tmp/design-qa-plugins.png`
- `/tmp/design-qa-sidebar.png`
- `/tmp/design-qa-tools.png`
- `/tmp/design-qa-chat-composer.png`

## Findings and final layout

- The plugin page has its own centered **Plugins / Skills** switch. Plugins shows the existing live connector catalog, and Skills opens the existing prompt-template library. The main **Chat / Tutor** mode remains independent. The search field is 36px high, app tiles and list icons are 40px, and installed applications retain their real connector artwork and status.
- On the 390px mobile viewport, the drawer measures 254px wide. It keeps a dedicated scroll area, compact navigation rows, and the account footer. Navigation closes the drawer after a destination is selected.
- The tools menu is a compact floating card aligned to the composer. The first five actions are Camera, Photos, Files, Create Image, and Web Search; the remaining tools are reachable by scrolling the card.
- Home and chat composers use a matching 86px two-row frame with 16px side insets and the controls anchored to the lower row. The mobile layout stays inside the safe bottom area.
- The four app surfaces use a black canvas with high-contrast controls. Product name, branding, copy, signed-in account, and dynamic connector data remain Socrates-owned, so those values can differ from the ChatGPT reference while the layout and interaction states match.

## Create Image behavior

Choosing Create Image checks for a connected Jimeng AI connector. When it is missing, the app opens Plugins and shows the connection hint; it does not submit a generation request. With a connection, the composer enters image-creation mode and waits for the user's prompt. Replacing the inline mode marker while typing does not clear the selected mode. The first submitted chat request includes the image-generation instructions.

The server exposes the bounded Jimeng 4.6 submit action and its result query through the existing OpenConnector chat path. Submit accepts only a non-blank prompt up to 800 characters and rejects extra fields. Execution requires the authenticated user's connector to be connected; credentials stay on the server. The mode instructs the assistant to check for results up to eight times, render returned image URLs inline, and report missing connections, provider failures, missing image URLs, or timeout without claiming a generation succeeded.

## Verification

- `frontend`: `npm run lint` — passed (`tsc --noEmit`).
- `frontend`: `npm run typecheck && npm run build` — passed; Vite emitted existing directive, circular-chunk, and large-chunk warnings.
- `frontend`: `npx playwright test --config=playwright.config.mjs e2e/reference-ui-visual.spec.mjs e2e/composer-tools-compat.spec.mjs e2e/mobile-home-visual.spec.mjs e2e/sidebar-nav.spec.mjs e2e/plugin-directory.spec.mjs --workers=1` — 27 passed. This includes all four screenshot states, desktop layout checks, plugin/skills switching, drawer navigation, menu ordering/position, image-mode connection gating, first-prompt submission, and inline rendering of a returned image URL.
- `server`: `npm run typecheck` — passed.
- `server`: `node --import dotenv/config --import tsx --test test/openConnectorCatalog.test.js` — 22 passed, including connection gating, argument bounds, completed image results, provider failures, timeout, and secret redaction.
- `git diff --check` — passed.

No unresolved P0, P1, or P2 visual finding remains in the four agreed reference states.

final result: passed
