# Frontend visual QA

## Repeatable browser setup

Build the SPA before opening the static Playwright server. The maintained visual
baseline targets the composer tools menu, the surface changed by the current
task-entry work:

- Desktop Chromium: `1536 × 868` CSS pixels.
- Mobile Web Chromium: `400 × 890` CSS pixels.
- Both sizes cover dark/light themes and English/Chinese copy.
- Screenshot tests disable animations and hide the caret. Connector responses
  use the deterministic mock API; the baseline includes the unconnected-app
  state.

Run the relevant checks from `frontend/`:

```sh
npm run build
npx playwright test --config=playwright.config.mjs e2e/composer-tools-visual-baseline.spec.mjs --workers=1
npm run test:smoke:mobile
```

The reviewed Playwright snapshots live beside
`e2e/composer-tools-visual-baseline.spec.mjs`. Update them only when an intended
visual change has been reviewed at both viewport sizes and in both themes and
locales:

```sh
npx playwright test --config=playwright.config.mjs e2e/composer-tools-visual-baseline.spec.mjs --workers=1 --update-snapshots
```

Functional UI tests may save extra evidence under `test-results/visual-qa/`;
that folder is generated and ignored. Do not use old machine-specific temp
paths as comparison references.

## Interaction checks

The focused flows cover grouped tools, search, active web-search state,
connected-app empty/error/retry states, and navigation to the plugin directory.
For a UI change, also verify its nearest keyboard path: focus the composer
trigger, open the menu, type in its search field, and activate an item with the
keyboard. Confirm the focus indicator and that the selected context remains
visible in the composer after the menu closes.

The menu snapshots are a visual regression baseline for this surface; they are
not a claim that every workspace, Tutor flow, or attachment type has a complete
pixel baseline. Add focused checks alongside future changes to those surfaces.
