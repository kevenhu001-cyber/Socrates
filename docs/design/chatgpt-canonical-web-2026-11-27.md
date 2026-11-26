# Canonical Web surface replacement — 2026-11-27

Scope: Web only; no Kotlin Android changes, no duplicate legacy visual path. The November 26 supplied mobile references are the target; older desktop measurements remain provisional. Preserve existing app functionality, editor/session contracts and real accessibility semantics.

This change replaces the Web composer frame with a single normal-flow responsive grid and removes the obsolete 17px block padding (the old 52px capsule compensation after adoption of an 86px two-row frame). Mobile toolbar geometry now has one owner, with 22px glyphs and a 36px pitch. Overflow and branch icons use the same icon registry and renderer as the inline toolbar, instead of wrapping filled official paths in a second stroked SVG. No new CSS override layer.

Verification required: existing mobile-home 86px gate plus new frame/row geometry assertions; composer layout, attachment, keyboard, menu and streaming tests; message-toolbar touch/overflow and icon tests; frontend lint/typecheck/build and static bundle ceiling. No baseline weakening. Desktop and mobile screenshot review is still required; this is not a claim of pixel-perfect parity. Full remaining screens and tool card migration are follow-up scope.
