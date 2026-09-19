# Current Web ↔ Expo UI gap audit

Audit date: 2026-09-19. The detailed status contract lives in
[`frontend-parity.md`](./frontend-parity.md); executable registration lives in
[`parity-manifest.json`](./parity-manifest.json).

The previous September 3 audit was removed because it described deleted
screens, unreachable components as future work, and superseded CSS metrics.
Do not use historical prose as an acceptance baseline.

## Fixed in this pass (2026-09-19, Android device evidence)

- Android edge-to-edge is now reproducible: `plugins/withEdgeToEdge.js` writes
  `WindowCompat.setDecorFitsSystemWindows(window, false)` and the transparent /
  no-contrast system-bar theme items on every `expo prebuild`. The previous
  edits lived only in the gitignored `android/` tree, so CI images still laid the
  window out below an opaque status bar on Android 10–14. `android.edgeToEdgeEnabled`
  is gone from `app.json` — SDK 57 ignores it and warns.
- `Screen` no longer pads the top inset; `AppHeader` owns it. Screens without a
  header (`Tutor`, `Embedded`, `ArtifactPreview`) own it explicitly.
- Streaming cost: `BlockView` is memoised against a per-block content signature,
  so a flush rebuilds the growing tail instead of the whole reply; the inert
  `editValue` effect and the per-token `setEditValue` were removed; `CmdKPalette`
  reads `sessions` only while open; `cacheSession` stopped writing the unread
  `cached_messages` rows; `FlatList` style/empty props and the send callback are
  stable identities.
- Web search is now a real feature instead of an inert flag:
  `src/data/chat/webSearch.ts` ports the web pipeline (query rewrite →
  `/api/web-search` → `/api/fetch-batch` → relevance filter → `[Web research]`
  block), the flag defaults to off like the web, persists under
  `socrates-websearch`, is switchable in the profile sheet, and the header pill
  mirrors `.search-pill`.
- Profile sheet gained the web Preferences block: language segment, web-search
  switch, and the two custom-instruction textareas with the web's 600 ms debounced
  `PATCH /users/me`.
- Recents reads like the web row: same `Just now / 2h ago / 3d ago / 2w ago /
  mo ago` buckets, translated mode-dot labels, one lazily built date formatter.
- Drawer rows follow the web order (New chat, Library, Projects, Scheduled,
  Plugins, More). Knowledge and Mistakes stay out of the drawer because the web
  marks those tabs tutor-only.
- Icon-only controls that TalkBack announced as "button" now carry labels, and
  the message toolbar's labels are translated instead of hardcoded English.

## Remaining gaps

| Priority | Gap | Exit condition |
|---|---|---|
| P0 | Native Prompt Templates manager/repository is not implemented (`docs/frontend-parity.md`) | CRUD, persistence and Composer selection use the shared `PromptTemplate` contract |
| P0 | Tool approval server continuation is not verified end-to-end on a device | Decision endpoint, resumed run stream, rejection and interruption pass on Android |
| P0 | `teachingPlan` is stored but never rendered; the web shows title, done/total progress, per-subtopic status, current stage, depth counter and the practice-attempt chip (`frontend/src/tutorSocratic.js:519-600`) | Tutor screen renders the plan card and both chips |
| P1 | Consecutive tool calls are appended above the prose instead of folding into a group header and seating inline between text segments (`frontend/src/toolRunModel.ts:430-645`); no "Technical details" disclosure | Tool runs group and interleave like the web |
| P1 | Cmd+K searches local commands and recent sessions only; the web also queries `/api/search` for session and message hits with snippets (`frontend/src/ui/cmdK.js:134-232`) | Remote hits render with snippets and open at the match |
| P1 | Explore/agent workflow stepper (Plan/Search/Read/Report) is a chip label only; the streaming web search-progress log has no counterpart | Stepper and progress log render from tool events |
| P1 | Shortcuts sheet lists five hardcoded rows; the web cheatsheet has four sections and thirteen translated rows (`frontend/src/react/cheatsheet/Cheatsheet.tsx:21-43`) | Same sections, rows and copy |
| P1 | Exam generation is not gated on a usable provider and the generating card shows a fake `(i+1)/n` tick instead of real progress | Gate and progress match the web; no fabricated percentage |
| P1 | Home is missing the prompt-library row and the `/`-command overlay, and keeps the keyboard open on scroll (`frontend/src/main.js:7774-7802`, `Composer.tsx:75`) | Slash overlay and prompt row exist; scroll dismisses the keyboard |
| P1 | Knowledge graph renders an empty card with no message; its 14 controls need labels | Empty state and labels match the web |
| P1 | Profile sheet has no "Clear API settings" row; providers come from server config on mobile, so the web's local-key wipe has no target | Decide the mobile contract, then either implement or document the platform exception |
| P1 | Detox coverage is still shallow | Authentication through artifact flows run in CI without manual setup |

## Evidence

Android screenshots from the `Medium_Phone` emulator (API 37, 1080×2400 @420dpi,
390 dp wide) are the release evidence for this pass; the auth screen renders under
the status bar with no band. Fast proxy screenshots are written outside the
repository under `/tmp/socrates-align-*.png` and are diagnostic only.

