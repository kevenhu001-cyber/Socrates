# shadcn component replacement

Baseline: `f0806fb8`, after the theme/compatibility adaptation. This phase
replaces behavior and visual ownership in feature code rather than counting
theme bridges as component replacements.

## Implementation

1. Replace settings' hand-built modal and focus trap with shadcn Dialog,
   preserving visited category drafts, trigger focus and nested dialogs.
2. Replace native appearance/style/language selectors with Select; replace
   simulated settings/profile switches and option groups with Switch and
   ToggleGroup. Replace provider/admin/library choices with Checkbox and
   sharing choices with RadioGroup.
3. Move settings/profile/admin actions to direct semantic Button variants.
   Remove their competing legacy control styles. Keep layout-only geometry
   in the existing surface owners and preserve native file/color pickers.
4. Verify focused units and browser flows, including keyboard-only selection,
   Escape in nested overlays, partial selection, provider persistence, and
   desktop/mobile screenshots. Record remaining compatibility use explicitly.

The Browser plugin is unavailable; use the repository's Playwright runner.
Do not modify the production API, native clients, storage bootstrap, or the
deferred-runtime and CSS architecture gates.

## Completion record

All four implementation steps are implemented on 2026-10-28 (`f0806fb8`, then
`55dad805` for the shell work that followed).

| Area | Delivered |
| --- | --- |
| Settings modal | `Dialog`/`DialogContent` with `layout="settings" keepMounted` own the overlay (`src/react/settings/SettingsModal.tsx`); `DialogHeader`/`DialogTitle`/`DialogClose` replace the hand-built header (`SettingsModalChrome.tsx`) |
| Selectors | `PreferenceSelect` wraps shadcn `Select` and serves appearance, theme style and language (`GeneralSettingsPane.tsx`) plus recognition language (`ModelsPreferenceSections.tsx`) |
| Switches and option groups | shadcn `Switch` in `ModelsSettingsPane.tsx`, `DisplaySettingsPane.tsx` and `profileModal/ProfilePreferencesSection.tsx`; shadcn `ToggleGroup` for the display font/width options and the projects filter rail (`ProjectsView.tsx`) |
| Choice semantics | shadcn `Checkbox` for provider/admin/library choices (`settings/ProviderRow.tsx`, `adminModal/SystemModelSection.tsx`, `pages/workspace/LibraryItemRow.tsx`, `LibrarySelectionBar.tsx`); shadcn `RadioGroup` for sharing visibility (`shareModal/ShareVisibilityOptions.tsx`) and the active-provider radio (`settings/ProviderList.tsx`, `ProviderRow.tsx`) |
| Actions | Settings, profile and admin actions use the semantic variants of the shared shadcn `Button` (`variant` default/outline/secondary/ghost/destructive/link, size from `--ui-control-*`). No `variant="surface"` remains in `src/react` |
| Guard | `scripts/check-shadcn-adoption.mjs` runs inside `npm run lint` with a shrink-only zero baseline for raw React controls, unadapted Base UI imports and compatibility controls inside the migrated feature directories |

### Preserved behaviour

- **Visited category drafts.** The modal component itself stays mounted and
  `keepMounted` keeps the pane tree alive, so the visited category
  (`useSettingsNavigation`) and the per-pane drafts survive closing and
  reopening the modal.
- **Trigger focus.** `DialogContent` takes `finalFocus={() => getSettingsReturnFocus()}`
  and `initialFocus` on `#settingsCloseBtn`; Base UI restores focus to the
  element that opened the overlay.
- **Nested overlays.** The backdrop keeps the legacy overlay id
  (`backdropProps={{ id: 'settingsOverlay' }}`) because `src/ui/modalA11y.js`
  coordinates shell inertness through that id. Base UI owns Escape, focus
  trapping and restoration.
- **Provider persistence.** The active provider radio writes
  `socrates-last-active-id`; arrow navigation changes the active model without
  disturbing text editing in the provider name field.
- **Sharing.** The visibility radio group submits the selected value to
  `/api/sessions/:id/share`.

## Remaining compatibility use

These stay on native or compat controls on purpose. They are the adapters that
keep form submission, DOM refs and native picker behaviour intact.

| Compatibility surface | Where | Why it stays |
| --- | --- | --- |
| `ui/NativeControl.tsx` (native colour/range/checkbox/radio inputs) | `settings/DisplaySettingsPane.tsx:72,77` (background colour pickers), `intelligence-ui/IntelligenceUiNodes.tsx:181,238`, `intelligence-ui/openui/controls.tsx:348,387,419`, `chat-configuration/ChatConfigurationPanels.tsx:103` | Native pickers, real form values and the mixed-state indicator cannot be reproduced by a styled generic control |
| `ui/shadcn/native-select.tsx` | `intelligence-ui/openui/controls.tsx`, `intelligence-ui/openui/map/Map.tsx` | The generated interactive UI needs a real `<select>` for form semantics |
| Retained HTML dialogs | `src/react/pages/workspace/workspace.dialogs.ts` (project, scheduled task, plugin and connector forms) | These dialogs are HTML strings that submit real `FormData`; the native `<form>`, `<input>` and `<select>` elements are the contract |
| Retained HTML across the SPA | `frontend/src/**` legacy surfaces | They share the theme through explicit `data-ui-legacy` slots rather than React components |

## Verification

### Results

- `npm run lint`: passed (exit 0) — typecheck, ESLint and every architecture
  guard. The shadcn guard reports `0/0 raw controls, 0/0 unadapted primitives,
  0/0 compatibility controls in migrated features`.
- `npm run build`: passed (55.5s).
- Focused unit files: **23 passed** across `shadcnAdoption`, `shadcnControls`,
  `buttonPrimitive`, `styleArchitecture` and `themePalette`.
- Full frontend unit suite (`npm run test:unit`): **1192 passed, 0 failed**.
- Focused Playwright regression: **107 passed** across 20 specs — the
  replacement spec (`shadcn-component-replacement`), `shadcn-theme`,
  `settings-modal`, `profile-modal`, `admin-console`, `share-view`,
  `library-directory`, `projects-directory`, `plugin-directory`,
  `scheduled-page`, `reference-ui-visual`, `visual-system-convergence`,
  `sidebar-compat`, `sidebar-nav`, `global-ui-system`, `topbar-model-switcher`,
  `react-compat`, `storage-bootstrap`, `ui-guidelines`, `message-list-compat`.
- Full smoke suite (`npm run test:smoke`): **655 passed, 1 skipped, 0 failed**
  (24.5m) — the same set CI runs.

The focused set covers every point the plan asked for: keyboard-only selection
(Select arrow keys, ToggleGroup arrow navigation, Switch), Escape in nested
overlays (the listbox closes without closing settings, the second Escape closes
settings and returns focus to the trigger), partial selection (the library
select-all checkbox reports `aria-checked="mixed"`),
provider persistence (`socrates-last-active-id`), and the narrow-phone provider
card at 320px with a scroll-overflow assertion.

### Regression found and repaired during verification

`projects-directory.spec.mjs` failed at the baseline commit: the shared button
swap in `55dad805` replaced `ui/Button` with the shadcn `Button` in
`src/react/pages/workspace/workspaceUi.tsx` and dropped the
`workspace-create-button` class from the projects header. The spec selector
`.projects-directory .workspace-create-button` stopped matching, and the header
button lost the 42px pill geometry the directory headers still share with the
library and scheduled headers.

The repair restores the class next to `projects-create-button`: the component
keeps the structure, the owner keeps the pixels. The directory headers are
workspace surfaces and stay owned by the compatibility geometry until ADR 0024
P3–P5 move them.

### Environment note

`f0806fb8` added four runtime dependencies — `tailwindcss`, `@tailwindcss/vite`,
`class-variance-authority` and `cn`. None of them declares an `install` or
`postinstall` script, so `allowScripts: { "esbuild": true }` stays as it is. A
stale local `node_modules` fails the build with `TS2307` until `npm ci` runs;
CI installs from the lockfile, so the gate itself is unaffected.

## Remaining scope

- ADR 0024 P3 (transcript rows and toolbars), P4 (composer chrome) and P5
  (CSS cleanup and ratchet shrink) are not started. `parity/topbar.css` and
  `parity/sidebar.css` still own their geometry.
- `settings-btn-mini` survives on two settings buttons
  (`PersonalizationMemorySection.tsx:64`, `ModelsProviderSection.tsx:30`) but no
  rule owns that class any more, so it is a dead name in the DOM. ADR 0022
  still lists it as retained; the P5 cleanup has to either delete the class or
  restore a rule for it.
- The entry-chunk budget was raised from 360 KB to 365 KB in `55dad805` to
  admit the shadcn primitives. The measured static JS closure is **361,682 B**
  (`dist/.vite/entry-graph.json`: html 11,676 B + js 361,682 B + css 172,867 B
  = 546,225 B against the 588,000 B total cap), so the original 360 KB JS
  budget is still missed by 1,682 B (0.47%) and P3/P4 will add more entry-chunk
  code.
- `cn` is a new, narrowly scoped runtime dependency (published 2026-10-16) and
  now backs eleven source files. It is worth an explicit supply-chain
  decision before the shell migration pulls more of the registry in.

### Visual migration rollback

The owner requested reverting `fbc5075f` on 2026-10-29. Its control skins,
semantic palettes and shell mode controls return to their preceding versions.
The later tutor-session behavior and the OpenUI/code-interpreter fixes in
`cafb46a5` remain in place.
