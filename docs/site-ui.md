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

## Homepage content

`site/index.html` and `site/zh/index.html` share `site/home-refresh.css`. It is the homepage's complete content stylesheet (the legacy `site.css` is not loaded). Shared navigation/footer still belong only to `chrome.css`; keep generic reset specificity below the shared chrome. The English display line uses the locally hosted Newsreader italic; Chinese keeps the same sans-serif family and varies weight instead of switching to an unrelated serif theme.

The hero is an editorial composition: proposition and primary action beside `site/media/socrates-probability-plate.svg`. This original static illustration shows a 10×10 point grid and a 1/100 annotation, not a research result or product screenshot. Keep its square proportions, meaningful alt text, eager/high-priority loading and single visual focus. On phones it follows the primary action. Do not restore the competing story rail, ambient particles, gradient fields or hover parallax; the old `home-aurora.js` is retired.

The product preview sits on a warm ground as one readable foreground sheet. Both desktop and phone retain all four messages, including the learner's correction, plus the two connected ideas. Never use a container-scaled miniature client. Keep the explicit illustrative/not-live caption and avoid fabricated profile names, fake inputs or live-status badges.

Keep the lower page varied: open reading lists, a landscape learning story, a text-first dark research band, and a second editorial learning scene. Do not restore repeated poster grids, duplicate a cover across sections, imply that illustrations are customer case studies, or advertise an unverified team edition. Homepage research titles and dates follow the research index and linked articles. Explicit CSS image heights/aspect ratios must override HTML intrinsic dimensions so phone images do not accidentally render as 941px-tall posters.

The native GET question form is a supporting destination at `#ask`, not the hero visual. `site/home-question.js` only enhances starters and Enter submission; native form encoding owns the handoff, including multiline text. Shift+Enter inserts a newline and IME confirmation must not submit. Starter buttons are hidden without JavaScript rather than left inert. Keep the visible app-handoff explanation and its `aria-describedby` association. Run `npm run test:site:home` for bilingual composition, breakpoint containment, chrome, motion/no-motion, no-JS and handoff coverage. These tests intentionally replace the old rail/first-viewport-preview geometry contracts. App navigation in tests is intercepted locally, never sent to a real account.

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
