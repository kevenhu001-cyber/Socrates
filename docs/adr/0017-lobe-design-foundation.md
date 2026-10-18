# ADR 0017: Lobe-aligned design foundation

- **Status:** Accepted
- **Date:** 2026-10-18

## Context

Socrates accumulated a mature semantic token API (`--ui-*`, `@socrates/theme`) while its concrete neutral values were tuned primarily against ChatGPT visual parity. At the same time, the product increasingly needs reusable, accessible UI primitives for menus, popovers, dialogs, sheets, selects, switches, and related infrastructure.

Lobe UI v6 provides an AIGC-oriented component system and a documented default token model. Socrates can reuse that foundation without giving up its own chat, tutor, composer, thinking, tool, artifact, and Intelligent UI product surfaces.

## Decision

Socrates Design System v2 adopts the **default Lobe UI v6 neutral token values** as the canonical foundation for:

- layout, container, elevated, and secondary-container surfaces;
- primary / secondary / tertiary / disabled text roles;
- subtle / default / strong borders;
- backdrop masks;
- monochrome primary and standard semantic status colors.

Socrates keeps its existing semantic API as the compatibility boundary:

- Web components continue consuming `--ui-*` variables.
- Shared and native clients continue consuming `@socrates/theme`.
- Lobe CSS variables are bridged onto the same Socrates roles in `frontend/src/styles/themes.css`.

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

## Migration sequence

1. Cut the canonical palette over while retaining the `--ui-*` API.
2. Keep Web and Universal App theme packages in lockstep.
3. Introduce Lobe primitives behind Socrates adapters, starting with menu / popover / modal infrastructure.
4. Migrate base spacing / control metrics separately so mobile touch targets and visual-reference tests can be updated deliberately rather than incidentally.
5. Treat historical ChatGPT parity measurements as interaction references, not the canonical palette contract.

## Consequences

- Existing components change appearance without a wholesale component rewrite.
- Visual-reference tests that encoded the old ChatGPT-derived neutral values must be updated as part of this migration.
- Future Lobe primitives can share the same palette through the Lobe CSS-variable aliases instead of creating a second theme system.
- The Universal App receives the same foundation through `@socrates/theme`; it does not depend on React DOM or Lobe Web components.
