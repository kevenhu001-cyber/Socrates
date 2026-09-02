# Frontend → Mobile Parity Map

Ground truth for the reverse-align plan (see [inherited-munching-book.md](../../../../../../Users/Jiacheng/.claude/plans/inherited-munching-book.md)). Each row maps a mobile Screen to its frontend counterpart (or to a frontend visual cluster that may not exist as a Screen per se). Every Phase 2 PR uses this table as its acceptance target.

## Conventions

- **Status legend**: ✅ matched · 🟡 partial — gap to close · 🔴 no current equivalent — new build
- **Frontend reference column**: paths are repo-relative to `frontend/`. `…js` is the legacy 10K-line `main.js` unless prefixed `src/`.
- **`alignment-budget` column**: rough estimate (1 / 2 / 3 = half-day / 1 day / 2-3 days) for an engineer familiar with the mobile codebase. These are *rough* — they swell once a modal ecosystem gets wired up.
- **`parity-test` column**: existing Playwright spec in `frontend/e2e/` that the mobile e2e must reproduce, or **NEW** when mobile needs to mint a new spec because frontend never had one.

## Screen parity (Phase 2)

| # | mobile Screen | Status | Frontend reference | alignment-budget | parity-test |
|---|---|---|---|---|---|
| 1 | [`NewChatScreen.tsx`](../../mobile/src/screens/NewChatScreen.tsx) | 🟡 | `src/ui/greeting.js` · `src/ui/homeIdeas.js` · `index.html` Home · `src/react/sidebar/Sidebar.tsx` | 3 | NEW (home / recent chats / model picker) |
| 2 | [`ChatScreen.tsx`](../../mobile/src/screens/ChatScreen.tsx) | 🟡 | `index.html` chat · `src/render/markdown.ts` · `src/ui/toolCards.js` · `src/ui/composerTools.js` | 2 (tool cards) + 3 (composer) | `frontend/e2e/chat-streaming.spec.mjs` |
| 3 | [`TutorScreen.tsx`](../../mobile/src/screens/TutorScreen.tsx) | 🟡 | `src/tutor/` · `src/tutorSocratic.js` · `index.html` tutor | 3 | NEW |
| 4 | [`RecentsScreen.tsx`](../../mobile/src/screens/RecentsScreen.tsx) (Library) | 🟡 | `src/ui/sidebar.js` · `src/react/sidebar/SessionList.tsx` | 2 | `frontend/e2e/session-list.spec.mjs` (if exists) |
| 5 | [`ProjectsScreen.tsx`](../../mobile/src/screens/ProjectsScreen.tsx) | 🟡 | `src/ui/projects.js` · sidebar 项 | 2 | NEW |
| 6 | [`ScheduledScreen.tsx`](../../mobile/src/screens/ScheduledScreen.tsx) | 🟡 | `src/ui/scheduled.js` · `index.html` | 2 | NEW |
| 7 | [`PluginsScreen.tsx`](../../mobile/src/screens/PluginsScreen.tsx) | 🟡 | `src/extensions/` · `src/react/extensions/` | 2 | NEW |
| 8 | [`ExamScreen.tsx`](../../mobile/src/screens/ExamScreen.tsx) | 🟡 | `src/ui/exam.js` · `src/react/exam/` | 3 | NEW (exam e2e still mostly manual) |
| 9 | [`SearchScreen.tsx`](../../mobile/src/screens/SearchScreen.tsx) | 🟡 | `src/ui/findInSession.js` · `src/react/find-in-session/` | 2 | NEW |
| 10 | [`KnowledgeScreen.tsx`](../../mobile/src/screens/KnowledgeScreen.tsx) | 🟡 | `src/kb/` 边界 / 记忆树 | 3 | NEW |
| 11 | [`MistakesScreen.tsx`](../../mobile/src/screens/MistakesScreen.tsx) | 🟡 | `src/ui/mistakeBook.js` · `test/mistakeBook.test.mjs` | 2 | NEW |
| 12 | [`SettingsScreen.tsx`](../../mobile/src/screens/SettingsScreen.tsx) | 🟡 | `src/ui/settings.js` · `src/react/settings/` | 3 | `frontend/e2e/settings-modal.spec.mjs` |
| 13 | [`WorkspaceScreen.tsx`](../../mobile/src/screens/WorkspaceScreen.tsx) | 🔴 | `src/ui/canvas.js` · `src/react/canvas/` (Tiptap — DOM-bound) | 5 (mostly documentation + controlled WebView bridge) | NEW (`mobile/docs/workspace-tiptap.md`) |
| 14 | [`EmbeddedWebScreen.tsx`](../../mobile/src/screens/EmbeddedWebScreen.tsx) | ✅ | `index.html` skills · apiSettings iframe | 1 | keep existing |
| 15 | [`ShareScreen.tsx`](../../mobile/src/screens/ShareScreen.tsx) | 🔴 | `src/ui/share.js` · `src/react/shareModal/` | 1 — converts to a modal | NEW |
| 16 | [`ArtifactPreviewScreen.tsx`](../../mobile/src/screens/ArtifactPreviewScreen.tsx) | 🟡 | `src/render/viz.js` (source/reload/expand/fullscreen) | 3 | NEW |
| 17 | [`MoreScreen.tsx`](../../mobile/src/screens/MoreScreen.tsx) | 🔴 | `src/react/morePopover/` | 1 — converts to a popover | NEW |
| 18 | [`AuthScreen.tsx`](../../mobile/src/screens/AuthScreen.tsx) | 🟡 | `src/auth/` · `index.html` auth | 2 | `frontend/e2e/auth-*.spec.mjs` |

Total Screen-budget: ~ 33 engineer-days. Phase 2 reviews generally need 2 extra reviewers because the changes cut across most of the app shell.

## Component parity (Phase 1 / 2)

| Component | Status | Frontend reference | Notes |
|---|---|---|---|
| [`Composer.tsx`](../../mobile/src/components/Composer.tsx) | 🔴 | `src/ui/composerAutoHeight.js` · `src/ui/composerTools.js` | Drop the "separate mic" introduced in `d2216ab`; restore the attach + text + send layout that frontend uses. |
| [`AppDrawer.tsx`](../../mobile/src/components/AppDrawer.tsx) | 🔴 | `src/react/sidebar/Sidebar.tsx` (desktop) · `src/ui/sidebar.js` (mobile drawer) | Convert to `Sidebar.tsx`: persistent `<aside>` on `width ≥ 1080`, modal drawer otherwise. |
| [`AppHeader.tsx`](../../mobile/src/components/AppHeader.tsx) | 🟡 | `index.html` topbar · `src/ui/effortPicker.js` | Add model picker chip + profile button. |
| [`AnimatedPressable.tsx`](../../mobile/src/components/AnimatedPressable.tsx) | ✅ | — | Keep — velocity easing matches `easing.out`. |
| [`BrandMark.tsx`](../../mobile/src/components/BrandMark.tsx) | ✅ | — | Keep — already references the right asset. |
| [`MessageBubble.tsx`](../../mobile/src/components/MessageBubble.tsx) | 🟡 | `src/react/message-list/MessageItem.tsx` · `src/ui/toolCards.js` | Add `{cite}` superscript, drop chatGPT-style polish on the bubble radius. |
| [`Screen.tsx`](../../mobile/src/components/Screen.tsx) | 🟡 | `src/styles/layout/app-shell.css` | Convert to flex `app-shell` (sidebar slot + main slot + composer slot). |
| [`ToolCard.tsx`](../../mobile/src/components/ToolCard.tsx) | 🟡 | `src/ui/toolCards.js` | Match frontend's expanded/collapsed visuals + source/reload/expand/fullscreen row. |
| [`ArtifactWebView.tsx`](../../mobile/src/components/ArtifactWebView.tsx) | ✅ | `src/render/viz.js` iframe sandbox | Keep — already used for `viz` fences. |
| (new) `Sidebar.tsx` | 🔴 | `src/react/sidebar/Sidebar.tsx` | Phase 2.3 deliverable. |
| (new) `ModelPicker.tsx` | 🔴 | `src/ui/effortPicker.js` · `src/modelPicker.js` | Phase 2.2 deliverable. |
| (new) `DisplayPrefsPopover.tsx` | 🔴 | `src/ui/displayPrefs.js` | Phase 3.7 deliverable. |
| (new) `ToolRunPanel.tsx` | 🔴 | `src/react/thinking-panel/` | Phase 3.5 deliverable. |
| (new) `PromptTemplatePicker.tsx` | 🔴 | `src/react/promptTemplatesModal/` | Phase 3.6 deliverable. |

## Modal parity (Phase 3)

| Modal | Status | Frontend reference | mobile landing |
|---|---|---|---|
| CmdK | 🔴 | `src/react/cmdk/` · `src/ui/cmdK.js` | `mobile/src/modals/CmdKModal.tsx` (modal, not route) |
| SettingsOverlay | 🔴 | `src/react/settings/` | `mobile/src/modals/SettingsOverlay.tsx` |
| ConfirmDialog | 🔴 | `src/react/confirm/` | `mobile/src/modals/ConfirmDialog.tsx` |
| ShareModal | 🔴 | `src/react/shareModal/` | replaces `mobile/src/screens/ShareScreen.tsx` |
| ProfileModal | 🔴 | `src/react/profileModal/` | `mobile/src/modals/ProfileModal.tsx` |
| UsageModal | 🔴 | `src/react/usageModal/` | `mobile/src/modals/UsageModal.tsx` |
| PromptTemplatesModal | 🔴 | `src/react/promptTemplatesModal/` | `mobile/src/modals/PromptTemplatesModal.tsx` |
| StorageModal | 🔴 | `src/react/storageModal/` | `mobile/src/modals/StorageModal.tsx` |

Mount spec — every modal registers through `mobile/src/modals/index.tsx` so the gateway logic doesn't fork per surface. Same pattern as `frontend/src/react/lib/boot/specs.tsx`.

## Render parity (Phase 3)

| Render surface | Status | Reference | mobile landing |
|---|---|---|---|
| Markdown prose / lists / tables / quote / hr / code | ✅ | `frontend/src/render/markdown.ts` | already in `mobile/src/render/MarkdownView.tsx` |
| Code syntax highlight | 🟡 | `highlight.js` (frontend) | keep `react-native-syntax-highlighter` adoption deferred — see Risk 5 in `reversal-risks.md` |
| Math (KaTeX) | ✅ | katex | already via `RichBlock` |
| Mermaid | ✅ | mermaid | already via `RichBlock` |
| Plot / echarts | ✅ | echarts | already via `RichBlock` |
| tldraw | 🔴 | frontend uses `tldraw` directly | add second WebView integration in `RichBlock` |
| three.js | 🔴 | frontend uses `three` | add WebView in `RichBlock` |
| Citation `{cite index="..."}` | 🔴 | `frontend/src/render/markdown.ts` `formatMsg()` | add to `mobile/src/render/markdown.ts` |

## Boot parity

| Step | Status | Reference | mobile landing |
|---|---|---|---|
| Auth bootstrap (cached user + `authApi.me()`) | ✅ | `main.js` | `mobile/src/stores/appStore.ts` already matches |
| Network status + AppState resume | ✅ | `main.js` | matches via `subscribeToNetworkStatus` |
| Theme resolution (mode/preference) | 🔴 | `displayPrefs.js` | `ThemeProvider.tsx` currently locked to dark — see Phase 1.2 |
| Sidebar / composer / modal mount | 🟡 | `bootstrap.tsx` (`frontend/src/react/bootstrap.tsx`) | mobile uses RN Navigation; convert to side-by-side persistent sidebar at width ≥ 1080 |
| Pre-paint background | n/a | `index.html` Capacitor hook | n/a on RN; `mobile/app.json` controls splash instead |

## Per-Phase exit criteria (acceptance gates)

- **Phase 1 exit**: `mobile && @socrates/theme && frontend` all pass `npm run typecheck`. Detox e2e produces a screenshot per Screen that visually matches `frontend/.snapshot` at the same viewport.
- **Phase 2 exit**: every row above flipped to ✅ or 🟡 → 🟡 with a documented gap.
- **Phase 3 exit**: every row flipped to ✅. WorkspaceScreen round-trip in Detox e2e.
- **Phase 4 exit**: only one WebView point remains (`ArtifactWebView`); `embeddedBridge.test.ts` covers it.
- **Phase 5 exit**: `mobile npm run export:web` produces < 4 MB, Playwright desktop-pass is green.
- **Phase 6 exit**: PR removing `frontend/` is approved; CI mobile-only is the new merge gate.

## Open questions to resolve before Phase 1

1. Do we keep mobile's Inter / Newsreader / Noto Sans SC triple-font setup, or fold into `frontend`'s font fingerprint? (mobile today uses all three; matches except for the dropped Plus Jakarta Sans.)
2. Does the new theme keep an `action` blue chip for primary buttons? frontend doesn't have one — the gold accent plays that role. If we drop it, every `<AnimatedPressable action={...} />` needs a follow-up migration.
3. Does mobile keep the legacy `codexAgent` agent-side operations, or fold them into the larger unified chat flow that frontend is now heading toward?
