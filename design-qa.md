# Socrates marketing site - OpenAI-inspired editorial QA

## Source visual truth

- Reference route: `https://openai.com/` (captured in its current localized homepage state for visual research only).
- Reference desktop capture: `C:\Users\Jiacheng\.codex\visualizations\2026\08\10\019febb5-4ed6-7c73-abe3-ed12a944249c\marketing-qa\source-openai-home-1440.png`.
- Reference mobile capture: `C:\Users\Jiacheng\.codex\visualizations\2026\08\10\019febb5-4ed6-7c73-abe3-ed12a944249c\marketing-qa\source-openai-home-390.png`.
- The implementation uses Socrates copy, logo, original generated media, product previews, routes and business links. OpenAI brand assets, source code and site copy are not shipped.

## Implementation evidence

- Preview: `http://127.0.0.1:5174/`.
- Desktop homepage: `C:\Users\Jiacheng\.codex\visualizations\2026\08\10\019febb5-4ed6-7c73-abe3-ed12a944249c\marketing-qa\implementation-openai-home-1440-final.png`.
- Mobile homepage: `C:\Users\Jiacheng\.codex\visualizations\2026\08\10\019febb5-4ed6-7c73-abe3-ed12a944249c\marketing-qa\implementation-openai-home-390-final-latest.png`.
- Homepage editorial section: `C:\Users\Jiacheng\.codex\visualizations\2026\08\10\019febb5-4ed6-7c73-abe3-ed12a944249c\marketing-qa\implementation-openai-home-1440-scroll-final.png`.
- Pricing desktop: `C:\Users\Jiacheng\.codex\visualizations\2026\08\10\019febb5-4ed6-7c73-abe3-ed12a944249c\marketing-qa\implementation-openai-pricing-1440-final.png`.
- Refined homepage at the supplied reference size: `C:\Users\Jiacheng\.codex\visualizations\2026\08\10\019febb5-4ed6-7c73-abe3-ed12a944249c\marketing-qa\implementation-refined-home-1600.png`.
- Refined homepage mobile capture: `C:\Users\Jiacheng\.codex\visualizations\2026\08\10\019febb5-4ed6-7c73-abe3-ed12a944249c\marketing-qa\implementation-refined-home-390.png`.
- Refined Guide provider step: `C:\Users\Jiacheng\.codex\visualizations\2026\08\10\019febb5-4ed6-7c73-abe3-ed12a944249c\marketing-qa\implementation-refined-guide-step3-1600.png`.
- Refined Guide light CTA: `C:\Users\Jiacheng\.codex\visualizations\2026\08\10\019febb5-4ed6-7c73-abe3-ed12a944249c\marketing-qa\implementation-refined-guide-cta-1600.png`.
- Refined legal pages: `C:\Users\Jiacheng\.codex\visualizations\2026\08\10\019febb5-4ed6-7c73-abe3-ed12a944249c\marketing-qa\implementation-refined-terms-1600.png` and `C:\Users\Jiacheng\.codex\visualizations\2026\08\10\019febb5-4ed6-7c73-abe3-ed12a944249c\marketing-qa\implementation-refined-privacy-1600.png`.
- Product, account and earlier comparison captures remain in the same `marketing-qa` directory.
- CSS viewports: `1440 x 900`, `1024 x 768`, `390 x 844`.
- Browser capture pixels were `1425 x 891` at the desktop viewport and `375 x 812` at the mobile viewport because the browser scrollbar consumes layout width. Source and implementation used the same browser, viewport override and density.

## Comparison evidence

The source and implementation captures were reviewed at matching desktop and mobile sizes. The implementation follows the source rhythm: black canvas, compact top navigation, large quiet hero space, centered prompt surface, thin dividers, asymmetrical editorial media, low-contrast supporting copy and a restrained white primary CTA. Socrates content and original local learning imagery replace the source site's content and media.

Focused regions reviewed: homepage header, prompt and topic controls, editorial feature grid, updates feed, developer code tabs, product hero, pricing ladder, guide index and provider tabs, FAQ rows, mobile drawer, account shell and legal typography.

## Iteration history

1. The previous x.ai-style card system was replaced with the current editorial homepage composition: centered learning prompt, large feature image, asymmetric side stories, feed rows, developer code section and method list.
2. The shared public and legacy shells were normalized into one black, thin-border system with compact navigation, white primary actions, outlined login, larger whitespace and responsive drawer behavior.
3. Mobile comparison found the hero title wrapping too early. The title size, container width and hero spacing were adjusted so the prompt and first media surface keep the source-like vertical rhythm at 390px.
4. Final comparison found no actionable P0, P1 or P2 visual findings. Remaining differences are intentional Socrates-owned content and asset substitutions.
5. Reference-sized review tightened the homepage feature grid to `1238px` with an `858px / 365px` media split, added local mode icons, centered the side-card copy and removed the extra metadata from the visible card stack.
6. Guide provider controls now use dark pill states, the provider media frame is a full-width row, code lines no longer render as accidental vertical bars, and mobile Guide steps collapse to one readable column.
7. Guide's light CTA now has explicit dark heading and body colors. Terms and Privacy keep their spacious hero but constrain policy copy to a centered `920px` reading column with section dividers and `16px` desktop body text.

## Fidelity surfaces

- Typography: shared sans and mono tokens, large tight display headlines, muted secondary lines and compact utility labels.
- Layout: full-width editorial sections, 32px desktop gutters, 23px mobile gutters, 16px media corners, pill controls and generous vertical rhythm.
- Color: pure black canvas, neutral white CTA, opacity-based gray text and thin white borders. Accent color remains limited to the Socrates logo and state details.
- Media: local Socrates logo plus original local learning artwork in `site/media/`; no hotlinked source media.
- Copy and content: English and Chinese Socrates copy, pricing, account, API key, checkout, profile, privacy and terms routes remain intact. Textual site files contain no Unicode direction arrow characters.

## Interaction and accessibility checks

- English and Chinese public routes returned successfully through the static server, including `/zh/` directory index resolution.
- Homepage demo tabs, prompt submission, search panel, API code tabs and copy control were exercised.
- Guide provider tabs, numbered index, pricing monthly and annual toggle, and FAQ accordion were exercised.
- Account, API keys, checkout and profile routes rendered their existing loading, error or form states without changing fetch, payment or key-management behavior.
- Mobile navigation opens as a drawer, focuses the first link, closes with Escape, restores focus to the trigger and has no horizontal overflow.
- No horizontal overflow was found across English and Chinese public and protected routes at `1440`, `1024` or `390` CSS pixels.
- `prefers-reduced-motion` rules expose immediate reveal states and disable transitions and animations.
- Browser diagnostics contained no local-site warning or error entries during focused public-route checks. Static preview account requests can show the existing visible retry state when the backend is not running.
- A recursive `site/` scan found no U+2197 character and no Unicode direction arrow characters in textual site files.

## Verification

- `npm run lint` - passed.
- `npm run test:unit` - passed: 116 tests. WASM initialization fallback messages are expected in the Node test environment.
- `npm run build` - passed. Existing Vite chunk-size and dependency directive warnings remain informational.
- `node --check site/marketing.js` - passed.
- `node --check site/home.js` - passed.
- `git diff --check` - passed; only existing line-ending normalization warnings were reported.
- Focused screenshot QA at `1600 x 1000` and responsive probes at `390 x 844` - passed; homepage, Guide provider/CTA and English/Chinese legal shells had no horizontal overflow. Desktop provider media measured `1119px` wide with a two-column preview; mobile provider media measured `311px` wide with a single-column code screen.

final result: passed
