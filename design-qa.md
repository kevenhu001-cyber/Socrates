# Socrates research, principles, learning, and news — design QA

## Scope and source boundary

- Visual references supplied by the user:
  - `C:\Users\Jiacheng\AppData\Local\Temp\codex-clipboard-33c46f86-c93c-4096-9451-136b953e3237.png` — dark research-network treatment.
  - `C:\Users\Jiacheng\AppData\Local\Temp\codex-clipboard-4d2b9c0f-c86b-49db-92c7-0c0ecb6abf31.png` — policy page hierarchy and four-column editorial grid.
  - `C:\Users\Jiacheng\AppData\Local\Temp\codex-clipboard-0935dcaf-f6a3-40fb-aa49-b34d72c494bf.png` — newsroom contact rail and media/list split.
  - `C:\Users\Jiacheng\AppData\Local\Temp\codex-clipboard-20ec28d7-8076-42ee-8303-4a6cd4de83aa.png` — research page two-column opening and team grid.
  - `C:\Users\Jiacheng\AppData\Local\Temp\codex-clipboard-ff35521f-679c-4801-a758-b122e2a18b9c.png` — academy-style centered opening and featured-course band.
- Public pages at `anthropic.com/research`, `anthropic.com/policy`, and `anthropic.com/learn` were visually inspected only to understand publicly visible layout, spacing, and responsive behavior. No third-party HTML, CSS, text, images, logos, or trademarks were copied into the project.
- The result is an original Socrates implementation: original routes, brand, product copy, editorial taxonomy, and generated image assets.

## Generated visual assets

- `site/media/socrates-research-network-v2.png` — dark archival research atlas with tactile paper, mineral-blue specimens, copper points, and quiet technical linework; used on Research.
- `site/media/socrates-principles-matrix-v2.png` — warm mineral-and-thread framework image; used on Principles.
- `site/media/socrates-learning-instrument-v2.png` — warm learning instrument with vellum, cobalt, metal, and copper details; used on Learn.

### Asset expansion and uniqueness pass

- `site/media/socrates-home-question-atlas-v1.png` — dark graphite atlas for the English home-stage.
- `site/media/socrates-home-dialogue-thread-v1.png` — copper-thread conversation installation for the home black band.
- `site/media/socrates-newsroom-archive-v1.png` — warm stoneware/vellum newsroom archive for News.
- `site/media/socrates-document-lens-v1.png` — drafting-sheet reading lens for Documents.
- `site/media/socrates-team-practice-kit-v1.png` — modular team practice kit for Pricing.
- `site/media/socrates-product-route-engine-v1.png` — graphite route object for Product.
- `site/media/socrates-question-orbit-v1.png` — blue-black paper/acrylic orbit for the Chinese home-stage.

All ten are original ImageGen outputs placed at their natural aspect ratio; none contains copied third-party branding or visible text.

## Asset uniqueness audit

- Every image reference in `site/**/*.html`, `site/**/*.css`, and `site/**/*.js` was enumerated after integration.
- The 15 rendered asset references each resolve to a different filename; no website image is used more than once.
- The original repeated assets were replaced in seven locations: English home-stage, English home black band, News, Documents, Pricing, Product, and Chinese home-stage.

## Implemented surfaces

| Surface | Original Socrates implementation | Reference-level structure preserved |
| --- | --- | --- |
| `site/index.html` | Dark Socrates research stage with an original central question, linked to Research, Principles, and Learn | Large dark research field, central focal copy, surrounding discovery paths |
| `site/research.html` | Research opening, thread links, five-topic grid, generated atlas, and editorial story rail | Wide two-column opening, one horizontal rule, five equal editorial columns, media-plus-rail feature |
| `site/policy.html` | Principles opening, four original learning principles, long-form manifesto, and matrix figure | Wide split opening, four-column article rhythm, ruled editorial sections |
| `site/learn.html` | Socrates Studio opening, featured learning-path band, two working course cards, and instrument image | Centered display heading, restrained serif intro, warm featured-course band, two-card action area |
| `site/announcements.html` | Newsroom contact rows, original news stories, generated media panel, and stacked story rail | Left news title/right contact rail, horizontal division, large rounded media panel beside editorial list |

## Fidelity ledger

| Comparison point | Result | Notes |
| --- | --- | --- |
| Header density | Passed | One quiet unframed masthead, left brand mark, narrow navigation, and one compact dark CTA. The Socrates nav uses direct links rather than copied third-party drop-down behavior. |
| Editorial grid proportion | Passed | Research holds a `5`-column content grid; Principles holds `4` columns; each uses one shared baseline and thin divider rules. |
| Display and body hierarchy | Passed | Oversized compact sans display titles pair with large, high-contrast serif supporting copy, retaining the supplied pages' editorial hierarchy while using original copy. |
| Roundedness | Passed | Radius is reserved for the dark CTA and large media/curriculum objects rather than added to every container. |
| Image treatment | Passed | Generated assets are high-detail, tactile, archival-tech objects matched to the warm ivory / charcoal / muted-blue / copper palette. |
| Responsive structure | Passed | Editorial grids compress to one column at small widths; source-like generous spacing scales rather than forcing narrow left rails. |

## Rendered evidence

- Local preview routes:
  - `http://127.0.0.1:4173/research.html`
  - `http://127.0.0.1:4173/policy.html`
  - `http://127.0.0.1:4173/learn.html`
  - `http://127.0.0.1:4173/announcements.html`
- Latest wide captures:
  - `C:\Users\Jiacheng\.codex\visualizations\2026\08\11\019fef26-cc9a-7980-b72b-c354bac99af0\socrates-research-desktop-v2-final.png`
  - `C:\Users\Jiacheng\.codex\visualizations\2026\08\11\019fef26-cc9a-7980-b72b-c354bac99af0\socrates-policy-desktop-v2-final.png`
  - `C:\Users\Jiacheng\.codex\visualizations\2026\08\11\019fef26-cc9a-7980-b72b-c354bac99af0\socrates-learn-desktop-v2-final.png`
  - `C:\Users\Jiacheng\.codex\visualizations\2026\08\11\019fef26-cc9a-7980-b72b-c354bac99af0\socrates-news-desktop-v2-final.png`
- Native-size Research comparison:
  - reference target: `2582 × 1628`
  - local capture: `C:\Users\Jiacheng\.codex\visualizations\2026\08\11\019fef26-cc9a-7980-b72b-c354bac99af0\socrates-research-native-v2-final.png`
  - local shell width: `2360px`; no horizontal overflow.
- Mobile menu capture:
  - `C:\Users\Jiacheng\.codex\visualizations\2026\08\11\019fef26-cc9a-7980-b72b-c354bac99af0\socrates-research-mobile-v2-final.png`

The user-supplied references and the latest local captures were opened together in one visual review pass. The comparison evaluated hierarchy, column proportion, line rhythm, spacing, CTA treatment, media crop, and type density rather than attempting to reproduce a third-party site pixel-for-pixel.

## Responsive, image, and interaction checks

- At `1440 × 1000`, Research, Principles, Learn, and News each have `body.scrollWidth === clientWidth`; all four generated images completed loading at a natural width of `1672px`.
- At `2582 × 1628`, Research maintained a `2360px` content shell with no overflow and preserved the reference-like wide split.
- At `390 × 844`, Research has no horizontal overflow. The menu changes `aria-expanded` from `false` to `true` and applies the open state to the header navigation.
- Selecting the visible mobile `Learn` link routes to `/learn.html`; its title is `Socrates — Learn`, its active navigation state is correct, and the generated image loads.
- In-app Browser console diagnostics for the smoke-tested local routes produced no warnings or errors.

## Implementation checks

- `node --check site/editorial.js` — passed.
- `git diff --check` — passed (line-ending notices only; no whitespace errors).
- Static preview request for `research.html` — passed with HTTP 200.

## Above-the-fold copy and intentional deviations

- The opening titles, supporting copy, taxonomy names, dates, routes, CTA label, and all article/course content are Socrates-original. No Anthropic wording, company name, product names, or editorial text remains in the implementation.
- The design deliberately reuses only broad visual grammar visible in the supplied references: warm paper ground, unframed navigation, generous editorial spacing, serif/sans contrast, restrained rules, limited rounded surfaces, and a dark research figure.
- The Socrates information architecture intentionally uses direct functional links (`Research`, `Principles`, `Learn`, `News`, `Company`) instead of recreating third-party drop-down menu contents.

final result: passed
