# Frontend UX and architecture follow-up — 2026-09-23

## Scope

Reviewed the Vite SPA entry, Chat/Tutor navigation, composer tools, plugin
selection flow, sidebar More menu, React/legacy boundaries, stylesheet cascade,
frontend scripts, and existing Playwright coverage. No server API, persistence
format, or mobile-client architecture was changed.

The experience benchmark is ChatGPT's task path: plain conversation stays easy
to start, while research, files, connected context, and finished work are
discoverable when the user needs them. This review does not set feature parity
or visual imitation as a goal.

## Findings and changes

### F-UX-01 — Composer tools hid their purpose in a flat list

The desktop list mixed upload, search, writing, data analysis, exams, skills,
and image creation. Its search hint claimed to include files, folders, and
skills even though the input only filtered tool labels and connected apps.
Mobile showed the same actions in a different flat order and hid search.

The menu now groups tools under **Add context**, **Search & research**, and
**Create & analyze**, localizes the headings, shows short desktop descriptions,
and uses the same task groups on mobile. Search now has accurate copy, filters
both tool labels and connected-app details at both breakpoints, and active
toggle actions expose `aria-pressed`.

### F-UX-02 — Connector failure looked like “no integrations”

The composer previously swallowed catalog errors and rendered no plugin area
when the user had no connected apps. Users could not tell whether the catalog
was empty, offline, or filtered out.

The menu now shows loading, error/retry, no-connected-app, and no-search-match
states. “Manage apps” opens the plugin directory. The connector retry stays in
the menu until the request recovers. Selected apps keep their check state and
remain visible as chips in the composer.

### F-UX-03 — Skills had a duplicate entry and was hidden on desktop

Skills appeared in the More menu while a dedicated React sidebar destination
also existed, but a restored desktop CSS rule hid the primary destination.
English More was translated as “Customize.”

Skills is now a visible primary destination in the desktop sidebar and no
longer repeats in More. More is named consistently in English and Chinese and
retains secondary settings and keyboard shortcuts. Projects, Scheduled, and
Plugins remain direct destinations; artifacts remain under Library.

### F-ARCH-01 — React/legacy ownership was overstated in the frontend README

React owns many mounted surfaces, but `main.js`, chat/session modules,
streaming, and parts of Markdown rendering still own runtime behavior. Some
React code also invoked global composer functions directly.

The frontend README now documents the hybrid boundary and current directories.
Composer search/explore and menu open/close actions go through the typed
`LegacyActions.composer` adapter. The remaining legacy state reads in the menu
use the existing typed global-value accessor. Session and streaming migration,
legacy window aliases, and same-name `.js` / `.ts` modules remain unchanged.

### F-ARCH-02 — Composer CSS had conflicting owners

The menu is styled by modular menu CSS and several restore sheets. A doubled-ID
rule in `chat-surface.css` overrode the later mobile menu rule. This menu's
current mobile width/radius and category/search additions now live in the
post-restore `fixes.css` layer; the conflicting radius rule was removed from
`chat-surface.css`. The global cascade remains layered and order-sensitive.

### F-DOC-01 — Frontend structure and QA notes described old files

`frontend/README.md` referenced a missing `styles.css`, an obsolete `state.js`,
old dependency versions, and an incorrect React completion percentage.
`design-qa.md` used Windows temp paths as comparison references. Both now
describe the actual hybrid structure and local verification workflow. ADRs
0012/0013 record current implementation status; the 2026-09-20 structural
review remains a historical snapshot.

### F-CI-01 — The `lint` script did not lint source code

`npm run lint` only ran TypeScript checking, while CI ran ESLint in a separate
step. `npm run lint` now runs TypeScript and ESLint, and CI invokes that
combined script once. Existing `lint:eslint` remains available for focused
iteration.

## Repeatable coverage

- `composer-tools-visual-baseline.spec.mjs` stores eight screenshot snapshots:
  desktop `1536 × 868` and mobile `400 × 890`, each across dark/light and
  English/Chinese.
- `mobile-composer-ux.spec.mjs` is an isolated mobile-Web flow for grouping,
  filtering, active web-search state, empty connector state, and navigation to
  Plugins. It also checks Escape dismissal and focus return.
- Focused existing coverage protects menu dispatch, file workflow selection,
  connected plugins, and sidebar navigation.
- `npm run lint` is the combined type/lint gate. ESLint currently reports
  pre-existing warnings with zero errors; no repository-wide warning cleanup
  is part of this change.

## Remaining work

- `styles/index.css` loads 17 legacy slices and seven restore sheets after the
  modular layer. Do not move other UI CSS in bulk; migrate one tested surface
  at a time. A machine-checked CSS import-order rule is still absent.
- The chat/session streaming runtime and Markdown rendering are still largely
  JavaScript-owned. Typed bridges are an incremental adapter, not proof that
  those state domains have one React owner.
- `i18n.js` remains a large shared dictionary. Splitting it needs an explicit
  module ownership plan and locale coverage.
- Visual snapshots cover the changed composer menu, not every workspace,
  attachment failure, Tutor flow, or finished-artifact journey. Add focused
  baselines when those surfaces change.
