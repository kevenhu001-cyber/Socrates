# chatgpt.com parity reference (captured 2026-09-28)

Captured over CDP from a headed Chrome 151 at 1440×900, logged-out chatgpt.com
(headless is blocked by Cloudflare). Raw data: `chatgpt-metrics.json`.
Re-capture: `node frontend/scripts/chatgpt-ref.mjs`; Socrates side:
`node frontend/scripts/parity-audit.mjs` (needs `node e2e/dist-server.mjs`).

## Reference values

| Surface | Light | Dark |
| --- | --- | --- |
| Page / sidebar bg | `#fcfcfc` / `#fcfcfc` | `#000` / `#000` |
| Sidebar right border | 1px `rgba(0,0,0,.1)` | 1px `rgba(255,255,255,.15)` |
| Text primary | `#0d0d0d` | `#fff` |
| Text secondary / placeholder | `#5d5d5d` / `#8f8f8f` | `#cdcdcd` / `#cdcdcd` |
| Sidebar item | 36px, radius 10, pad 6/10, icon 20; hover `#f3f3f3` | hover `#303030` |
| Sidebar width | 260 open / 52 rail | same |
| Top bar | 52px, pad 4/24; model switcher `ChatGPT ▾` 18px/600 | same |
| Composer | bg `#fff`, 1px `rgba(0,0,0,.2)`, radius 28, pad 10, single-row 52px; shadow `0 0 0 1px rgba(0,0,0,.04), 0 2px 8px rgba(0,0,0,.04), 0 4px 80px 8px rgba(0,0,0,.024)` | bg `#212121`, 1px `rgba(255,255,255,.2)`, shadow `inset 0 0 1px rgba(255,255,255,.2)` |
| Composer controls | + / mic / send: 36px visual in 44px hit area, round; send = `#0d0d0d` fill (light) / `#fff` fill (dark); disabled = 30% | same |
| Composer text | 16–17px / 24px | same |
| Tool chip (web search) | inside composer footer, after `+`; 14px, pad 0 12 0 8, pill; text `#3566f0`; hover bg `#edf3fe` text `#2451da`; leading icon swaps to × on hover | hover bg `#020562` text `#dae6fd` |
| Composer with chip | two rows: editor on top, footer row `+ · chip … mic · send`; placeholder changes to "Search the web" | same |
| Popover menu | 220w, radius 16, pad 6/0, bg `#fff`; shadow `0 8px 12px rgba(0,0,0,.08), 0 0 1px rgba(0,0,0,.62)` | bg `#303030`; shadow `0 8px 16px rgba(0,0,0,.32), inset 0 0 1px rgba(255,255,255,.2), 0 0 1px rgba(0,0,0,.62)` |
| Menu item | 36–44px, radius 10, pad 6/10, icon 20, 14–16px | same |
| Dialog | radius 20; shadow `0 24px 64px rgba(0,0,0,.22), 0 4px 16px rgba(0,0,0,.12)`; transition `opacity .16s, transform .16s` | same |
| Hero title | 24px / 28px / 400, centred above composer | same |
| Pill buttons | 14px / 600, pill, 1px `rgba(0,0,0,.2)` outline variant | outline `rgba(255,255,255,.2)` |
| Font | `ui-sans-serif, -apple-system, system-ui, "Segoe UI", Helvetica, Arial, sans-serif` | same |
| Motion | menus/dialogs fade + scale ~160ms ease-out; hover colour changes are instant-ish (~100ms) | same |

## Token mapping (Socrates)

`styles/themes.css` holds the ramp above as `--ui-*`; `styles/polish/tokens.css`
aliases `--cg-*`, `--chatgpt-*`, `--conversation-*` and the legacy HSL
channels onto it. Motion/type tokens live in `styles/tokens.css`
(`--ui-duration-hover` 100ms, `--ui-duration-overlay` 160ms,
`--ui-text-ui` 14px, `--ui-text-body` 16/28, `--ui-text-hero` 24px).
Deliberate deviations: light page is `#fff` (chatgpt.com logged-out: `#fcfcfc`)
so the `#fcfcfc` sidebar still reads as a separate band; dark tool-chip text is
lifted to `#81a6f9` for WCAG AA; the bundled Plus Jakarta Sans face is kept as
the single UI font instead of the system stack.

## Sidebar (styles/parity/sidebar.css)

Open: 260px, page-colored with hairline edge, 52px header (logo · new chat ·
panel toggle), 36px rows (radius `--ui-radius-row` 10px, 6/10 padding, 20px
icons, 6px icon gap), solid `--ui-bg-hover` wash, single-line history (title
only, row actions on hover). Collapsed: 52px icon rail (toggle, nav icons,
avatar); labels are visually hidden so icons keep accessible names; the
top-bar opener is hidden on desktop. Width animates over 200ms
(`prefers-reduced-motion` → none). Guarded by `e2e/sidebar-rail.spec.mjs`.

## Top bar (styles/parity/topbar.css)

52px borderless bar on the page color, 8px side padding. Top-left
`#topModelSwitcher` ("Socrates <model> ▾", 18px, 36px tall, radius 10, hover
wash) opens the shared chat-configuration popover (model · reasoning effort ·
speed · manage models) left-aligned 6px below it. The Chat/Tutor tabs are a
centered 36px segmented pill. Find / Share are 36px ghost icon buttons (share
stays icon-only — `sidebar-nav.spec` contract). The old icon-only
`#chatModelWrap` is hidden on desktop. Guarded by
`e2e/topbar-model-switcher.spec.mjs`.

## Transcript (styles/parity/transcript.css)

768px column (`--ui-content-chat`), prose 16px/28px at the default display
step (`--app-type-scale` = `--app-font-scale / 1.125`, so S/L/XL still
scale). Turn spacing 20px, 40px before a new user turn. User bubble
`--ui-bg-bubble`, radius 18 (`--ui-radius-bubble`), 10/16 padding, max 70%.
Headings 24/20/18px 600; lists 26px indent; quotes 2px left rule, not
italic; inline code 0.875em on `--ui-bg-chip`; code blocks one 16px-radius
card on `--ui-bg-raised` (light `#f9f9f9`, dark `#171717`) with a quiet 36px
header; tables hairline rows only; toolbar 32px ghost buttons.
Row behaviour kept from components/chat.css: `flex-shrink: 0` and the
desktop `content-visibility` perf rules.

## Socrates PC issues (audit 2026-09-28, 1440/1280/1024 × light/dark × zh/en)

P0 — broken layout
1. Composer: the always-visible `网页搜索` button (`#topicSearchToggleBtn`, `#chatSearchToggleBtn`) falls into the 44px `+` grid column and wraps one glyph per line; the grid grows an extra row so the pill is misaligned and, in chat, the label overflows below the viewport. Reproduced in 60/72 scenarios.
2. Effort trigger label `思考强度` / `Thinking` renders on two text lines (label + value spans) at 1440 and 1024.

P1 — visual deviation from ChatGPT
3. Dark palette is blue-tinted: sidebar `#0c0d10`, composer `#1a1d22`, user bubble `#22262d` (ChatGPT `#000` / `#212121` / `#303030`).
4. Light palette: sidebar `#f5f6f8` with no border (ChatGPT `#fcfcfc` + 1px border), text `#171a1f` (ChatGPT `#0d0d0d`).
5. Typography is mixed: body `Plus Jakarta Sans` 15.75px, transcript `Inter` 16.875px/27.8px, composer buttons `Inter`; hero 27px. ChatGPT uses one system stack, 16px body.
6. Top bar in a conversation is empty — no model switcher / title; home shows `聊天 / 辅导` tabs instead of the `Socrates ▾` switcher.
7. User bubble radius 15 (ChatGPT 18), transcript line-height 27.8 (ChatGPT 28 at 16px).
8. Settings modal uses native `<select>` and a different font; close button has a heavy square outline.
9. Cmd-K overlay blurs the whole page heavily; ChatGPT uses a flat dim scrim.

P2 — structure / debt
10. Composer grid template is redefined in 10 files (`restore/*`, `components/composer.css`, `legacy/13,16`) with ~2 700 `!important` in `restore/`.
