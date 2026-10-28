# Frontend shadcn adaptation

Scope: the Vite application in `frontend/`. The Universal App, native Android
client, marketing site, API contracts, and editor/visualization runtimes keep
their existing ownership.

## Delivery plan

1. Establish the shadcn Base UI component registry, Tailwind compilation without
   Preflight, and semantic theme tokens in the existing final palette owner.
2. Adapt the shared button, menu, and dialog boundaries. Migrate React form
   controls and separators throughout settings, account/admin, search,
   directories, scheduled tasks, and generated interactive UI.
3. Bring retained HTML and legacy feature surfaces onto the same semantic
   theme through their existing CSS owners. Preserve IDs, event contracts,
   product density, mobile references, and editor geometry.
4. Add a migration coverage guard and focused regression tests. Verify lint,
   the production build, relevant unit tests, and Playwright flows in both
   themes and desktop/mobile viewports. Inspect screenshots before sign-off.

## Integration decisions

- Use the official `@shadcn` registry and Base UI to match the primitives
  already used by `FoundationDialog` and `FoundationMenu`.
- Keep `themes.css` as the sole palette owner and final stylesheet. Both
  `socrates` and `philosophy`, including light/dark/system preferences and
  user background overrides, must remain functional.
- Keep the four surface rungs and shared native palette parity. shadcn
  semantic tokens bridge these existing product roles; components must not
  introduce independent light/dark palettes.
- Keep compatibility adapters where native DOM refs/events, HTML forms,
  hidden/file/color/range inputs, or legacy selectors depend on native markup.
  A theme migration must not silently change form submission or callbacks.
- Keep Tailwind utilities in a cascade layer and omit Preflight. Existing
  product geometry wins for compatibility variants; new components use
  semantic variants. Focus, font weights, control sizes, and overlay stacking
  continue to use the existing `--ui-*` contracts.
- Do not load component libraries or icon packs from a CDN, change the
  storage bootstrap import, widen install script permissions, or commit
  generated build/test output.

## Verification baseline

- Before edits: `npm run lint` passed on 2026-10-28.
- Browser plugin is not available in this session; use the repository's
  Playwright workflow for rendered verification and save screenshots under
  `frontend/test-results/`.

## Completion record

All four delivery steps are implemented and verified on 2026-10-28.

| Area | Delivered |
| --- | --- |
| Build and registry | Tailwind v4 without Preflight, explicit React source scanning, official Base Nova registry config, 19 local shadcn component sources |
| Theme | Both styles and both modes share shadcn semantic tokens; existing `--ui-*` and historical token bridges resolve in the final `themes.css` owner |
| Activity across the frontend | 34 live stylesheets moved to semantic color roles; 111 retained HTML controls expose shared theme slots |
| React controls | 91 native JSX controls/separators migrated; shared buttons delegate to shadcn; special native input types preserve FormData, refs and event contracts |
| Interaction components | Menus/dialogs use the adapted shadcn boundary; Library/Scheduled use Tabs; display/tone options use ToggleGroup; display grid uses Switch |
| Content and feedback | Card/Field composition for instructions and provider validation, Badge for account tier, Empty for directory states, Skeleton for workspace loading, Alert for task errors |
| Regression prevention | `lint:shadcn` is part of lint, with a shrink-only zero baseline for raw React controls and unadapted Base UI imports; palette ownership also covers shadcn variables |

The native controls in `NativeControl.tsx`, retained HTML, and specialized
editor/visualization surfaces are intentional compatibility adapters. They
share the theme without changing DOM/event contracts or replacing their
domain-specific layout with generic cards. The React adoption guard ignores
embedded preview HTML; it does not claim that retained HTML is React.

Two integration regressions were found and repaired during verification:

- Native button/input/separator implementations retain shadcn styles without
  moving Base UI's deferred interaction runtimes into the initial bundle. The
  existing performance gate remains unchanged and passes.
- The old universal padding reset now lives in the CSS base layer. It can no
  longer erase Card/Field utility padding. Surface variants keep the existing
  tone-grid and segmented-control geometry while Base UI supplies keyboard
  navigation and selection.

## Verification results

- `npm run lint`: passed, including typecheck, ESLint and all architecture
  guards; no new warnings. The final `lint:shadcn` counts are 0/0 and 0/0.
- `npm run build`: passed. `shadcn info --json` recognizes Vite, Tailwind v4,
  Base Nova and all 19 installed components.
- Focused unit files: **39 passed** across `buttonPrimitive`, `styleArchitecture`,
  `themePalette`, `shadcnAdoption`, `shadcnControls`, `openUi`, `openUiTools`,
  `openUiMedia`, and `workspaceSubscriptions`.
- Focused Playwright regression: **108 passed** across 22 specs. After the
  final native button default-type correction, the dialog, deferred-runtime
  and new theme specs were rerun: **17 passed**.
- `git diff --check`: passed. Generated `dist/`, screenshots, reports, and
  temporary CLI/build logs remain ignored and untracked by Git.

| Browser coverage | Specs |
| --- | --- |
| Theme, home, chat and composer | `landing-light-visual`, `chat-light-palette`, `theme-system`, `chat-workbench`, `home-customization`, `composer-tools-compat` |
| Settings, account and admin | `settings-modal`, `profile-modal`, `admin-console`, `auth-direct-handlers` |
| Directories and tasks | `library-directory`, `projects-directory`, `scheduled-page`, `reference-ui-visual` |
| Focus, dismissal, nested overlays and loading | `anchored-menu-focus`, `confirm-dialog`, `session-row-menu`, `deferred-menu`, `performance-deferred-runtime` |
| Interactive generated UI | `openui`, `openui-media` |
| Migration-specific verification | `shadcn-theme`: both styles × both modes, real editable form state, computed token bridges, rendered Card padding, tone-grid width, mobile switch persistence and keyboard selection |

Browser environment: Chromium against `http://127.0.0.1:4173`, desktop
1440×960 and mobile 390×844, plus existing reference-spec viewports. The
Browser plugin is unavailable, so the repository's Playwright runner was
used. API responses are mocked by the existing test fixtures; this work does
not exercise live provider credentials or production deployment.

Screenshot inspection confirmed readable light/dark surfaces, correct Card
padding, a full-width tone grid, responsive settings navigation and no
horizontal overflow. New theme tests check page identity, non-blank app
content, absence of a framework error overlay, console/page errors, editing,
Escape/focus restoration, keyboard navigation and preference persistence.

Screenshots are in the gitignored run directory:

- `frontend/test-results/shadcn-settings-socrates-light.png`
- `frontend/test-results/shadcn-settings-socrates-dark.png`
- `frontend/test-results/shadcn-settings-philosophy-light.png`
- `frontend/test-results/shadcn-settings-philosophy-dark.png`
- `frontend/test-results/shadcn-settings-mobile.png`

Implementation reference: `frontend/src/react/ui/shadcn/README.md` documents
upstream provenance and the adaptations to preserve when updating components.
