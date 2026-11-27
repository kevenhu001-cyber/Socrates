# Canonical Web surface replacement — 2026-11-27

Scope: Web only; no Kotlin Android changes, no duplicate legacy visual path. The November 26 supplied mobile references are the target; older desktop measurements remain provisional. Preserve existing app functionality, editor/session contracts and real accessibility semantics.

This change replaces the Web composer frame with a single normal-flow responsive grid and removes the obsolete 17px block padding (the old 52px capsule compensation after adoption of an 86px two-row frame). Mobile toolbar geometry now has one owner, with 22px glyphs and a 36px pitch. Overflow and branch icons use the same icon registry and renderer as the inline toolbar, instead of wrapping filled official paths in a second stroked SVG. No new CSS override layer.

Verification required: existing mobile-home 86px gate plus new frame/row geometry assertions; composer layout, attachment, keyboard, menu and streaming tests; message-toolbar touch/overflow and icon tests; frontend lint/typecheck/build and static bundle ceiling. No baseline weakening. Desktop and mobile screenshot review is still required; this is not a claim of pixel-perfect parity. Full remaining screens and tool card migration are follow-up scope.

## Phase 2 — top bar and model configuration

Replace duplicate header SVG trees with a single registered icon per state, remove their competing selectors, and centre the conversation title independently of the unequal action groups. The model configuration panel owns its complete surface material in menu.css, with a 16px radius, 1px separator, bounded viewport placement, official chevrons, real back direction, long-name wrapping and selected-option keyboard focus. Outside clicks keep their intended focus. Add a browser contract for geometry and keyboard navigation; run it with existing viewport-resize and IME tests. No new override layer. Reference values still require same-version screenshot comparison.

## Phase 3 — remaining shared surfaces

Replace the phone tool menu's tile and bottom-sheet implementation with the reference's floating flat list, reuse registered icons, eliminate duplicate menu paints and align viewport positioning before first paint. The current geometry test supersedes the old full-width drawer contract; screenshot baselines are intentionally not regenerated without a browser review. Activity rows fill the reading column, share the icon/text grid, use registered disclosure icons and leave agent plans unboxed. Mobile sidebar search has one geometry owner; settings navigation loses obsolete duplicate phone rules. Workspace controls use pill geometry, visible touch actions and primary label ink. Intelligence UI tables fill the answer width and description typography applies in all hosts. These are targeted source replacements, not a claim of full pixel parity. All visual snapshots, real-device checks and bundle budget remain required before merge.

## Phase 4 — dead declaration cleanup and budget diagnosis

Removed 38 superseded single-line declarations from repeated identical selectors under the same media context, preserving the final winning declarations and avoiding cross-context changes. Consolidated the menu frame and motion origin and removed obsolete theme-toggle hide rules. The last CI build passed lint and production compilation but measured 371085 gzip bytes of static JavaScript against the unchanged 360000-byte gate. The gate now prints its largest static chunks and retained first-party dependency paths on failure. No budget raised; JS reduction and screenshot verification remain open.

## Phase 5 — search ownership and production/test split

Merged the two command-palette rule sets into their final owner, retired the unused mobile menu row/component data and the one-rule mobile skin sheet. Main header actions use primary ink in the phone shell. Test state is now fetched only when the pre-navigation automation receiver is present, with fixture installation before bootstrap and a static graph assertion. The 360000-byte budget is unchanged. No measured gzip saving is claimed before CI.

## Phase 6 — retire unused animation probe and connector icon window bridge

Fixed the strict CSS import manifest to match the deleted mobile skin file (no debt allowances increased). Removed the unused composer fr-interpolation feature probe and its startup side effect. The connector icon pack remains demand-loaded, but navigation, composer and workspace now import a common loader directly; the window publication and gateway forwarding function are deleted. Regression assertion forbids the old global. Removed duplicate mobile header paint and model menu / scroll-to-bottom rules while preserving effective current values. Latest prior CI failed solely at the obsolete cascade manifest; new build and browser results are still required. The icon pack remains one lazy chunk; per-brand asset splitting is not claimed.

## Phase 7 — remove retired composer shape observer

The legacy has-plugin-chips, has-attachments and has-queue classes have no remaining CSS consumers. Removed their MutationObserver, startup hook and three component layout-effect call sites. Attachment row visibility is now derived directly from the attachment store by the React frame, and the redundant full-snapshot subscription is removed (the bridge emits a new array on publish). Retain the editor ResizeObserver and focus handling because they serve separate geometry and focus contracts. Inline the only remaining presentation effect in RichComposer; use the common icon registry for queued prompt actions. Added architecture regression checks against reintroducing the retired files and DOM visibility writes. No native Android changes. Actual browser and gzip results remain to be verified.

## Phase 8 — narrow core imports on the Web startup path

The previous completed build measured 370325 gzip bytes of static JavaScript. Its graph showed numerical execution modules reached through the broad core export barrel in Markdown and other ordinary chat helpers. Web Markdown, scaffold rendering, widget runtime, tutor state, quick actions, playback clock, and exam initial state now import four explicit domain entrypoints (learn, thinkModel, streamPlayer, examModel). Added matching package exports and Vite aliases before the root alias; public root exports remain intact for other clients. Intelligent UI normalization imports the canonical program normalizer directly rather than the full demonstration facade. No model validation or numerical algorithms removed, no changes to server validation, and no Android source changes. The complete synchronous model validator is still reachable through turn persistence; eliminating that remaining dependency requires a separately designed validation boundary, not a weaker validator. Static bundle size and runtime regression results are pending CI.

## Phase 9 — measured entry budget, sidebar ownership and viewport geometry

Phase 8 CI measured static JavaScript 354177 bytes gzip, down from 370325 (16148 bytes, 4.36%), passing the unchanged 360000-byte cap. Shared/server/security/agent/Android checks passed; frontend unit tests reported one failure, the sidebar history geometry radius ownership assertion. Moved the effective radius token into the canonical history row geometry block instead of weakening the test. Replaced the phone tools menu's zero-height fallback with visible-viewport-aware placement above, below, or within the viewport when neither edge fits; keep the reference 8px gap in the normal case. Added four pure geometry tests. Tool activity groups now stretch their child rows to the available width. Browser snapshots and current CI remain unverified.
