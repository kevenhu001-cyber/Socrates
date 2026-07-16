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
npm run apk:debug
```

The installable output is `android/app/build/outputs/apk/debug/app-debug.apk`.
For a distributable production build, configure a private signing key in the
Android project before running `npm run apk:release`.

## Updating the frontend

Use `npm run sync` in this directory. It runs the Vite production build then
copies the result into the Android app assets. The Capacitor bridge is
configured for a secure `https://localhost` origin; the bootstrap in
`frontend/index.html` routes existing `/api/*` and EventSource calls to the
production backend.
