# ADR 0020: Lobe-aligned design foundation

- **Status:** Accepted
- **Date:** 2026-10-18

## Context

Socrates accumulated a mature semantic token API (`--ui-*`, `@socrates/theme`) while its concrete neutral values were tuned primarily against ChatGPT visual parity. At the same time, the product increasingly needs reusable, accessible UI primitives for menus, popovers, dialogs, sheets, selects, switches, and related infrastructure.

Lobe UI v6 provides an AIGC-oriented component system and a documented default token model. Socrates can reuse that foundation without giving up its own chat, tutor, composer, thinking, tool, artifact, and Intelligent UI product surfaces.

## Decision

Socrates Design System v2 adopts the **default Lobe UI v6 neutral token values and foundation metrics** as the canonical foundation for:

- layout, container, elevated, and secondary-container surfaces;
- primary / secondary / tertiary / disabled text roles;
- subtle / default / strong borders;
- backdrop masks;
- monochrome primary and standard semantic status colors;
- spacing, base radii, typography metrics, control heights, breakpoints, and motion durations/easing.

Socrates keeps its existing semantic API as the compatibility boundary:

- Web components continue consuming `--ui-*` variables.
- Shared and native clients continue consuming `@socrates/theme`.
- Lobe CSS variables are bridged onto the same Socrates roles in `frontend/src/styles/themes.css`.
- Theme-independent Lobe metrics live under `foundation*` exports and `--ui-foundation-*` CSS variables.

This is intentionally a **foundation alignment**, not a product-layout rewrite. Product-specific geometry and behavior remain Socrates-owned, including:

- composer and message geometry;
- conversation width and viewport anchoring;
- tutor flows;
- thinking and streaming presentation;
- tool / artifact / Intelligent UI surfaces;
- mobile touch-target rules.

## Initial palette mapping

Dark mode follows Lobe default neutral roles:

- layout: `#000000`
- container: `#0d0d0d`
- elevated: `#1a1a1a`
- container secondary: `#060606`
- text: `#e6e6e6`
- secondary text: `#b4b4b4`
- tertiary text: `#8f8f8f`
- border: `#202020`

Light mode follows Lobe default neutral roles:

- layout: `#f8f8f8`
- container: `#ffffff`
- elevated: `#ffffff`
- container secondary: `#fbfbfb`
- text: `#1f1f1f`
- secondary text: `#666666`
- tertiary text: `#8a8a8a`
- border: `#e3e3e3`

## Foundation metrics

The v2 foundation exposes the current Lobe v6 metrics without forcing every Socrates product surface to use every rung:

- spacing: `4 / 8 / 12 / 16 / 20 / 24 / 32 / 48`
- radius: `4 / 6 / 8 / 12`
- controls: `28 / 36 / 40`, with `18` for the interactive micro-size
- body typography: `12 / 14 / 16 / 20`
- headings: `38 / 30 / 24 / 20 / 16`
- strong weight: `600`
- motion durations: `100 / 200 / 300ms`
- breakpoints: `480 / 576 / 768 / 992 / 1200 / 1600 / 1920`

Socrates product tokens may alias a matching foundation rung. They may also deliberately diverge where the product contract requires it. In particular, the existing `2px` optical spacing rung, `44px` mobile hit area, `42px` workspace search control, composer capsule radii, message-bubble radius, and product animation timings remain Socrates-owned.

The font-family choice is also not changed by this ADR. Socrates continues using its shipped Inter/MiSans/Plus Jakarta Sans stack; this migration aligns typography metrics rather than introducing a new font payload.

## Migration sequence

1. Cut the canonical palette over while retaining the `--ui-*` API. **Done.**
2. Keep Web and Universal App palette packages in lockstep. **Done.**
3. Add Lobe-aligned foundation spacing / radius / typography / control / breakpoint / motion metrics behind Socrates tokens. **Done.**
4. Introduce Lobe/Base UI primitives behind Socrates adapters, starting with menu / popover / modal infrastructure. **Account, organization, session-row and message-action menus, plus the shared confirmation dialog, done:** these use `@base-ui/react` through `DeferredMenu` / `FoundationMenu` and `FoundationDialog`; the old `AnchoredMenu` is removed. Other popovers and remaining dialogs remain follow-up work.
5. Migrate visual-reference assertions from the historical ChatGPT palette without weakening geometry or interaction checks. **Initial palette assertions done** in the foundation commit; continue checking each migrated surface.
6. Treat historical ChatGPT parity measurements as interaction references, not the canonical design-token contract.

## Consequences

- Existing components change appearance without a wholesale component rewrite.
- Common Socrates product tokens can inherit exact Lobe rungs while product-specific geometry stays stable.
- Web and Universal clients now have an explicit, testable foundation contract instead of parallel hand-maintained numbers.
- Visual-reference tests that encoded the old ChatGPT-derived neutral values must be updated as part of this migration.
- Future Lobe/Base UI primitives can share the same palette and metrics instead of creating a second theme system.
- The Universal App receives the same foundation through `@socrates/theme`; it does not depend on React DOM or Lobe Web components.

## Account-menu primitive migration (2026-10-19)

The first product migration uses [Base UI Menu](https://base-ui.com/react/components/menu)
1.9.0 behind `frontend/src/react/menu/FoundationMenu.tsx`. Only the SPA depends
on this package. It adds no install scripts and leaves shared/native packages
DOM-free.

The account trigger, item buttons and pricing link retain their existing
Socrates classes and actions. The adapter keeps the app-shell portal, overlay
motion, first-item focus on pointer opening and nonmodal outside interaction.
Base UI supplies trigger ARIA relationships, keyboard opening, roving focus,
typeahead, dismissal, focus restoration and collision-aware positioning. The
surface scrolls within the available viewport height instead of clipping items.

The session-row follow-up below migrates the project-picker view and removes
the older `AnchoredMenu` implementation.
Popover and remaining modal migrations remain separate steps. No server, schema or
deployment changes are required.

Validation: frontend lint and production build passed; the focused
`foundationTokens` / `menuPrimitive` unit files passed all six tests.
`anchored-menu-focus` / `theme-system` passed nine browser tests, and
`sidebar-nav` passed fourteen. Light, dark and phone screenshots were inspected.
The theme spec also fixes a foundation-commit assertion that expected literal
`var(...)` strings from `getComputedStyle()`: it now compares resolved aliases
against the canonical palette while retaining the exact color assertions.

The initial account-menu migration was committed as `fc644b65`. Its production
graph retained 136 Base UI modules in the eager sidebar dependency graph; the
follow-up below addresses that startup cost. Nothing has been deployed.

## Deferred runtime and organization menu (2026-10-19)

`DeferredMenu` keeps a native button in the eager shell and preloads the shared
`FoundationMenu` module on pointer entry or focus. Preloading preserves the
original DOM node and its focus. An explicit open mounts the primitive runtime;
the first click or keyboard intent is carried across the load. Escape, Tab and
outside pointer presses cancel pending opens, so a delayed response cannot open
the menu after the user has moved elsewhere. Once activated, the primitive stays
mounted and owns subsequent trigger interactions.

The organization menu now uses the same deferred adapter and Base UI radio group.
It preserves the selected organization, persistence, archive action, initial
selected-item focus, phone spill alignment and the Socrates surface classes.
Viewport collision handling shifts the horizontal position while retaining the
alignment used by the entrance animation; vertical positioning may flip sides.

`performance-deferred-runtime` checks the emitted production chunk graph for
every retained Base UI module, including dependencies co-located by Rollup.
`deferred-menu` blocks the real emitted runtime chunk to exercise cold opening,
keyboard intent, preloading and cancellation under delayed network delivery.

The chunk audit also found shared `@floating-ui/*` modules inside
`vendor-tldraw` and the React subscription shim inside `vendor-editor`.
`vite.config.js` now gives Floating UI its own shared chunk and keeps
`use-sync-external-store` with React. This prevents menu activation from pulling
in either heavy vendor chunk and avoids a circular React/shim chunk dependency.

Production graph comparison with the previous account-menu build:

| Metric | Before | After |
| --- | ---: | ---: |
| Static JavaScript closure, gzip bytes | 921,355 | 333,009 |
| Linked CSS, gzip bytes | 222,736 | 208,101 |
| Retained Base UI modules in the static closure | 136 | 0 |

The deferred menu adds 46,948 gzip bytes beyond the static closure when first
loaded. These are build-graph transfer sizes, excluding fonts, API traffic and
other runtime imports; they are not browser timing measurements.

Validation: frontend lint (including architecture guards) and the production
build passed. The focused `menuPrimitive` / `entryGraph` unit files passed six
tests. Twenty-five focused browser tests cover account-menu focus/motion,
delayed menu loads, organization persistence/search/archive actions, compact
phone layout, editor draft lifecycle, shared whiteboard/menu dependencies and
the existing static-transfer budget. Phone light/dark screenshots were inspected.

The whiteboard integration test exposed tldraw's default CDN font/translation
requests being blocked by the app's same-origin CSP. The board renders its seeded
note, the composer accepts text and the menu remains usable, but that does not
establish clean asset loading. The test reports the observed CSP violations and
matching `vendor-tldraw` fetch errors as a known issue, while failing on other
page errors. Hosting/configuring these assets on our own origin remains a
separate follow-up; this round neither expands CSP nor changes the whiteboard's
asset configuration. No server or schema changes are required. The follow-up
code is uncommitted, and nothing has been deployed.

## Session-row menu and project picker (2026-10-19)

The session overflow trigger now uses `DeferredMenu`, including cold keyboard
opening, typeahead, collision-aware placement and focus restoration. Its events
stay inside the menu interaction instead of selecting the underlying session.
All existing actions keep their classes, labels and business callbacks.

Moving a session to a project stays inside the same menu. Entering the picker
focuses Back; returning to the action list focuses Move to project. The adapter's
optional `contentKey` / `focusTarget` contract handles view changes without
overriding the first/last-item opening behavior or moving focus after closure.
Project loading, retry, empty results and saving have visible states. Choosing a
project keeps the picker open until persistence succeeds, disables duplicate
choices while saving, and leaves a failed save available for retry.
Base UI keeps disabled menu items keyboard-focusable for discoverability; Enter
on a disabled project neither submits another update nor closes the picker.

Closing the menu or returning from the picker invalidates the local request
generation. Late responses can still update the shared project cache, but cannot
replace the action list or reopen a closed picker. Unmounting also invalidates
outstanding project-view responses.

With its final consumer migrated, `AnchoredMenu.tsx` and its unused collision /
roving-index helpers are removed. Their four geometry/navigation unit cases are
removed with the dead implementation; actual menu positioning and navigation
remain covered by browser tests against the shipped primitive. Product constants
and the enabled-item selector remain in `menuPrimitive.ts`.

The menu surface no longer declares absolute coordinates; Base UI's wrapper owns
positioning and stacking. The mobile archive spec checks that fixed positioning
layer while retaining visibility, sizing and real archive-request assertions.
The production graph contains no old menu module and no eager Base UI modules;
its static JavaScript closure is 332,381 gzip bytes, versus 333,009 before this
round. No server or schema changes are required. Nothing has been deployed.

Validation: frontend lint and production build passed. The `projectCache` and
`entryGraph` unit files passed five tests. Thirty-five focused browser cases
passed across the session-row, desktop/mobile archive, shared menu, sidebar,
organization and deferred-runtime suites. This includes nine new session-row
cases and a disabled-item activation check, run in focused batches. Desktop
light and phone dark menu/picker screenshots were inspected. The prior round's
uncommitted changes remain in the workspace together with this follow-up.

## Shared confirmation dialog (2026-10-19)

`FoundationDialog` now wraps Base UI Dialog for the shared confirmation surface.
The popup retains its `alertdialog` role, accessible title/description, existing
Socrates classes, button IDs, title-first focus and backdrop cancellation. Using
Dialog with an explicit role preserves that dismissal contract; Base UI's
AlertDialog primitive intentionally disables outside-press dismissal.
The legacy `showConfirm` / `closeConfirm` boundary still owns the boolean Promise
result and business callbacks. Base UI owns focus trapping, restoration, Escape
and exit lifecycle, replacing the confirmation's manual listeners and timers.
Long messages scroll within the viewport while both actions stay reachable.

The lightweight compatibility root subscribes at boot, but imports
`ConfirmDialogContent` and its primitive only on the first confirmation. Escape,
Tab or an outside pointer press during loading cancels the pending action; a late
module cannot reopen it or move focus. A rejected import also resolves as cancel.
Once loaded, the root stays mounted so exit motion can finish after the Promise
settles. Reopening during exit uses the next confirmation's content.

The shared legacy modal registry gains a `focusManaged` option. A primitive-owned
modal still contributes to shell inertness, but skips the old document-level Tab
trap. Closing a confirmation above Settings restores the parent focus and leaves
the shell inert until Settings closes. Other legacy modal behavior is unchanged.

The production graph keeps all Base UI modules outside the static closure, and
both menu/dialog import closures exclude editor, tldraw and Three.js vendors.
Static JavaScript is 332,437 gzip bytes (56 bytes above the prior round); linked
CSS is 208,091 gzip bytes. No server, schema or deployment changes are required.

Validation: frontend lint and production build passed, along with five focused
`modalA11y` / `entryGraph` unit tests and nineteen unique browser cases across
confirmation, app-mode lifecycle, deferred runtime, legacy focus trapping,
exam reset, plugin disconnect and re-explain flows. The eleven new confirmation
cases cover accessible naming, focus cycling/restoration, boolean results,
backdrop cancellation, nested legacy dialogs, interrupted loading, rejected
imports, exit/reopen, long content and desktop/phone motion. Desktop dark and
phone light screenshots were inspected. An existing re-explain spec targeted an
old standalone toolbar button; its failure snapshot and HEAD source confirmed
the action lives in More actions. The spec now follows that menu and awaits the
confirmation instead of racing the lazy load; both accept/cancel cases pass.
This follow-up and the preceding menu rounds remain uncommitted. Nothing has
been deployed.

## Message-action menu (2026-10-19)

`MessageOverflow` now uses `DeferredMenu` / `FoundationMenu` instead of a native
popover plus manual coordinates, focus selection and arrow-key handlers. The
message toolbar keeps its button, icons, surface classes and business actions.
The shared adapter adds start alignment for this surface while preserving the
existing end-aligned account and session menus. Placement, viewport collision,
typeahead, keyboard opening and dismissal now come from the shared primitive.
The message menu follows the adapter's six-pixel viewport gutter and uses the
same placement-aware entrance/exit motion.

Phone feedback items are included only at the existing 768px breakpoint, rather
than remaining hidden members of the desktop item collection. A media-query
subscription runs only while each menu is open, updating that collection on a
viewport change. Phone items retain 44px targets. The old native-popover
coordinates and competing animation origin are removed from the surface CSS.

The native-button menu-item adapter exposes button click events to its consumers,
matching the element it actually renders. Read aloud still receives that button,
the selected message text and message ID. Selecting an action closes the menu
and synchronously returns focus to the toolbar before the business callback,
matching the old `hidePopover()` handoff. This gives an immediately opened
confirmation a connected return-focus target instead of an exiting menu item.
The confirmation bridge captures that target synchronously when the open state
is published and passes it to Base UI as `finalFocus`. Capturing only when the
lazy popup mounts is too late: menu navigation can refocus its exiting item in
between. The bridge keeps the element outside the serializable snapshot and
ignores it if it has since been removed.

Compatibility specs now locate More actions by its accessible name and scope
menu items to the portalled menu. Their action and keyboard assertions remain.
Other sidebar popovers and remaining dialogs are still migration follow-ups.

The production static JavaScript closure is 332,320 gzip bytes, down 117 bytes
from the confirmation round; linked CSS is 208,068 gzip bytes, down 23 bytes.
Base UI remains outside the eager graph. No server, schema or deployment changes
are required; this round remains uncommitted with the preceding follow-ups.

Validation: frontend lint, production build and twenty-nine focused Playwright
cases passed. Eight new message-menu cases cover cold last-item opening,
typeahead, callback identity/native targets, responsive feedback navigation,
multiple message menus, Tab/outside dismissal, delayed-load cancellation,
confirmation handoff on both cold and warm opens, viewport bounds and motion.
The existing confirmation, re-explain, message-list, account-menu, session-menu,
unified-toolbar and deferred-runtime cases also passed after the focus fix.
The message-menu cases report no page or console errors. Desktop dark
(1440×900) and phone light (390×420) screenshots were inspected: both retain the
240px surface, and the short phone viewport keeps the last action reachable.
Tests use the repository's mocked APIs and Chromium at
`http://127.0.0.1:4173/`; Browser plugin not available, so the repository
Playwright workflow is the browser-validation path. Nothing has been deployed.
