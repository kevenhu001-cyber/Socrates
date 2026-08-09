# Fix the Expo Android app + align it with the web frontend

## Diagnosis (reproduced, not guessed)

The Android build is **not** broken. I verified:

- `gradlew assembleDebug` → `BUILD SUCCESSFUL` (from `mobile/android/build-gradle.log`)
- `npx expo export --platform android` → bundles cleanly, 1441 modules, 3.5 MB hbc
- `npx jest` → 2 suites / 5 tests pass
- `@socrates/contracts` symlink resolves correctly

The app dies at **JS runtime, on launch**. I reproduced the exact crash by mounting
the provider under `react-test-renderer`:

```
TypeError: _reactNative.StatusBar.setStatusBarStyle is not a function
    at src/theme/ThemeProvider.tsx:74
```

`mobile/src/theme/ThemeProvider.tsx:74` calls `StatusBar.setStatusBarStyle(...)` on
**React Native's** `StatusBar`. That method does not exist there — RN only exposes the
static `setBarStyle`. `setStatusBarStyle` is a standalone named export of
`expo-status-bar` (confirmed in `expo-status-bar/build/StatusBar.d.ts`).

`ThemeProvider` wraps the entire app (`App.tsx:69`), and the throw happens in a mount
effect, so **every launch crashes before any screen renders**. `tsc --noEmit` flags this
as the project's single type error — the type checker was already telling us.

This is also why the failure looked like "the build is broken": the APK installs and
launches, then the JS bundle throws immediately.

## Root cause fix (the blocker)

**`mobile/src/theme/ThemeProvider.tsx`** — import the function from `expo-status-bar`
instead of calling it on RN's `StatusBar`:

- `import { setStatusBarStyle } from 'expo-status-bar'`
- drop `StatusBar` from the `react-native` import
- call `setStatusBarStyle(theme.colors.statusBarStyle, true)`
- wrap in try/catch so a status-bar failure can never again take down the whole app

This alone makes the app boot. Everything below is the alignment work requested.

## Secondary correctness fixes found while tracing

1. **`App.tsx` hardcodes `<StatusBar style="light" />`** (lines 64–65) — wrong in light
   mode, and it fights `ThemeProvider`. Drive it from the resolved theme instead.
2. **`App.tsx` boot spinner hardcodes `#101318` / `#d99a2b`** (line 72) — flashes dark
   even when the user's preference is light. Move inside the theme.
3. **Duplicate `Exam` route name** — registered both as a tab (`App.tsx:33`) and a stack
   screen (`App.tsx:46`). React Navigation resolves ambiguously; `NewChatScreen`'s
   `navigation.navigate('Exam')` targets the wrong one. Rename the stack route to
   `ExamSession`.
4. **`SettingsScreen` switches are dead** — `value={false}` / `onValueChange={() => undefined}`,
   and there is no theme control anywhere despite `useThemeController` existing and being
   fully implemented but never consumed. Wire real theme switching here.
5. **`appStore` mutates state in place** — `appendAssistant`/`appendReasoning`/`addToolEvent`
   mutate the `assistant` message object then spread the *parent*. The mutated message keeps
   its identity, so `React.memo`/`FlatList` row-level bailouts can miss streaming updates.
   Replace the last element immutably.
6. **Tool events are appended as separate rows, never correlated.** The server keys every
   `tool_use` / `tool_result` / `tool_progress` / `execution_start` frame by tool-call `id`
   (verified in `server/src/routes/chat/stream.ts:411,467,574`), and `tool_use` arrives as an
   **array**. `addToolEvent` ignores all of that: it pushes one synthetic entry per frame with
   `name: kind`, so the UI shows `tool_use`, `tool_result`, … as separate meaningless cards
   instead of one card per tool that fills in its result. Merge by `id` like the web client's
   `toolRuntime.ts` does.
7. **`ArtifactPreviewScreen` has no back affordance** — pushed as a stack screen with
   `headerShown: false` and renders no back control, so it is a dead end.
8. **`Screen` omits the bottom safe-area edge**, so the composer collides with the Android
   gesture bar on modern devices.

## UI/feature alignment with `frontend/`

Verified gaps against the web client:

| Area | Frontend | Mobile today |
|---|---|---|
| i18n | 701 en + 700 zh keys (`src/i18n.js`) | hardcoded English only |
| Markdown/LaTeX | `formatMsg`, sanitize, KaTeX, mermaid/echarts | raw `<Text>`, no markdown |
| Theme control | light/dark/system picker | `useThemeController` written but unused |
| Tool cards | status, output, per-tool merge | one card per raw SSE frame |

Scope I propose (highest value, matching existing mobile file conventions):

1. **Bilingual i18n** — add `mobile/src/i18n/index.ts` with a small `t()` + provider,
   reusing the **exact** zh/en strings already in `frontend/src/i18n.js` (`chat.placeholder`,
   `sidebar.nav.*`, `display.theme*`, `tool.status*`, `greeting.chat`, …) so wording matches
   the web app rather than inventing new copy. Persist choice via SecureStore beside the
   theme preference; default to device locale. Then replace hardcoded strings across the
   12 screens.
2. **Markdown + math rendering — hybrid** (your choice). The frontend's renderer is
   DOM/CSS-based and cannot be imported, so mobile gets its own two-tier renderer:
   - **Prose → native.** A small block/inline parser in `mobile/src/render/markdown.ts`
     (headings, bold/italic/strikethrough, inline code, links, lists, blockquotes, hr,
     fenced code, tables) rendering to `<Text>`/`<View>` with `theme.ts` tokens. Keeps
     text selectable, scrolling smooth, and memory flat — which matters because
     `ChatScreen` renders these inside a `FlatList`.
   - **Rich blocks → WebView, on demand only.** LaTeX (`$…$`, `$$…$$`), mermaid, and
     echarts blocks become a `RichBlock` that mounts a WebView **only for that block**,
     reusing the existing `ArtifactWebView` bridge pattern (including its `resize`
     message) for auto-height. A plain-text placeholder renders until the block is
     measured, so nothing jumps during streaming.
   - Streaming safety: unterminated fences/`$$` during streaming render as plain text
     until closed, so a half-written formula never spawns a WebView per keystroke.
   - This is the highest-effort option of the three; I'll keep the parser unit-tested
     rather than relying on visual checks.
3. **Theme picker** in `SettingsScreen` (light / dark / system) wired to the existing
   `useThemeController`, using the frontend's `display.theme*` labels.
4. **Palette reconciliation** — mobile's dark `#101318`/`#171a20` vs frontend's
   `#141414`/`#212121`; accent `#d99a2b` vs `#e9be53`. I'll align the tokens in
   `theme.ts` to the frontend's computed HSL values so the two clients look like one product.
5. **Real tool cards** — status (Running/Done/Failed) + collapsible output, fed by the
   corrected id-merged tool state, using `tool.status*` strings.

## Verification

- `npx tsc --noEmit` → must reach **zero** errors (currently 1)
- `npx jest` → existing 5 tests keep passing
- **New regression test** asserting `ThemeProvider` mounts without throwing — this is the
  bug that shipped, and nothing currently guards it
- New unit tests for: the i18n `t()` fallback, the tool-event id merge, and the markdown
  parser (inline/block cases, plus unterminated fence/`$$` during streaming)
- `npx expo export --platform android` → still bundles
- `gradlew assembleDebug` → still builds

I cannot verify on-device here (no emulator/attached device in this environment). I'll say
plainly what was machine-verified vs. what needs your device check.

## Notes / risks

- `mobile/` and `packages/` are **untracked** and `mobile/android/` is gitignored
  (`.gitignore:26-30`), so none of this is under version control yet. Worth deciding
  separately; I won't change tracking as part of this fix.
- `mobile/` is absent from `.github/workflows/`, so no CI gate would have caught the type
  error that caused this crash. Adding a `typecheck + test` job is a small, high-value
  follow-up — flagging rather than bundling it in.
- `react-native-reanimated` and `@react-navigation/drawer` are installed but unused.
