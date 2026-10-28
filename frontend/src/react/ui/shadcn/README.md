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

Use semantic variants for new controls. For upstream updates, use
`npx shadcn@latest add <component> --dry-run` and `--diff` and merge these
adaptations; do not overwrite them wholesale.
