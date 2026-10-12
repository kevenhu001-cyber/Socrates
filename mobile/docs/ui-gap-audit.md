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

### Follow-up pass (interaction depth)

- The composer voice orb now opens an immersive voice-mode surface
  (`VoiceModeOverlay` in `Composer.tsx`): full-screen dark layer, volume-reactive
  orb, status/timer/live transcript, cancel/done actions, Android back support.
  It shares the `useVoiceInput` session with the mic button — it is still
  dictation, not full-duplex conversation.
- Long-pressing a message bubble opens the full ChatGPT-style action sheet
  (copy, read aloud, edit, regenerate/retry, helpful/not helpful, share,
  branch, re-explain, delete) instead of only the share/branch overflow. The
  toolbar's "more" button opens the same sheet, and toolbar buttons now carry
  `accessibilityRole="button"`.

### Follow-up pass (feature gaps)

- Prompt Templates now has a native manager: `SkillsScreen` ports the web
  "Skills & shortcuts" modal (built-in list, custom list with edit/delete,
  create/edit editor with the web's title/shortcut/uniqueness validation).
  Custom templates persist under the same `socrates-prompt-templates` key via
  `secureStorage`, merge into the slash palette live, and the `skills`
  embedded target now routes to the native screen from every entry point
  (More, composer menu, Cmd+K, bridge deep-links).
- `loadPreferences()` is finally called at startup — the flag store was
  written but never hydrated, so haptics prefs silently ignored storage.
- Knowledge graph controls carry `accessibilityLabel`s (snapshot button, node
  circles, section rows, confidence dots, note input/save, "Open in Tutor").

## Remaining gaps

| Priority | Gap | Exit condition |
|---|---|---|
| ~~P0~~ | ~~Native Prompt Templates manager/repository~~ — done: `SkillsScreen` + `prompts.ts` custom-template store (CRUD, `socrates-prompt-templates` persistence, live slash-palette merge) | — |
| — | Tool approval is intentionally unavailable for the current mobile run API: the server advertises `approvalPolicy: 'never'` and emits no approval frames; do not surface unsupported decisions | Revisit only if a supported backend approval policy, stream events, and decision endpoint are introduced |
| ~~P0~~ | ~~`teachingPlan` is stored but never rendered~~ — done: `TutorScreen` renders the plan card (title, done/total + %, per-subtopic status, live stage, 3-answer depth counter, practice-phase chip) | — |
| ~~P1~~ | ~~Consecutive tool calls are appended above the prose instead of folding into a group header~~ — done: `src/data/tools/turnLayout.ts` ports `toolRunModel.buildTurnLayout` (consecutive calls fold into a collapsible `ToolRunGroup` seated between prose segments) | — |
| ~~P1~~ | ~~Cmd+K searches local commands only~~ — done: `CmdKPalette` issues the same debounced `POST /api/search`, dedupes against local hits, renders snippet hints, and opens the session at the match | — |
| ~~P1~~ | ~~Explore/agent workflow stepper is only a chip~~ — done for the server Workspace Agent path: the mobile SSE adapter consumes actual `agent_step` frames, and `ToolCard` renders stage title/detail/status beside live tool progress; no client-invented steps | Android live-stream visual acceptance |
| P1 | Images/Assistants creation surface previously had no native page | `CreationsScreen` provides image list/create/edit and assistant list/create/edit/delete through verified server routes | Android visual check, provider-error state, image preview |
| P1 | Prompt Templates lacked account sync | `prompts.ts` now pages `/api/prompts?scope=mine`, pushes local-only items after authentication, adopts server IDs and keeps local cache on offline/guest errors | Android signed-in, pagination and offline acceptance |
| ~~P1~~ | ~~Shortcuts sheet lists five hardcoded rows~~ — done: `MoreScreen.tsx` ports the web cheatsheet 1:1 (four sections, thirteen translated rows, kbd badges) | — |
| ~~P1~~ | ~~Exam generation is not gated / fake `(i+1)/n` progress~~ — done: `ExamScreen` gates on a usable provider (`ProviderSetupGate`, web `exam.js:405-414`) and the bar tracks real `genDone/count` | — |
| ~~P1~~ | ~~Home missing `/`-command overlay and keyboard-dismiss-on-scroll~~ — done: slash palette exists on `NewChatScreen` and `keyboardDismissMode="on-drag"` is set on Home and Chat. The prompt-library row is intentionally absent — the SPA hides it under the final `chat-surface.css` layer | — |
| ~~P1~~ | ~~Knowledge graph controls lack labels~~ — done: empty state plus `accessibilityLabel`/`accessibilityState` on snapshot, node circles, section rows, confidence dots, note input/save and "Open in Tutor" | — |
| ~~P1~~ | ~~Profile sheet has no "Clear API settings" row~~ — the audit misread the web feature: it `DELETE`s each custom `/api-key` server-side, and `SettingsScreen.clear` already did the same. Added the missing piece — the web's `confirmClearSettings` confirm dialog before the wipe | — |
| P1 | Detox coverage is still shallow | Authentication through artifact flows run in CI without manual setup |

## Evidence

### Update 2026-10-04 (follow-up parity implementation)

- Native `CreationsScreen` is reachable from More and uses the authenticated server Images and Assistants APIs. Image creation is user-triggered only; this implementation did not invoke image generation during development.
- Composer images are downsampled/re-encoded on device when dimensions are available (GIF animation is preserved), persisted through the existing `/api/files` upload route, and only small images remain inline for the current turn. The mobile history adapter adds the server-recognized `fileId` pointer so `read_attachment` can resolve large images without changing shared core.
- Prompt Templates account sync is delayed until `authStatus === 'signedIn'`, avoiding a token-bootstrap race; cursor pagination is followed to completion, while local storage remains the immediate source of truth.
- Tool live preview now shows cumulative `code_interpreter`/`Code` source and Bash command input. Actual server `agent_step` frames are routed by a narrowly scoped mobile SSE adapter and merged into the same tool card.
- **Tool approval remains intentionally unavailable:** current server contract is `approvalPolicy: 'never'`; there is no approval event/decision flow to mirror. Do not show an approval-pending state unless the server adds that capability.
- The drawer already supports title/topic search; the 300dp panel and 40dp search row are source-aligned, but settings/drawer geometry and newly added screens still require Android device screenshot acceptance. This environment has no `adb`, emulator, or `/dev/kvm`.

Android screenshots from the `Medium_Phone` emulator (API 37, 1080×2400 @420dpi,
390 dp wide) are the release evidence for this pass; the auth screen renders under
the status bar with no band. Fast proxy screenshots are written outside the
repository under `/tmp/socrates-align-*.png` and are diagnostic only.
