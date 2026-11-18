# Mobile reference update — 2026-11-18

The user supplied ten current ChatGPT mobile-web (dark) screenshots on
2026-11-18 and asked Socrates to follow them. This reference **supersedes** the
phone typography, composer, thinking/tool activity, drawer and settings
contracts in [the 2026-10-18 update](mobile-reference-2026-10-18.md) and
[the 2026-10-04 capture](mobile-reference-2026-10-04.md). The directory
geometry (36px search, 40px tabs, 60px file rows) from 2026-10-04 is not
covered by the new screenshots and stays in force.

The screenshots are 920×2048 with Android/Chrome chrome; the web surface is
about 393 CSS px wide (DPR ≈ 2.34). Compare the page at **393×852** after
excluding the browser area; do not recreate the browser bar. The photos carry
private account and history data and stay out of the repository. Production
keeps Socrates branding and real account, session and connector data.

## Screens captured

| # | Screen |
| --- | --- |
| 1 | Home, empty state |
| 2 | Home with the thinking-effort sheet open |
| 3 | Conversation: user bubble, Chinese answer with headings and KaTeX |
| 4 | Conversation: answer with an embedded figure card and the floating "•••" chip |
| 5 | Conversation: tool row "Searching 25 websites ⌄" and the disclaimer |
| 6 | Conversation: live "Thinking" |
| 7 | Native-app variant: "Stopped thinking ⌄", tool row with an app mark and "Skip", compact follow-up field |
| 8 | Main sidebar drawer |
| 9 | Settings drawer |
| 10 | Settings → Account detail page |

## Colours (sampled)

| Role | Reference | Socrates token |
| --- | --- | --- |
| Page | `#000000` | `--ui-bg-page` (dark theme; the surface-ladder guard keeps its own rungs) |
| Composer field | `#1a1a1a` | `colors.card` / composer frame |
| Header segment / selected segment | `#1b1b1b` / `#252525` | mode switch |
| Popover / card | `#2b2b2b`; "Thinking effort" pill `#333` | `--ui-bg-dialog`, `fillPressed` |
| User bubble | `#2a3e71` (navy), white text | existing user bubble |
| Send / voice disc | `#3f67c7`, full strength even when empty; slider `#4d81ef` | `colors.action` |
| Drawer selected row | `#1a1a1a`, ~12px corner; rules `#262626` | `--ui-bg-field`, `--ui-radius-md` |
| Secondary text / activity text | `#aeaeae` / ~`#8e8e8e` | `--ui-text-secondary` / `--ui-text-tertiary` |
| Figure card | ~`#333` hairline, ~24px corner, no fill | visualization card |

## Typography

- System sans throughout (no serif, no bundled Latin UI face). `uiFont.sans`
  in `packages/theme/src/ui.ts` is now the platform stack
  (`ui-sans-serif, -apple-system, system-ui, …, "PingFang SC", …, "Noto Sans SC"`);
  Geist Mono stays for code. Noto Sans SC remains the last named fallback so
  CJK punctuation keeps full-width metrics (`check-cjk-punctuation-fonts`).
- Answer prose 16px on a 1.6 pitch (25.6px), paragraphs ~16px apart; section
  headings ~18px bold with generous space above.
- Home greeting ~26–28px regular, centred at ~43% of the page.
- Settings detail title 28px regular, subtitle ~16–18px secondary.
- Drawer items ~16px with 20px line icons on a ~36–40px pitch.

## Surface contract

| Surface | Contract | Owner |
| --- | --- | --- |
| Header (home) | Sidebar glyph, centred Chat/Tutor segment, trailing temporary-chat (incognito) glyph. **No model chip on phones** — the composer's effort control opens the model/effort popover | `react/topbar/TopBar.tsx`, `polish/mobile-shell.css` |
| Header (conversation) | Sidebar glyph, new-chat glyph, bold title | `react/topbar/TopBar.tsx` |
| Composer | `#1a1a1a` box, ~30px corner, placeholder row then `+` · effort text "Medium ⌄" · mic · blue disc (stop square while streaming) | `packages/ui/src/composer/*`, `parity/composer-unified.css` |
| Effort sheet | `#2b2b2b` rounded card, centred "High ›" heading leading back to the model list, three-stop slider; the trigger becomes a filled "Thinking effort ⌄" pill while open | `chat-configuration/ChatConfigurationPanels.tsx`, `polish/overlays.css` |
| Above the composer | 13px centred disclaimer "Socrates can make mistakes. Check important info." at the latest message; a round "•••" chip (page colour, hairline) that scrolls to the latest message once the reader scrolls away | `react/composer-input/ComposerOverhead.tsx`, `parity/composer-unified.css` |
| User turn | Right-aligned navy pill (~24px corner); copy/share/edit icons always visible beneath it | `components/chat.css` |
| Assistant turn | No bubble, full-width prose | `components/chat.css` |
| Thinking (live) | Plain gray body-size caption "Thinking" / "思考中" with a text shimmer; no card, spinner, icon tile, elapsed counter or trailing ellipsis | `packages/ui/src/turn/ThinkingSurface.tsx`, `features/thinking-activity.css` |
| Thinking (settled) | One gray line "Thought for 6s ⌄" / "已思考 6 秒"; the chevron points down closed and up open; expanding shows the steps | `react/tool-run/TurnActivitySurface.tsx`, `packages/ui/src/turn/parts.tsx` |
| Tool row | Gray single line + chevron ("Searching 25 websites ⌄"); built-in tools have no icon, connected apps keep their mark | `TurnActivitySurface.tsx` |
| Drawer | ~65% width, page-colour, product wordmark 20px bold, search + collapse glyphs, selected "New chat" row, nav items, Projects / Recents groups, recents rows with pin then ⋯, account block at the bottom | `polish/mobile-sidebar.css` |
| Settings index | Page-colour drawer, full pill search on a hairline, flat rows (20px glyph, 16px label, no tile, no description, no chevron) on a 40px pitch; current row on the field fill with a 12px corner | `polish/overlays.css` |
| Settings detail | Page-colour sheet, 28px regular title + secondary subtitle, gray group label, flat rows (label left, value right) on hairline rules, no card | `polish/overlays.css` |

## Not yet matched (known gaps)

- Native-app-only details from screenshot 7 ("Skip" on a tool row, circular
  header buttons) are not adopted; the web reference is the target.
- The drawer's "Projects" / "Recents" group headers with filter/edit glyphs
  and the settings drawer's "← Back to app" row are not yet reproduced.
- The page stays on the theme's darkest ladder rung rather than pure `#000`,
  because `check-surface-ladder` forbids pure black.

## Verification

`e2e/reference-ui-visual.spec.mjs`, `e2e/mobile-*.spec.mjs`,
`e2e/thinking-*.spec.mjs`, `e2e/turn-activity.spec.mjs` and
`e2e/topbar-model-switcher.spec.mjs` assert this contract at phone width.
