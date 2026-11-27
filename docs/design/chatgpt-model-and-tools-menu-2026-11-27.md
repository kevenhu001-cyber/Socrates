# ChatGPT-style model selector and "+" tools menu — 2026-11-27

Scope: the Web model picker (`#topModelSwitcher` → `.chat-config-pop`) and the
composer extensions menu (`#composerToolsBtn` → `#composerToolsMenu`). The
reference is ChatGPT's current menu grammar, not a pixel capture: one quiet
card, 44px rows, a leading 20px glyph, 14px labels, a trailing check for the
selected item, and no painted section headings.

## Model selector

- The 300px card opens from a 36px top-bar pill. The chevron flips while the
  menu is open; the card keeps the reference 16px corner and 6px gutter.
- A `Models` section label introduces the provider rows. Each row names the
  model and, when the server publishes capabilities, adds one capability line
  ("Thinks before answering", "Reasons, or answers instantly", "Adjustable
  reasoning effort", "Answers directly"). The provider's technical model id is
  no longer printed as a second line.
- The selected model is marked by the trailing check only; rows do not keep a
  selected fill, so the menu at rest reads as a list rather than a form.
- Reasoning effort, speed and manage-models rows share the same 44px rhythm,
  with 18px muted leading glyphs, the current value in tertiary ink and a
  chevron. A separator closes the list before the manage row.
- Phones now open the model list directly from the tools menu (`Model` row).
  The effort row still opens the effort panel. `openChatConfiguration` takes
  an explicit landing view instead of inferring it from the trigger id.
- On a phone the model card takes the same 12px side margins as the tools
  card (390px viewport → 366px), so it reads as a sheet instead of a 300px
  card pinned to the left edge.

## "+" tools menu

- Desktop width moves 240 → 300px, corner 12 → 20px, and the card keeps the
  same 6px gutter, hairline and menu shadow as the other floating surfaces.
- Rows are 44px with a 20px leading glyph in secondary ink. The muted 12px
  description line is shown on desktop too (it was phone-only), matching the
  supplied reference's "Library — Browse and search your files" pattern. The
  shortcut badge sits in the title row, so it no longer collides with or
  truncates the description.
- The card anchors to the composer frame, not the 44px `+` button: opening
  below the button used to cover the capsule's bottom edge, and opening above
  it in a conversation must clear the composer.
- Painted uppercase group headers (`ADD CONTEXT`, `SEARCH & RESEARCH`, …) are
  gone. The groups keep their `role="group"` and `aria-label`; visually they
  are separated by a hairline, which is the only section cue in the reference
  card.
- Connected apps keep a visible sentence-case section label, 32px brand marks
  and the trailing check. The phone layout keeps its 46px rows, 22px glyphs
  and 28px floating card; only the shared row grammar changed.
- The selected tool check uses primary ink rather than the action blue, so it
  matches the model picker's check and ChatGPT's monochrome menu state.

## Deliberate deviations

- The phone tools card remains the 2026-11-26 floating list (12px side
  margins, 28px radius, 46px rows); it does not adopt the desktop 44/20 values.
  Phone titles stay intact and only the inline description ellipsizes, so
  "Plugins" never renders as "Pl…".
- The model card stays 16px rather than 20px because it is a configuration
  menu, not the composer's content picker.
- No model descriptions are invented for providers whose capabilities are
  absent; those rows stay single-line.

## Verification

- `e2e/topbar-model-switcher.spec.mjs` — 36px pill, 300px card, `Models`
  label, direct phone model entry.
- `e2e/composer-tools-compat.spec.mjs` — 300px card, 20px corner, hidden group
  headers, 44px rows, action order incl. the new `model` row.
- `e2e/interface-icons.spec.mjs` — 20px desktop workflow glyphs.
- `e2e/motion-convergence.spec.mjs` — the tools card's 20px radius.
- `e2e/composer-tools-visual-baseline.spec.mjs` — regenerated 300px
  desktop and full-width phone snapshots for en/zh × dark/light after manual
  review.
- `npm run typecheck`, the CSS/attribute/composer guards, and a focused
  `vite build`.
