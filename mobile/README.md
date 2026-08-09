# Socrates Expo Android client

The Expo app is a native Android shell around the same responsive product
served by `frontend/`. Sharing the web surface keeps chat, tutor mode, exams,
projects, tools, settings, authentication, localization, and future frontend
features visually and functionally aligned without maintaining a second UI.

Production has one source of truth: `expo.extra.apiBaseUrl` in `app.json`,
using the same `/api/v2` cache-bypass prefix as the SPA. The web origin and
canonical `/api` OAuth origin are derived from that value. Before opening the
SPA, the shell reads `GET /api/v2/mobile/bootstrap` and rejects a response
whose origins or prefixes do not match the compiled app. A 404 falls back to
the compiled origin only to support a rolling server/APK deployment; the
production `deploy.sh` health gate requires the endpoint after deployment.

Authentication cookies and web storage are persisted by the WebView. The
native shell adds Android safe areas, hardware-back navigation, theme-aware
status-bar icons, telephone/mail link handling, a bounded bootstrap/load
timeout, and an explicit retry state. The launcher icon uses dedicated
Android assets with the original mark at 78% scale on `#2D2D32`; the splash
screen continues to use the original unscaled logo.

## Development

```powershell
cd mobile
npm install
npx expo prebuild --platform android --clean
npx expo run:android
```

A debug APK expects Metro to be running. For a standalone APK, build the
release variant so the JavaScript bundle is packaged:

```powershell
$env:JAVA_HOME = 'C:\Program Files\Microsoft\jdk-17.0.20.8-hotspot'
$env:ANDROID_HOME = "$env:LOCALAPPDATA\Android\Sdk"
npx expo prebuild --platform android --clean --no-install
cd android
.\gradlew.bat :app:assembleRelease
```

Generated `mobile/android/`, `mobile/ios/`, and `.expo/` state is intentionally
ignored. Change native generation inputs in `app.json` or Expo config plugins,
then regenerate rather than editing generated files.
