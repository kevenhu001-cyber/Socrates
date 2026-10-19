# ADR 0017: Lobe-aligned design foundation

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
4. Introduce Lobe/Base UI primitives behind Socrates adapters, starting with menu / popover / modal infrastructure. **In progress:** the account menu now uses `@base-ui/react` through `FoundationMenu`; session/organization menus still use `AnchoredMenu`, and popovers/dialogs remain follow-up work.
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

Next migrate organization/session menus, including selected radio items and the
project-picker view, before replacing the older `AnchoredMenu` implementation.
Popover and modal migration remain separate steps. No server, schema or
deployment changes are required.

Validation: frontend lint and production build passed; the focused
`foundationTokens` / `menuPrimitive` unit files passed all six tests.
`anchored-menu-focus` / `theme-system` passed nine browser tests, and
`sidebar-nav` passed fourteen. Light, dark and phone screenshots were inspected.
The theme spec also fixes a foundation-commit assertion that expected literal
`var(...)` strings from `getComputedStyle()`: it now compares resolved aliases
against the canonical palette while retaining the exact color assertions.

Bundle follow-up: the production graph currently retains 136 Base UI modules
in the eager sidebar dependency graph. Review this startup cost before extending
the migration to more primitives; the account-menu dependency is not lazy yet.
These changes have not been committed or deployed.
