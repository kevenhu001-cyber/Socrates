# Mobile UI parity design QA

## Comparison target

- Source visual truth: live `frontend/` at commit `96624e46`, captured in `/tmp/socrates-ui-audit-20260904/02-frontend-home-clean.png`, `/tmp/socrates-ui-audit-20260904/06-frontend-drawer.png`, and `/tmp/socrates-ui-audit-20260904/10-frontend-settings.png`.
- Rendered implementation: Expo Web from `mobile/`, captured in `/tmp/socrates-ui-audit-20260904/08-mobile-home-after-pass2.png`, `/tmp/socrates-ui-audit-20260904/14-mobile-drawer-final.png`, and `/tmp/socrates-ui-audit-20260904/13-mobile-settings-final.png`.
- Viewport and density: all images are 390 × 844 pixels from a 390 × 844 CSS viewport at device scale factor 1. No density normalization was required.
- State: authenticated local development user, dark theme, empty landing screen; drawer open; API settings open with external API enabled and no configured provider.

## Full-view comparison evidence

The source and implementation captures were opened together for each state. The landing screen now has the same 64 px header, two circular edge actions, two compact idea rows, and bottom 64 px composer. The drawer uses the same 260 px rail, navigation order, search position, recent section, and pinned account footer. Settings now uses the same centered 90% / 440 px / 85% modal contract, API toggle, provider empty state, five two-column tone choices, and three-part action row.

## Focused region comparison evidence

- Header and composer: source geometry was measured from the live DOM before implementation (`44 × 44` header actions, `x=32`, `y=756`, `w=326`, `h=64` composer), then matched in the mobile styles.
- Drawer: the full-height 260 px rail, opaque surface, 36 px nav rows, search capsule, divider, and 64 px account footer were inspected in the paired captures.
- Settings: title/header, 36 × 20 toggle, provider empty box, tone cards, and action buttons were readable at 1:1 and inspected in the paired captures.

## Required fidelity surfaces

- Fonts and typography: both clients use the system/Inter-style sans stack at matching visible sizes and weights. Native/Web font rasterization differs slightly but does not change hierarchy or wrapping.
- Spacing and layout rhythm: primary frame sizes, margins, section order, composer geometry, drawer width, modal width/radius, gaps, and touch targets match. The settings card is about 16 px lower than the source due to platform text metrics; this is P3.
- Colors and visual tokens: black page, charcoal surfaces, low-alpha borders, muted text, gold active state, and dim scrim map to the same semantic roles.
- Image quality and asset fidelity: these states contain no raster product imagery. Visible icons use the existing Ionicons package; no placeholder images or handcrafted SVG assets were introduced.
- Copy and content: navigation and API settings copy matches the frontend information architecture. Captures use different active language preferences, so language itself was not treated as visual drift; both English and Chinese strings are present.
- Interaction and accessibility: drawer open/close, settings open/close, external API toggle, provider creation fields, tone selection, clear/cancel/save, composer attach/voice/send, and Canvas edit/done/iterate are wired. Browser console reported no errors during the interaction pass. Controls expose roles or accessibility labels and retain practical touch targets.

## Comparison history

1. Initial landing comparison found P1 extra mode/model controls, offline banner, greeting, incorrect idea hierarchy, and incorrect composer proportions. These were removed or resized; post-fix evidence is `08-mobile-home-after-pass2.png`.
2. Initial drawer comparison found P1 width, ordering, search placement, background, and footer differences. The rail was rebuilt around the frontend order and geometry; post-fix evidence is `14-mobile-drawer-final.png`.
3. Initial settings comparison found P1 full-screen preferences content instead of the frontend API settings modal. It was replaced with the API configuration structure. A second comparison found the wrong tone taxonomy and an extra built-in card; both were corrected. Post-fix evidence is `13-mobile-settings-final.png`.

## Findings

- [P3] Small platform rendering differences remain in icon glyph shapes and the settings modal's optical vertical position. These do not alter hierarchy, controls, or core geometry.
- Canvas is data-dependent and no live canvas response existed in the empty development account, so it was covered by an interaction unit test rather than a browser screenshot. The component uses the measured frontend Canvas structure and shared theme tokens.

## Implementation checklist

- [x] Match compact landing header, idea rows, and composer.
- [x] Match mobile drawer structure and footer.
- [x] Replace preferences route content with API settings modal content.
- [x] Implement and connect editable Canvas controls.
- [x] Verify typecheck, full Jest suite, browser interactions, console, and Expo Web export.

final result: passed
