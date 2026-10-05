# Frontend Convergence and Governance

Status: Active · 2026-10-05

This plan applies the staged migration and per-surface ownership approach in
the [React + TypeScript migration plan](react-typescript-migration.md) and the
[2026-09-23 frontend review](../audits/2026-09-23-frontend-ux-architecture.md).
It keeps the Vite SPA as the web product and does not imply a move to the
mobile client.

## Goal

Reduce accidental drift between user-facing surfaces and frontend owners while
preserving existing product capabilities. Changes to product navigation that
hide or move destinations require usage evidence or user research.

## Rules for changes

1. **One owner per surface.** React-owned markup has one React owner. Static
   markup is a hydration shell and must match that owner's rendered structure.
2. **One action per control.** Use native buttons and links. Do not nest
   interactive controls or give non-interactive elements `role="button"`.
   Put creation actions on the directory or detail surface they create.
3. **Explicit state contracts.** Domain writes go through reducers and
   actions. `createImmutableBridge` freezes only the snapshot's top level for
   legacy compatibility; nested mutation is prohibited in new
   React/TypeScript code because it bypasses revisions and subscriptions.
4. **One CSS owner per surface.** Add rules to the current owner. Remove
   obsolete selectors in the same change. Keep compatibility CSS only while a
   live surface depends on it; keep `themes.css` as the final palette layer.
5. **Verify the touched surface.** Map each change to the narrowest unit and
   Playwright coverage. Capture a screenshot when visible geometry or styling
   changes. Keep bilingual key parity and mobile behavior in scope.

## Work sequence

- Interaction semantics and keyboard access.
- React/legacy boundaries, migrating one UI or state owner at a time.
- State typing, removing nested mutation before adopting deep-readonly
  snapshots.
- CSS convergence, migrating one surface at a time and deleting selectors
  after their markup leaves.
- Navigation grouping, informed by user task evidence before changing what is
  first-level or secondary.

## First increment

The Projects row has one action: navigation. Project creation remains available
from the Projects directory header and empty state. The static shell and React
hydration output are updated together, obsolete plus-button styles are removed,
the bridge's shallow-freeze contract is documented accurately, and focused
navigation coverage protects keyboard activation and the creation path.

## Second increment

The existing CSS debt guard also checks the exact import sequence in the
`legacy/`, `restore/`, `parity/`, and `polish/` aggregate manifests. Those lists
are cascade contracts: legacy slices preserve their original concatenation,
restore order determines historical winners, and the canonical surface layers
depend on their documented ownership order. The existing `lint` chain and
`lint:css-debt` entrypoint run the guard, so this adds no parallel lint path or
baseline budget.

## Third increment

The `LegacyNavigation` contract now reflects that `resetApp()` and
`startNewChat()` return `Promise<boolean>`: `false` means an in-progress exam or
stream confirmation was canceled. The connected-plugin “Use in chat” flow waits
for that result before changing composer selection. Focused coverage protects
both the successful reset and cancel paths.

## Fourth increment

In-session search and the progressive React message list now share an explicit
typed flusher module. This removes their ad hoc `window.__socratesFlushMessageRows`
global while preserving the flush-before-search behavior and cleanup on unmount.

## Fifth increment

Canvas edits now update message state through the session reducer and publish a
chat snapshot refresh, instead of mutating a message through `window.state`.
Canvas “Iterate” now writes markdown through the rich composer controller,
removing its undeclared `legacyActions.composer.setMarkdown` lookup and direct
textarea fallback. Focused coverage protects reducer persistence and the edit
and iterate flow. `editedText` is not in the current session save payload or
message-table schema, so this only guarantees reducer-backed in-memory state;
surviving reloads needs a separate persistence change.

## Sixth increment

The composer tools menu no longer reads the active extension and mode flags
through the generic `getLegacyGlobalValue` escape hatch. Named gateway
accessors document the shape of each legacy value while preserving the menu's
existing active-mode precedence.

## Seventh increment

The chat configuration bridge now reads the live `apiConfig` export from its
owning provider module. This removes its generic global lookup and duplicate
`Window.apiConfig` declaration while keeping the published popover snapshot
copied from the same provider object the legacy client updates in place.

## Eighth increment

The recents chips now read projects through a named cache accessor and tags
from the session cache owner, removing the last caller of generic
`getLegacyGlobalValue`. The legacy recents renderer also republishes the
existing filter snapshot after its caches change, so React refreshes project
and tag chips when asynchronous data arrives.

## Ninth increment

The unused string-based recents chip renderer and its no-op compatibility
wrapper are removed. `ui/recentsView.js` now loads project filter data and
notifies the React owner; it no longer imports or passes render-only chip data
to a retired legacy surface. An in-flight guard prevents repeated recents
renders from starting duplicate `/api/projects` requests.

## Tenth increment

Project summaries now have one typed cache owner with subscriptions and
single-flight initial loading. Recents chips, project actions, session loading,
and the workspace page read or update that cache; the unused
`window.__projectsCache` compatibility alias is removed. Failed workspace
refreshes keep the last successful project list so recents chips do not
disappear during a transient network error.

## Eleventh increment

Provider configuration now has a typed store and service that own provider
rows, active selection, validation, persistence, and activation rollback.
Settings keeps only modal and external-API presentation state. Provider
snapshots expose `hasKey` rather than credentials; key drafts live in the
provider service and the key input is uncontrolled so React does not retain a
second copy. Authentication, exam selection, model pickers, effort labels,
chat configuration, and clear-settings actions read or update the typed
provider domain. `window.apiConfig`, the provider-list snapshot bridge, and
the retired `window.renderProviderList` publisher are removed. Settings
coverage now checks visible rows and API payloads rather than reaching into a
global configuration object.

## Twelfth increment

Composer lifecycle ownership now sits in the typed Composer store/controller:
the active surface, separate topic/chat drafts, extension tokens, editor
commands, and send/stop/reset dispatches no longer depend on the legacy surface
swap observer or bridge. One Tiptap instance remains mounted across topic and
chat surfaces. Focused coverage exercises surface changes, draft/token
retention, send, stop, keyboard submit, and reset.

## Thirteenth increment

Sidebar destination state, route/history handling, recents filtering, and
drawer dismissal now belong to typed navigation/sidebar stores and services.
Library, Projects, Plugins, and Scheduled pages use typed stores/services for
loading and actions; their project, connector, scheduled-task, and library
detail dialogs are invoked directly from React owners. The old sidebar nav and
recents snapshot bridges, scheduled/workspace page bridges, `sidebar/index.js`,
and page-specific dialog/action aliases are removed. Shared confirmation and
Recents operations remain available through typed legacy actions for their
other callers. Focused route, drawer, workspace CRUD, preview, and scheduled-
page coverage protects the existing destinations, ordering, and return paths.
