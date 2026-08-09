# Socrates Capacitor Android shell

The Android client is a Capacitor wrapper around the shared Vite frontend in
`../frontend`. The default build targets `https://app.topodrive.top`; set
`SOCRATES_SERVER_URL` for staging or local development.

```powershell
cd capacitor
npm install
npm run sync
npm run apk:debug
```

Android builds require JDK 21 or newer. The Gradle Wrapper uses the Tencent
Cloud mirror configured in `android/gradle/wrapper/gradle-wrapper.properties`
so a fresh machine does not depend on direct access to `services.gradle.org`.
The debug APK is written to `android/app/build/outputs/apk/debug/app-debug.apk`.

The shell includes App, Keyboard, StatusBar, SplashScreen, Haptics,
Clipboard, Share, Filesystem, SecureStorage, and FilePicker plugins. Access
tokens stay in SecureStorage; the web frontend remains the source of truth
for pages, API calls, types, and business behavior.

Local emulator build:

```powershell
npm run apk:debug:local
```

This uses `http://10.0.2.2:3037` and is only enabled in debug builds.
