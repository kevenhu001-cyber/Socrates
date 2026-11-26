# Canonical Web surface replacement — 2026-11-27

Scope: Web only; no Kotlin Android changes, no duplicate legacy visual path. The November 26 supplied mobile references are the target; older desktop measurements remain provisional. Preserve existing app functionality, editor/session contracts and real accessibility semantics.

This change replaces the Web composer frame with a single normal-flow responsive grid and removes the obsolete 17px block padding (the old 52px capsule compensation after adoption of an 86px two-row frame). Mobile toolbar geometry now has one owner, with 22px glyphs and a 36px pitch. Overflow and branch icons use the same icon registry and renderer as the inline toolbar, instead of wrapping filled official paths in a second stroked SVG. No new CSS override layer.

Verification required: existing mobile-home 86px gate plus new frame/row geometry assertions; composer layout, attachment, keyboard, menu and streaming tests; message-toolbar touch/overflow and icon tests; frontend lint/typecheck/build and static bundle ceiling. No baseline weakening. Desktop and mobile screenshot review is still required; this is not a claim of pixel-perfect parity. Full remaining screens and tool card migration are follow-up scope.

## Phase 2 — top bar and model configuration

Replace duplicate header SVG trees with a single registered icon per state, remove their competing selectors, and centre the conversation title independently of the unequal action groups. The model configuration panel owns its complete surface material in menu.css, with a 16px radius, 1px separator, bounded viewport placement, official chevrons, real back direction, long-name wrapping and selected-option keyboard focus. Outside clicks keep their intended focus. Add a browser contract for geometry and keyboard navigation; run it with existing viewport-resize and IME tests. No new override layer. Reference values still require same-version screenshot comparison.

## Phase 3 — remaining shared surfaces

Replace the phone tool menu's tile and bottom-sheet implementation with the reference's floating flat list, reuse registered icons, eliminate duplicate menu paints and align viewport positioning before first paint. The current geometry test supersedes the old full-width drawer contract; screenshot baselines are intentionally not regenerated without a browser review. Activity rows fill the reading column, share the icon/text grid, use registered disclosure icons and leave agent plans unboxed. Mobile sidebar search has one geometry owner; settings navigation loses obsolete duplicate phone rules. Workspace controls use pill geometry, visible touch actions and primary label ink. Intelligence UI tables fill the answer width and description typography applies in all hosts. These are targeted source replacements, not a claim of full pixel parity. All visual snapshots, real-device checks and bundle budget remain required before merge.
