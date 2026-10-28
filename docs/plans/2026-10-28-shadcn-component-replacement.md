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

## Verification

Results and remaining scope will be recorded after implementation.
