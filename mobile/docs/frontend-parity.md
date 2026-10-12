# Web → Expo Android parity matrix

This file records the current, executable parity contract. The Vite app is the
end-user reference; Android may differ only where the platform requires safe
areas, system back, permissions, notifications, haptics, or system sharing.

The machine-readable source is [`parity-manifest.json`](./parity-manifest.json).
Run `npm run check:parity` whenever navigation, overlays, translations, or the
Web UI changes. The check reads the real navigator, mounted components, source
translation calls, and latest commit touching `frontend/`; this document alone
is never evidence of parity.

| Surface | Feature | State | Visual | Platform exception | Acceptance |
|---|---|---|---|---|---|
| Auth | email/password, code, OAuth handoff, guest mode | implemented | partial | native secure storage/browser handoff | Android auth Detox + error/offline states |
| Home | greeting, mode switch, model/incognito, composer, upload/write/web-search quick actions | implemented | quick-action row and phone composer source geometry match the current Web structure; 390×844 Expo Web proxy captured in dark/light; Android device screenshots still pending | IME/safe area | 390×844, 412×915, 768×1024, 1440×900 screenshots |
| Drawer | nav, grouped sessions, search, account/footer | implemented | search filters recent chat title/topic; panel is 300dp capped and search row is 40dp. P1 token/geometry alignment remains pending device comparison | Android back dismisses | phone/tablet screenshots + navigation test |
| Composer | attachments, effort, voice, send/stop, growth | implemented | phone composer keeps the Web two-row geometry before and after focus; IME movement remains on the existing `adjustResize`/`KeyboardStickyView` path. appStore enforces the 6-attachment turn cap and native picker checks the Web 25 MiB/file limit; images are resized/re-encoded and uploaded to `/api/files`, with small inline data and server `fileId` pointers for `read_attachment`. Android device screenshots and IME animation frames remain pending | native TextInput/SpeechRecognizer | empty/focused/multiline/streaming/IME tests |
| Composer tools | files, workflows, exam, skills, plugins | implemented | anchored above composer; no page scrim | native pickers | ordering, scroll, outside/Escape dismiss |
| Chat | streaming, stop/retry, attachments, message actions | implemented | partial | native scroll/IME | reducer fixtures + Android full turn |
| Tool runs | progress, result, error, artifacts, visualizations, Explore stages, code/Bash live preview | implemented | partial; server `agent_step` frames are adapted in mobile and rendered on the matching tool card; native visual diff pending | sandbox WebView islands | SSE/reducer fixtures + artifact bridge + Android visual check |
| Tool approval | allow/decline/interrupt | intentionally unavailable for the current mobile run API | the server advertises `approvalPolicy: 'never'` and does not emit approval frames; do not surface unsupported decisions | — | server capability contract + read-only tool lifecycle tests |
| Rich content | Markdown/table/code | native | close | — | render unit tests |
| Rich islands | KaTeX, Mermaid, ECharts, HTML artifact | controlled WebView | partial | WebView required | CSP/bridge/fallback tests |
| Tutor | diagnosis, boundary, teaching stages, chat | implemented | partial | deep link may enter dedicated screen | diagnosis→teaching Detox |
| Library | mixed files/artifacts, collection/type filters, search, list/grid, upload, CRUD and preview | implemented | phone header, toolbar, filters, glyph colors and row density follow current Web CSS; 390×844 proxy exercised list/grid/type filtering. Android implements a 2-column grid, while current Web source toggles the grid state but has no `.library-list.view-grid` layout rule; native device visual diff remains pending | native file/share sheets | loading/empty/data/error CRUD |
| Creations | image generation/edit/list; assistant create/edit/delete | implemented | native Images/Assistants page uses the verified server creation endpoints; visual parity/device review remains pending | image provider/model availability and native image rendering | mocked API interaction tests + Android visual check |
| Projects | filters and CRUD | implemented | close, P1 spacing remains | — | CRUD + visual matrix |
| Scheduled | templates, filters and CRUD | implemented | close, P1 hierarchy remains | notifications | CRUD + visual matrix |
| Plugins | directory/connect/manage | implemented | partial | OAuth browser handoff | connect/error/refresh states |
| Exam | generate, answer, grade, retry | implemented | partial | — | full exam Detox |
| Knowledge | graph/list/details/notes | implemented | partial | graph island allowed | data/empty/error and note save |
| Mistakes | filters, resolve/reopen/delete/redo | implemented | partial | — | CRUD + redo flow |
| Search | global search | implemented | partial | hardware keyboard shortcut | empty/data/error + navigation |
| In-chat find | current conversation only | implemented | close | Ctrl/⌘F on hardware keyboard | next/previous/close |
| CmdK | global nav/session/theme/settings commands | mounted and reachable | partial | Ctrl/⌘K plus drawer trigger | keyboard, touch, Android back |
| Settings/display/profile/usage/storage/share | fields and actions | implemented | partial | complex phone UI may be full-screen native | overlay registration + state tests |
| Prompt templates | native manager, local persistence and account sync | implemented | mobile uses the cursor-paginated `/api/prompts` contract after sign-in, retaining local-first fallback; visual/device review remains pending | Android secure storage | CRUD, shortcut selection, persistence, pagination and offline fallback |

## Controlled WebView registry

Only the entries in `parity-manifest.json` are allowed. Product pages may not
fall back to a full-page WebView. Every entry declares its routes, bridge
version, CSP policy, and native error fallback.

## Release gate

- Viewports: 390×844, 412×915, 768×1024, 1440×900.
- Locales: English and Chinese. Themes: dark and light.
- States: loading, empty, data, error, offline, streaming, complete.
- Android emulator or device screenshots are authoritative; Expo Web is only
  a fast rendering proxy.
- Main geometry tolerance is 4dp and type tolerance is 1dp.
- Raw translation keys, unreachable overlays, misleading enabled controls,
  unregistered routes/WebViews, stale Web baselines, and open Jest handles are
  release-blocking failures.
