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

Historical result: passed

## 2026-08-11 — original editorial-tech visual system refresh

### Source visual truth

- Primary selected art direction: `C:\Users\Jiacheng\.codex\generated_images\019fef26-cc9a-7980-b72b-c354bac99af0\exec-5d20eef1-e733-4c7c-a246-4a3d68f8f29a.png` (`1672 × 941`). It combines the chosen question-path, recall-cycle, and knowledge-topology concepts into one original Socrates visual system.
- The user-provided Anthropic screenshots remained high-level mood references only. No third-party artwork, source, logo, copy, or distinctive composition was copied.
- The implementation applies the selected system as one unique image per page/slot: question-to-understanding, dialogue, recall, knowledge mapping, policy guardrails, shared team learning, and contextual support each have a separate original asset.

### Rendered implementation evidence

- Local route: `http://127.0.0.1:4173/index.html`.
- Browser-rendered implementation capture: `C:\Users\Jiacheng\.codex\visualizations\2026\08\11\019fef26-cc9a-7980-b72b-c354bac99af0\04-home-hero-implementation.png`.
- Browser CSS viewport: `1280 × 720`; the in-app Browser emitted a `628 × 773` JPEG inspection capture despite the `.png` filename. The home stage measured `576 × 343.88` CSS pixels and rendered the `1672 × 941` master source without overflow.
- State: default home-page state, home-stage in view, menu closed. The comparison opened the raw source asset and browser-rendered implementation together in the same review pass. The source/implementation density difference was treated as a capture limitation rather than a fidelity issue; crop, placement, contrast, and hierarchy were judged at the rendered CSS size.
- Focused region: the generated source is a full-bleed hero asset, so the home-stage frame was the relevant focused region. Dedicated element screenshots are unavailable in the in-app Browser; the browser screenshot was scrolled to the stage and reviewed alongside the source asset.

### Asset map

| Surface | Original Socrates asset | Visual meaning |
| --- | --- | --- |
| English home hero | `socrates-home-question-atlas-v2.png` | ask → reason → recall → connect |
| English home dialogue band | `socrates-home-dialogue-thread-v2.png` | two ideas meet in a shared inquiry |
| Product journey | `socrates-product-reasoning-path-v2.png` | a question travels through evidence |
| Product recall feature | `socrates-product-recall-intervals-v2.png` | retrieval at useful intervals |
| Documents | `socrates-document-recall-cycle-v2.png` | durable review loop |
| Research | `socrates-research-knowledge-topology-v3.png` | connected research knowledge |
| News | `socrates-newsroom-signal-v2.png` | research becoming a shared signal |
| Pricing / teams | `socrates-team-topology-v2.png` | multiple contributors, one knowledge graph |
| Learn | `socrates-learning-practice-cycle-v3.png` | feedback-driven practice |
| Principles | `socrates-policy-guardrails-v3.png` | bounded, responsible exploration |
| Guide | `socrates-guide-question-lenses-v2.png` | multiple useful question lenses |
| About | `socrates-about-hard-question-v2.png` | patient investigation of a hard idea |
| Contact | `socrates-contact-context-signal-v2.png` | context resolving into a useful start |
| Chinese home | `socrates-question-orbit-v2.png` | learning insights orbiting a question |

### Browser and integrity checks

- Browser audited: `index.html`, `product.html`, `documents.html`, `research.html`, `announcements.html`, `pricing.html`, `learn.html`, `policy.html`, `guide.html`, `about.html`, `contact.html`, and `zh/index.html`.
- All audited page images completed with a non-zero natural size; no audited page had horizontal overflow; in-app Browser diagnostics returned `[]` for every route.
- The responsive menu changed `aria-expanded` from `false` → `true` → `false` in the default inspection viewport.
- `node --check site/editorial.js` passed.
- `git diff --check` passed (only Git CRLF notices; no whitespace errors).
- The image-reference audit across `site/**/*.html`, `site/**/*.css`, and `site/**/*.js` found 15 image references, each with a distinct filename, and every referenced asset exists.

### Required fidelity surfaces

**Findings**

- No actionable P0, P1, or P2 issues found in the refresh pass.
- Fonts and typography: existing sans-display / serif-body hierarchy remains intact. Home-stage overlay copy retains readable contrast over the new near-black art field; no wrapping or truncation regressed in the reviewed viewport.
- Spacing and layout rhythm: the existing editorial shell, 16:9 stage, dark split bands, and rounded media frames preserve their intended breathing room. Generated subjects were positioned with central or side-safe negative space so no key visual information collides with copy.
- Colors and visual tokens: every replacement conforms to the existing warm ivory, carbon, graphite, muted copper, and single cobalt accent system. The warm news/recall assets and dark research/policy assets deliberately alternate without losing family resemblance.
- Image quality and asset fidelity: all visible imagery is project-bound raster art with matched paper grain, high-resolution source dimensions, and no placeholder, CSS-drawn, SVG-drawn, watermark, or third-party visual artifacts. The product recall portrait is intentionally centre-cropped by the existing `ed-inline-feature` frame; its copper route and recall fragments remain visible in the rendered feature.
- Copy and content: the image subjects are tied directly to Socrates concepts (questioning, explanation, retrieval, connection, guardrails, and team learning). All site copy remains Socrates-original.

**Open Questions**

- None for the implemented visual system. Additional image directions can be created later without reusing any of the current assets.

**Implementation Checklist**

1. Confirm all 14 semantic image slots use the new original generated assets. Done.
2. Confirm every loaded image has a natural size and every audited route has no horizontal overflow. Done.
3. Confirm unique image references and static-script validity. Done.

**Follow-up Polish**

- [P3] If future desktop marketing captures are needed, take a larger in-app Browser viewport capture so type and image density can be reviewed at native desktop scale. This does not affect the current responsive render.

final result: passed

## 2026-08-12 — Anthropic-style information architecture pass

### Source visual truth

- Official reference pages: `https://www.anthropic.com/` and `https://www.anthropic.com/research`.
- Captured source evidence: `/tmp/anthropic-home-desktop.png`, `/tmp/anthropic-home-mobile.png`, `/tmp/anthropic-research-desktop.png`, and `/tmp/anthropic-research-mobile-retry.png`.
- The implementation keeps Socrates' own logo, copy, and original media. The reference is used for information architecture, spacing rhythm, editorial hierarchy, and interaction pattern—not for copied assets or text.

### Rendered implementation evidence

- Updated routes: `/index.html`, `/research.html`, `/research/memory-recall/`, and `/research/tutor-curiosity/`.
- Desktop evidence: `/tmp/updated-home-desktop.png`, `/tmp/updated-research-desktop.png`, `/tmp/updated-article-desktop.png`.
- Mobile evidence: `/tmp/updated-research-mobile.png`, `/tmp/updated-article-mobile.png`.
- Same-viewport comparison sheets: `/tmp/qa-home-comparison.png`, `/tmp/qa-research-comparison.png`, `/tmp/qa-research-mobile-comparison.png`.
- Viewports: desktop `1440 × 1000`, mobile `390 × 844`, device scale factor `1`; no horizontal overflow (`scrollWidth === clientWidth`) on tested home/research pages.

### Fidelity ledger

| Comparison point | Result | Notes |
| --- | --- | --- |
| Navigation density | Passed | One quiet masthead, text links, compact dark CTA, and a collapsed mobile menu. |
| Home information hierarchy | Passed | One statement, one large visual, one restrained latest-research ledger; removed the repeated portal/card layer. |
| Research information hierarchy | Passed | Research threads → team descriptions → featured entries → publication list → research coda. |
| Typography and spacing | Passed | Large sans display, serif explanatory copy, thin rules, generous page gutters, and one-column mobile collapse remain consistent with the source grammar. |
| Content and links | Passed | Six publication rows are searchable/filterable and route to full research notes; the missing tutoring article was added. |
| Responsive behavior | Passed | Desktop and mobile captures show no clipping or horizontal overflow; mobile menu opens with `aria-expanded="true"`. |

### Interaction checks

- Research filter `Memory` reduces the publication list from `6` to `1` visible row.
- Search term `pause` leaves `1` matching publication.
- Clicking the first publication routes to `/research/memory-recall/` and renders `The route back to an idea.`.
- Mobile menu opens with six links and a true expanded state.
- Internal links collected from the home, Research, and two article routes: `30` checked, `0` failures under the local static server.
- `node --check site/editorial.js` — passed; `git diff --check` — passed.

### Intentional deviations

- Socrates keeps its own warm-paper palette, wordmark, original research artwork, and original copy. This is intentional brand differentiation while adopting Anthropic's restrained page rhythm.
- The Research mobile capture uses Socrates' five learning threads rather than Anthropic's AI safety team names; the structure is parallel, not copied.

final result: passed

---

## 2026-08-12 — 全面修缮 + 1:1 对齐 anthropic.com（视觉/排版语法 + 信息架构）

### 范围与边界声明
- **仅 1:1 对齐 anthropic.com 的视觉语法（留白/栅格/字体层级/分隔线/卡片语言）与信息架构（栏目结构、列表节奏、导航层级）。**
- **内容（文案、标题、研究摘要、logo、图片）全部为 Socrates 自有原创**，未复制任何 anthropic 文本、商标、截图或独特构图（与既有逆向工程约束一致）。
- 参考页（仅用于理解结构/排版）：`/` `/research` `/news` `/policy`。

### 已落地改动
1. **URL 统一带 `.html`（方案A）**：全站正文/页脚/ledger 链接统一 `href="xxx.html"`；`zh/*` 改 `../xxx.html`；Research 子页 `../xxx` 保持；功能页（account/api-keys/checkout/profile）自链同步。生产 nginx 无需改动（与 `editorial.js` 重建导航一致）。
2. **修 Research footer 错误线程标签**：`memory-recall` 的 "Next in Memory →" 改为中性 "Next research note →"，6 篇 footer 互指正确。
3. **去 Research note 编号**：kicker 去掉 "· Research note NN"，仅留线程名（Memory / Explanation / Practice / Knowledge mapping / Tutoring）。
4. **清内联 style**：`learn.html`/`documents.html`/`policy.html` 的内联 `style` 提取为 `editorial.css` 新增类（`.ed-split-grid`、`.ed-split-heading`、`.ed-mt-*`、`.ed-lede-wide`、`.ed-feature-kicker`），HTML 内联全部删除。
5. **Library 链接去误导**：`documents.html` 交叉链接文案改为 "View product / View research / View principles / About Socrates / View news"；唯一真实文档 `guide.html` 保留 "Read the guide"。
6. **统一静态导航**：`documents.html`/`announcements.html` 无 JS 时手写导航与 `editorial.js` 的 6 项（Research/Principles/Learn/Library/News/Company/中文）顺序与文案一致（含"中文"与 `aria-current`）。
7. **1:1 IA 对齐**：Research/News/Library 列表统一 **Date / Category / Title** 三列节奏 + 分类 pill（`.ed-pill` 含色点）+ **Search** + **See more** 钩子 + 年份分组（`.ed-year-rule`）；News 加 press 联系 rail + Search 工具栏；Principles 保留原则卡网格 + 分节长文结构。
8. **排版美化 + 双端适配**：`.ed-article` 行宽改为 `min(720px,100%)`；正文 `clamp(18px,1.15vw+14px,21px)`/行高 1.62；`h2`→`clamp(24px,2.2vw,32px)`、`h3`→`clamp(20px,1.6vw,25px)` 拉开层级；`lede` 强化为带钴蓝左边线的摘要块；文章 byline 加线程 pill（`.ed-thread`）；**新增 620px 断点补强**（`.ed-article` / `.ed-news-item` / `.ed-publication-row` / `.ed-essay-row` 小屏收紧，双端无挤压/无溢出）。

### 验证
- `node --check site/editorial.js` — 通过。
- `git diff --check` — 通过（无空白错误）。
- 本地 `node serve.cjs` 路由抽检：`index.html` / `research.html` / `announcements.html` / `policy.html` / `documents.html` / `learn.html` / `research/memory-recall/` / `zh/index.html` / `product.html` 均 HTTP 200。
- 全站 grep：无残留 `style="` 内联、无残留裸页链接（`href="xxx"` 无扩展名）。

### 死 CSS 处理
- 经跨页确认：`marketing.css` 被 `zh/*.html` 引用、`home.css` 被 `marketing.css` 引入 → **二者均不可删除**，保留不动（不影响 `deploy.sh` 按扩展名拷贝）。

### 2026-08-12（补充）— 线上 URL 去除 .html 后缀（clean URLs）
- 用户要求浏览器地址栏不显示 `.html` 后缀。nginx `topodrive.top` 的 `location /` 已配置 `try_files $uri $uri.html $uri/ =404;`，服务端本就支持 clean URL。
- 因此将全站**站内链接改回无扩展名**（`href="research"`、`href="../research"`、`href="../../research"`、`product#knowledge-map` 锚点保留），由 nginx 自动补 `.html`；磁盘文件仍为 `.html`。
- 同步将 `editorial.js` 重建的导航项改为无扩展名（`key`/`href` 均去 `.html`），保证 masthead 与正文一致。
- 验证：`serve.cjs` 下 `/research` `/announcements` `/policy` `/documents` `/learn` `/product` `/zh/index` 均 200；生产 nginx `$uri.html` + `$uri/` 回退覆盖页面与 `research/<slug>/` 子目录。
