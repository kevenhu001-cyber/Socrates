# Socrates Capacitor Android app

This project wraps the Socrates web app in a native Android Capacitor
shell. The WebView loads the frontend **remotely** from the origin
configured in `capacitor.config.js` (`server.url`, default
`https://app.topodrive.top`). Because the page origin equals the API
origin, every relative `/api/*` call, the SSE/streaming chat, uploads,
and the cookie-based auth (SameSite=Lax) work exactly as in the
browser — no backend changes and no in-app URL rewriting needed.

The Vite build output is still synced into the APK assets (Capacitor
requires a `webDir`), but it is not served at runtime while
`server.url` is set.

## Build

Capacitor Android 7 requires Java 21. On this workspace, Android Studio's JBR
is the configured Java runtime and `C:\Android` contains the SDK.

```powershell
cd capacitor
$env:JAVA_HOME = 'C:\Program Files\Android\Android Studio\jbr'
$env:ANDROID_HOME = 'C:\Android'
$env:ANDROID_SDK_ROOT = 'C:\Android'
npm install            # first time only
npm run sync           # rebuild frontend + copy into android assets
npm run apk:debug      # produce app-debug.apk
```

On Linux/macOS replace `gradlew.bat` with `./gradlew`; the npm scripts
already use the platform-correct command.

The installable output is `android/app/build/outputs/apk/debug/app-debug.apk`.
For a distributable production build, configure a private signing key in the
Android project before running `npm run apk:release`.

## Updating the frontend

Use `npm run sync` in this directory. It runs the Vite production build
then copies the result into the Android app assets and regenerates the
native `assets/capacitor.config.json` from `capacitor.config.js`.
Always re-run it after changing `capacitor.config.js` — the APK reads
the *synced* copy, not the root config.

## Backend wiring

By default the APK targets `https://app.topodrive.top/` (the same origin the
web client uses). The frontend talks to relative `/api/v2/*` paths; since
the WebView is served from that same origin, nginx on the server side
rewrites `/api/v2/*` back to the Express API on `127.0.0.1:3037`. The APK
is therefore a drop-in replacement for the browser tab with no backend
changes needed.

To target a different backend at build time, set `SOCRATES_SERVER_URL`
(read by `capacitor.config.js`) before syncing, or use the wrapper
script which does it for you:

```powershell
# Staging
npm run apk:debug:staging      # SOCRATES_SERVER_URL=https://staging.topodrive.top

# Local dev — point the WebView at your laptop's backend
npm run apk:debug:local        # SOCRATES_SERVER_URL=http://10.0.2.2:3037
# (10.0.2.2 reaches the host from the Android emulator; on a real
#  device run `adb reverse tcp:3037 tcp:3037` and build with
#  $env:SOCRATES_SERVER_URL='http://localhost:3037'; npm run apk:debug)
```

Convenience scripts: `npm run apk:debug`, `npm run apk:debug:staging`,
`npm run apk:debug:local`, `npm run apk:release`, `npm run apk:release:staging`.
Each wraps frontend build + `cap sync` + the platform-correct gradle
wrapper (`scripts/apk.mjs`), so a single command produces a working APK.

## Status bar & keyboard avoidance

The web frontend already ships a sophisticated `visualViewport`-driven
keyboard handler (`frontend/src/ui/keyboardViewport.js`) that writes a
single CSS custom property `--keyboard-inset`. That same path runs
unchanged inside the Capacitor WebView, so the chat composer lifts above
the keyboard on Android with no extra code on the web side.

What Capacitor adds:

- **Status bar** — `StatusBar.overlaysWebView: false` pushes the WebView
  below the status bar instead of letting it draw under the icons, so
  the in-app theme reads as a continuous surface. The colour is
  re-applied whenever the user toggles dark/light mode — see
  `frontend/src/native/capacitorBridge.js → setupStatusBarThemeSync`.
- **Keyboard** — `@capacitor/keyboard` is mounted on top of the existing
  `adjustResize` behaviour. Its `keyboardWillShow` / `keyboardWillHide`
  events are forwarded as `focusin` / `focusout` on the chat input, so
  the focus-authoritative path inside `keyboardViewport.js` runs the
  instant the OS starts animating the keyboard (faster than waiting for
  `visualViewport.resize`, and necessary on Samsung keyboards that fire
  blur without a paired resize and would otherwise leave the input bar
  stuck above a closed keyboard).
- **Back button** — `App.addListener('backButton', …)` routes the
  Android hardware back through `history.back()` first, falling back to
  `App.exitApp()` on the root. Modals/overlays can intercept the
  gesture by listening for `socrates:back` and calling
  `event.preventDefault()`.
- **Lifecycle** — `App.appStateChange` is mirrored as
  `visibilitychange` so existing listeners (`document.hidden` checks in
  the SSE reconnect loop) work without modification.
- **First paint** — `MainActivity` paints the window background to
  `#101318` and `index.html` sets `documentElement.style.backgroundColor`
  before any module loads, eliminating the black→white→app flash on
  cold start.

If the user disables dark mode (`data-mode=light`), the bridge
re-applies a light surface (`#E6DEC8`) and `Style.LIGHT` icons so the
status bar remains legible.

## Adding iOS (requires macOS)

The Capacitor scaffold is Android-only. To produce an iOS build:

```bash
cd capacitor
npm install
npx cap add ios              # generates ios/
npm install @capacitor/status-bar @capacitor/keyboard @capacitor/app
npx cap sync ios
cd ios && pod install
xcodebuild -workspace ios/App/App.xcworkspace -scheme App \
  -configuration Release -archivePath build/App.xcarchive archive
```

The same `capacitor.config.js` plugins block applies. The web layer's
`capacitorBridge.js` already keys off `getPlatform() === 'android'`,
so the back-button listener is a no-op on iOS (no hardware back).

## Limitations

- `allowMixedContent: false` is enforced; the app refuses to load
  HTTP-only resources. If you point the APK at a staging backend that
  serves HTTP, either enable TLS on that backend or use a debug build.
- Cleartext http is allowed **only in debug builds** via the manifest
  overlay `android/app/src/debug/AndroidManifest.xml`
  (`usesCleartextTraffic=true`), which is what makes
  `npm run apk:debug:local` work against `http://10.0.2.2:3037/`.
  Release builds keep the platform default (cleartext blocked), so a
  release APK must always target an https backend.
- The app requires network connectivity for first load (the frontend
  is served from `server.url`, not from the bundled assets). Assets
  are cached by the WebView afterwards.
