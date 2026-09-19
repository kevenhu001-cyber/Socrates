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
| Home | greeting, mode switch, model/incognito, composer | implemented | phone P0 geometry fixed; desktop pending final diff | IME/safe area | 390×844, 412×915, 768×1024, 1440×900 screenshots |
| Drawer | nav, grouped sessions, search, account/footer | implemented | P1 token/geometry alignment in progress | Android back dismisses | phone/tablet screenshots + navigation test |
| Composer | attachments, effort, voice, send/stop, growth | implemented | disabled state and phone geometry aligned | native TextInput/SpeechRecognizer | empty/focused/multiline/streaming/IME tests |
| Composer tools | files, workflows, exam, skills, plugins | implemented | anchored above composer; no page scrim | native pickers | ordering, scroll, outside/Escape dismiss |
| Chat | streaming, stop/retry, attachments, message actions | implemented | partial | native scroll/IME | reducer fixtures + Android full turn |
| Tool runs | progress, result, error, artifacts, visualizations | implemented | partial | sandbox WebView islands | tool reducer + artifact bridge tests |
| Tool approval | command/path/risk, allow once/run, decline, interrupt | implemented client contract/UI | partial | system back | SSE fixture + API decision integration |
| Rich content | Markdown/table/code | native | close | — | render unit tests |
| Rich islands | KaTeX, Mermaid, ECharts, HTML artifact | controlled WebView | partial | WebView required | CSP/bridge/fallback tests |
| Tutor | diagnosis, boundary, teaching stages, chat | implemented | partial | deep link may enter dedicated screen | diagnosis→teaching Detox |
| Library | files/artifacts CRUD and preview | implemented | partial | native file/share sheets | loading/empty/data/error CRUD |
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
| Prompt templates | shared contract exists | missing native repository/manager | missing | Android storage adapter required | CRUD, shortcut selection, persistence |

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
