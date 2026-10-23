# Public site UI

`site/` is a standalone, plain-HTML marketing site, not the Vite SPA.

## Shared public chrome

- `scripts/sync-site-chrome.mjs` owns the localized header/footer markup and link inventories.
- `site/chrome.css` owns their styles, typography, widths, responsive navigation and footer layout.
- `site/chrome.js` owns menu focus, scroll locking, breakpoint transitions and native footer disclosures.
- Run `npm run site:sync` after changing the template or its asset version. It updates only the header, footer and shared asset references in public HTML; page content stays hand-authored.
- `npm run test:site` first checks synchronization, then runs focused Chromium tests against the static server. Install Chromium with `npx playwright install chromium` if needed.
- Account, profile, API-key and checkout screens are deliberately excluded: their app navigation and auth/billing flows remain independent.

Navigation and footer destinations exist in the HTML, with no runtime template fetch. Without JavaScript, mobile header navigation stays visible and footer groups remain expanded. With JavaScript, the menu supports Escape, outside click and focus containment; footer groups become native disclosures below 761px.

Keep the `.site-brand-label` exclusion in `site/locale.js`: a brand link to `/zh/` is not a language switch. Shared resource links carry `data-site-static` so OpenAPI and llms.txt are not rewritten to nonexistent translated paths.

## Public foundations and motion

`site/public.css` owns the public design tokens, shared container widths, legacy article font bridge, content motion styles and view transitions. It loads after each page's content sheets and before `chrome.css`. `data-site-public` scopes the bridge; account/billing/auth pages remain excluded. Content and navigation share a 1536px maximum shell, responsive gutters, local Geist Sans/Noto Sans SC, a neutral palette and 12px media corners.

`chrome.css` is the sole owner of public navigation and footer styling. The header is 80px on desktop and 64px below 761px; its wordmark, buttons and gutters are identical on home and inner pages. Keep homepage chrome overrides out of `home-refresh.css`. On phones the app link lives in the expanded menu utilities. Native anchor spacing uses `scroll-margin`; do not also add a global `scroll-padding` offset.

`site/motion.js` progressively enhances public pages with one-shot scroll entrances, staggered mobile-menu links, a scrolled header state and article reading progress. `public.css` owns image zoom, navigation underlines, button/link transitions and supported cross-document view transitions. Motion never gates content availability. System reduced-motion changes cancel running animations; no-JS and missing-IntersectionObserver paths retain all content. Avoid ambient particles, perpetual loops, scroll hijacking and pointer parallax.

## Homepage content

`site/index.html` and `site/zh/index.html` share `site/home-refresh.css`, which owns only homepage content. `site.css` is not loaded. The hero is a centered question entry, followed by a readable product illustration and a supporting probability card. Keep the original square illustration, all four preview messages, the learner's correction, connected ideas and the explicit non-interactive/not-live caption.

The lower page alternates a compact three-column news list, a landscape learning story, three image-led research links and a reversed learning scene. Use the existing assets with stable media ratios and preserve the article titles/dates from the research index. The learning scenes are editorial illustrations, not verified customer stories. There is one native question form at the top; the repeated bottom CTA was removed at the user's request and must remain absent.

`site/home-question.js` enhances starters and Enter submission; native GET encoding owns the app handoff. Shift+Enter inserts a newline and IME confirmation must not submit. The short localized hint cycles only while the field is empty, unfocused, visible and motion is enabled. Typing, focusing, hiding the page or enabling reduced motion stops the cycle. The hint is aria-hidden; the accessible label and app-handoff description remain stable. Starter buttons are hidden without JavaScript.

Run `npm run test:site:home` for bilingual composition, breakpoint containment, chrome, no-JS and handoff coverage; `npm run test:site:motion` checks real entrances, hover transforms, reduced-motion changes, hint pausing and reading progress. App handoffs are intercepted locally in tests.

## Product content

`site/product.html` and `site/zh/product.html` share `site/product.css` and the same section/anchor structure. Edit both translations together; the browser tests check structural parity, readable interface copy, deep links, first-viewport CTA placement and no-JS behavior. Keep their Markdown twins in sync.

The current session and feature panels are explicitly labeled **non-interactive illustrations**, not screenshots of a live account. Do not introduce fake functional controls, invented customer metrics or claims about plan entitlements. Replace illustrations with actual product captures only when representative, non-sensitive source material is available.

## Research and company content

`site/content.css` owns shared reading-page typography, buttons and the 1280px content grid. `site/research.css` owns the article directory; `site/company.css` owns the company narrative. Both page types have structurally equivalent English/Chinese HTML and Markdown twins, with local fonts rather than the legacy remote font sheets.

The research index is the primary `/research` experience while the collection has six notes. Titles, summaries, topics, publication dates and reading times appear before background information. Metadata follows the linked article (not an unrelated homepage promotion date). `site/research-index.js` progressively enhances the static list with topic buttons and announced result counts; controls are hidden without JavaScript, and all six links remain available. Preserve the `memory`, `explanation`, `practice`, `mapping` and `tutoring` topic anchors when editing the list.

The company page uses one explicitly labeled editorial illustration, not a claimed team portrait. Do not invent employee identities, teaching credentials, founding milestones, offices, funding or hiring claims. Add those only when the underlying information is verified. The page links to the existing product, research, announcements, principles, privacy and contact surfaces instead.

For a focused iteration, run `npm run test:site:content`. The combined `npm run test:site` also covers earlier home/product/chrome contracts.

## Preview and evidence

Use `node serve.cjs 8876` to preview locally. Save review screenshots under the gitignored `frontend/test-results/`, never among the published site assets. Inspect both English and Chinese at desktop and phone sizes after visual changes.
