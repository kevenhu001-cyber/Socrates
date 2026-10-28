# Local shadcn components

Generated from the official `@shadcn` registry with `style: base-nova` on
2026-10-28. `frontend/components.json` records the registry configuration.
The component sources belong to this application.

Application adaptations:

- Theme values are defined only in `src/styles/themes.css`. Tailwind color,
  type, weight and radius utilities project the existing product tokens.
- Tailwind omits Preflight, scans only `src/react`, and sits below unlayered
  product surface owners. The existing universal reset lives in the base
  layer so it cannot erase component padding.
- Buttons, inputs and separators render native DOM to preserve native form
  events/refs and the tested deferred Base UI boundary. Menus, dialogs,
  switches, tabs and toggle groups use Base UI where interaction requires it.
- `surface` variants and `DialogPopup`/`DropdownMenuPopup` let the established
  owners keep measured geometry, positioning, motion and focus restoration.
- Focus rings, control sizes, typography and overlay stacking use the
  product tokens. Components have no independent dark-mode palette.
- Native file/color/range/checkbox/radio inputs use `../NativeControl.tsx`;
  retained HTML uses the same theme and explicit `data-ui-legacy` slots.
- Settings/profile/admin actions now use semantic variants directly. Settings
  uses `DialogContent` with a retained portal so visited drafts survive closing.
  Its nested backdrop preserves the legacy overlay ID used by the inertness
  registry; Base UI owns focus, Escape and restoration.
- Select, Checkbox and RadioGroup supply real choice semantics. Checkbox uses
  a minus indicator for mixed selection. Choice controls keep a 44px hit area;
  their visual size remains compact. InputGroup owns one shared focus ring.
- `id` on Base UI switches/checkboxes targets their hidden native input for
  label association. Query the visible control by its accessible role/name.
- Overlay motion stays on the product ladder: no `animate-in`/`tw-animate-css`
  classes are used, stacking comes from `--ui-z-*`, and floating surfaces share
  `bg-popover` with `ring-foreground/10`. `sheet.tsx` mirrors the adapted
  `dialog.tsx` instead of the upstream source, which would overwrite its focus
  restoration and nested-overlay inertness.

The registry currently contains 29 sources (the original 23 plus Tooltip,
Sheet, ScrollArea, ContextMenu, Collapsible and Avatar added for the shell
migration). Feature migration is tracked in
`docs/plans/2026-10-28-shadcn-component-replacement.md` at the repository root;
geometry ownership for the shell is recorded in
`docs/adr/0024-shadcn-shell-geometry-ownership.md`.

Use semantic variants for new controls. For upstream updates, use
`npx shadcn@latest add <component> --dry-run` and `--diff` and merge these
adaptations; do not overwrite them wholesale.
