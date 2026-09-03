# Socrates Android release APK — local build (P0 parity pre-flight)

**Date:** 2026-09-03
**Workflow:** local `mobile/android/gradlew :app:assembleRelease`
**Profile:** Release (R8 minification enabled)
**Java:** OpenJDK 17.0.20
**Gradle wrapper:** 9.3.1
**Android SDK:** platform-tools + `android-35` + `build-tools;35.0.0` + `ndk;27.1.12297006`
**RN Architectures:** `arm64-v8a,armeabi-v7a,x86,x86_64`

## Pre-flight P0 fixes bundled in this build

Mobile ↔ frontend 1:1 alignment work landed in `mobile/` before this build (see
[`mobile/docs/ui-gap-audit.md`](../mobile/docs/ui-gap-audit.md) for the full
audit). Items shipped in the APK that addresses P0 gaps flagged by the audit:

### Screens

- **ChatScreen** — bubble geometry now mirrors frontend (user radius `20→24`,
  padding `9/18`, max-width `90%`); streaming indicator is a 14px rotating ring
  (`frontend/.thinking-spinner` `ringSpin .9s`); reasoning card uses
  `reasoningBg/reasoningFg` tokens; attachment chip uses the canonical chip
  shape; message toolbar is 28×28 `gap:2`; in-session find uses `<mark>`-style
  accent highlight on user/assistant text.
- **MistakesScreen** — danger-tint card (`hsl(0 60% 12%/.35)` background,
  3px danger left border), three-state filter bar (all / unresolved /
  resolved), per-row `Redo` button, sidebar badge via appStore count.
- **RecentsScreen** — filter chips for chats/uploads/created, time-grouped
  headers, hairline-only rows, 38×38 圆盘 icons, inline 600ms confirm bar.
- **NewChatScreen** — `greeting` Newsreader 32px, max-width 36rem, top padding
  scaled to viewport, idea cards use `surfaceRaised` chip style, AI starters
  fade in once `fetchAiStarters` resolves.
- **MoreScreen** — now exposes the full seven-item More popover (Plugins,
  Exam, Skills, Settings, Display, Shortcuts, Signout) per frontend's
  `MorePopover.tsx`; profile summary card matches `.profile-header`.
- **ExamScreen** — `.exam-form-grid3` 720px max-width layout, `.exam-form-eyebrow`
  kicker, option letters with 3px radius, 48px score display, explanation block.
- **ProjectsScreen / ScheduledScreen / PluginsScreen** — header chrome
  matches `.spaces-title` uppercase tracking; row geometry matches
  `padding:8/10 radius:7`.
- **AuthScreen** — `.auth-card` 420px radius 18 + `.auth-gate` SVG grid.
- **WorkspaceScreen** — stays as the workspace *list* (the Tiptap canvas is a
  planned follow-up under a tracked sub-roadmap; see audit §1.13).

### Components

- **`AnimatedPressable`** — accepts `scale` (e.g. `.88` / `.92`) and
  `restingScale` (e.g. `1.05` for the active send button) per frontend
  `:active scale(...)` ladder; `disabledOpacity` mirrors
  `:disabled { opacity:.3–.6 }`; `focusRing` paints the global
  `button:focus-visible { outline: 2px solid accent/.85 }` ring for keyboard
  focus on web/TV builds. The mobile spring model stays (no CSS-equivalent
  on native touch) but the values per component now match the web ladder.
- **`Composer`** — focus border animates from `border-300/.24` to
  `accent/.45` over the canonical 0.34s glide; `contentWidth` comes from
  displayPrefs (was hard-coded 620); send button idle = `bg-300 + text-400`,
  active = `accent + oncolor-100`, scale `0.92`. The pre-align dead
  `micBtn` / `VoiceWaveBars` is removed (STT is not wired on mobile yet).
- **`MessageBubble`** — radius 24 / padding 9-18 / max-width 90% (was 20);
  reasoning card uses the canonical 1px / `reasoningBg` style; reasoning
  text is 12/18 mono; attachment chip uses 14px radius / 3/10/3/3 padding /
  28px icon pad (was 8 / 10/6 / 16px); streaming indicator replaced with a
  spinning 14px ring; toolbar mirrors `.msg-toolbar-btn` 28×28.
- **`ToolCard`** — radius 14 (was 4); tool name 12/600; output panel
  11px mono radius 8 max-height 280; meta line `.agent-tool-input` style;
  running spinner aligned to 12px size.
- **`ComposerToolsMenu`** — 232px popover with `slideUp .2s` curve, 100ms
  pre-roll removed.

### Modals / overlays

- **`ShareModal`** — replaces the former `ShareScreen` route with a
  `90% max-width:400 radius:16 padding:24/20/20` modal, `slideUp .2s
  cubic-bezier(.16,1,.3,1)`, copy link + native share; mounted at the App
  root via `shareModal.open({url, title})`.
- **`UsageOverlay`** — `maxWidth 480 → 720`, border 0.5px, period tabs in
  the wrapped pill (`surfaceRaised` + active `surfaceHover`).
- **`ConfirmDialog`** — shadow `0 8px 32px`, slideUp `.15s`
  `cubic-bezier(.16,1,.3,1)`; danger surface matches `hsl(0 60% 15%)`.
- **`ProfileOverlay`** — modal with avatar / language toggle / web-search
  toggle / response textarea / about textarea / prompt templates link /
  clear cache / API settings link / sign-out + danger zone.
- **`StorageOverlay`** — modal 560px wide, `bg-200` rows with hairline
  border, archived list with per-row Restore/Delete (was local estimate).
- **`Toast` / `ToastHost`** — new themed toast (success/info/warning/error)
  replacing native `Alert.alert`; right-side or bottom-center dock;
  `slideUp .3s var(--ease-out)`. Mounted at the App root.
- **`Skeleton`** — 6px radius / `bg-200` fill / 2s opacity pulse (frontend
  `.shimmer` / `.shimmer-line`).
- **`CmdKPalette`** — modal `.cmd-k-modal` 640px, scrim `.55 + blur(4px)`,
  panel offset `min(18vh,140px)`, full keyboard navigation.

### Tokens / motion / interaction

- **Color** — `background / surface / surfaceRaised` align with frontend
  `--bg-100 / --bg-200 / --bg-000`; `brand` hue `33°` matches frontend
  rendered value; `success / danger` use the rendered literal hues.
- **Spacing / radius** — full ladder aligned (`xxs2/xs4/sm8/md12/lg16/xl24/xxl32`
  and `none0/sm4/md8/lg12/pill999`).
- **Motion** — `easing.out = cubic-bezier(.16,1,.3,1)` and
  `easing.spring` are now used in Composer focus glide, modal slideUp,
  toast slide, reasoning chevron.
- **Display prefs** — `fontScale:1.125`, steps `[1,1.125,1.25,1.375]`, width
  steps `[.85,1,1.3,1.7]`, accent presets `[35,160,210,270,330,40]`, bg
  picker fallback `#212121 / #ffffff`. Body fontSize honors `fontScale`.

## Build artifacts

| Artifact | Path | Size | SHA-256 |
|---|---|---|---|
| APK | `mobile/dist/socrates-android-2.0.1.apk` | 157 713 778 B | `57c85a62a5ed87057c5bf1a826de3a31f2d9736ee635a25c1e4dbfa7e58a3eda` |
| SHA256 | `mobile/dist/socrates-android-2.0.1.apk.sha256` | 69 B | — |

Signing certificate DN: `CN=Socrates Mobile, OU=TopoDrive, O=TopoDrive, L=Beijing, ST=Beijing, C=CN`.

The keystore (`mobile/release.keystore`, RSA-2048, 10 000-day validity) is
generated locally and **not** committed (added to `.gitignore`). The Gradle
plugin `mobile/plugins/withReleaseSigning.js` looks up
`ANDROID_KEYSTORE_PATH / ANDROID_KEYSTORE_PASSWORD / ANDROID_KEY_ALIAS /
ANDROID_KEY_PASSWORD` from the environment. With no keystore env set, the
release build falls back to the debug signing config (the same fallback the
production workflow uses for non-signing local runs).

## Reproducing

```bash
cd mobile
npm ci
npx expo prebuild --platform android --clean --no-install

# Local release build with the keystore:
export ANDROID_KEYSTORE_PATH="$(pwd)/release.keystore"
export ANDROID_KEYSTORE_PASSWORD='socrates123456'
export ANDROID_KEY_ALIAS='socrates-release'
export ANDROID_KEY_PASSWORD='socrates123456'
cd android
NODE_ENV=production ./gradlew :app:assembleRelease :app:bundleRelease \
  --no-daemon -PreactNativeArchitectures=arm64-v8a,armeabi-v7a,x86,x86_64

# Verify
java -jar "$ANDROID_HOME/build-tools/35.0.0/lib/apksigner.jar" verify \
  --print-certs app/build/outputs/apk/release/app-release.apk
cd .. && npm run verify:apk -- dist/socrates-android-2.0.1.apk
```

## CI (official release path)

`.github/workflows/build-apk.yml` builds the same APK on `ubuntu-latest`
with the canonical toolchain. Trigger via:

```bash
gh workflow run build-apk.yml \
  --ref <branch> \
  -f build_profile=release \
  -f run_verification=true
gh run watch
```

The workflow requires the four keystore secrets in the repository
(`ANDROID_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PASSWORD`,
`ANDROID_KEY_ALIAS`, `ANDROID_KEY_PASSWORD`). Encode the local keystore
with:

```bash
base64 -w0 mobile/release.keystore   # → ANDROID_KEYSTORE_BASE64
```

Pull Requests run `verify` only; ordinary `main` builds run debug
verification. The APK lands under
`socrates-android-release-2.0.1-<sha>` in the workflow run artifacts.

## Outstanding P0/P1 items (deferred — see ui-gap-audit.md)

- `SettingsOverlay` modal (currently `SettingsScreen` route — converted to
  a single-screen panel inside the screen to keep the route accessible).
- `PromptTemplatesModal` (frontend has it; mobile wiring pending backend
  `/api/prompt-templates` endpoint).
- Workspace Tiptap canvas rewrite (currently the Workspace route is the
  product navigation list — see audit §1.13).
- Reasoning click-to-expand drawer (mobile keeps the inline card for now).

These are tracked in [`mobile/docs/ui-gap-audit.md`](../mobile/docs/ui-gap-audit.md)
§1.12 / §3.9 / §1.13 / §5.5.
