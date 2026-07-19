# Socrates Capacitor Android app

This project packages the existing Vite frontend inside a native Android
Capacitor shell. The rendered UI and static assets are bundled in the APK;
API, authentication, uploads, and streaming chat continue to use
`https://app.topodrive.top` over HTTPS.

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

Use `npm run sync` in this directory. It runs the Vite production build then
copies the result into the Android app assets. The Capacitor bridge is
configured for a secure `https://localhost` origin; the bootstrap in
`frontend/index.html` routes existing `/api/*` and EventSource calls to the
production backend.

## Backend wiring

By default the APK targets `https://app.topodrive.top/` (the same origin the
web client uses). The frontend talks to relative `/api/v2/*` paths; under
`androidScheme: "https"` the WebView is served from `https://localhost`, and
nginx on the server side rewrites `/api/v2/*` back to the Express API on
`127.0.0.1:3037`. The APK is therefore a drop-in replacement for the
browser tab with no backend changes needed.

To target a different backend at build time, pass `BASE_URL`:

```bash
# Staging
cd capacitor/android && ./gradlew assembleRelease -PBASE_URL=https://staging.topodrive.top/

# Local dev — point the WebView at your laptop's backend
adb reverse tcp:3037 tcp:3037
cd capacitor/android && ./gradlew assembleDebug -PBASE_URL=http://10.0.2.2:3037/
# (Use 10.0.2.2 from the Android emulator; on a real device, use the
#  laptop's LAN IP and `adb reverse` both ports.)
```

Convenience scripts: `npm run apk:debug:local`, `npm run apk:debug:staging`,
`npm run apk:release:local`, `npm run apk:release:staging`. They wrap the
sync + gradle invocation so a single command produces a working APK.

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

The same `capacitor.config.json` plugins block applies. The web layer's
`capacitorBridge.js` already keys off `getPlatform() === 'android'`,
so the back-button listener is a no-op on iOS (no hardware back).

## Limitations

- `allowMixedContent: false` is enforced; the app refuses to load
  HTTP-only resources. If you point the APK at a staging backend that
  serves HTTP, either enable TLS on that backend or temporarily flip
  this to `true` in `capacitor.config.json`.
- `usesCleartextTraffic` is not enabled in `AndroidManifest.xml`. Local
  dev against `http://10.0.2.2:3037/` will be blocked unless the
  manifest gains a `network_security_config.xml` allow-listing that
  host.
