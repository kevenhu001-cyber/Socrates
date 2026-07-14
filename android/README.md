# Socrates for Android

Native Kotlin client for the Socrates tutor backend (the same one served
at `https://app.topodrive.top/`). The Android app is a thin, well-organised
shell that talks to the existing `/api/*` endpoints over HTTPS + SSE — no
backend changes are required to run it.

## Highlights

- **Auth** — sign in / register / code login / forgot+reset, all matching
  the web client flow (CSRF cookie, captcha, deep-link email verification).
- **Tutor chat** — `/api/chat/stream` consumed via OkHttp SSE; partial
  deltas are appended into the assistant bubble and persisted to the
  server on each turn.
- **Agent** — `/api/agent/run` SSE; the four event types
  (`thinking` / `text` / `tool_use` / `tool_result` / `done` / `error`)
  are mapped to typed state in `ChatViewModel`.
- **Sessions + knowledge graph + mistake book** — server is the source of
  truth, Room is the local cache for the sidebar lists.
- **API keys** — full CRUD on `/api/api-key` with activation, plus the
  built-in "Beagle A" fallback when no provider is configured.
- **Theme** — mirrors the web client's socrates light/dark palette.

## Project layout

```
android/
├── app/
│   ├── build.gradle.kts              # AGP 8.7, Kotlin 2.0, Compose BOM 2024.10
│   ├── proguard-rules.pro
│   └── src/main/
│       ├── AndroidManifest.xml
│       ├── res/                      # theme, colors, strings, icon
│       └── java/com/socrates/app/
│           ├── SocratesApp.kt        # Application — owns AppContainer
│           ├── MainActivity.kt       # ComponentActivity + SplashScreen
│           ├── data/                 # AppContainer, repos, Room, prefs
│           ├── net/                  # OkHttp, CookieJar, CSRF, SSE
│           ├── model/                # @Serializable DTOs (mirrors /api/*)
│           ├── ui/
│           │   ├── theme/            # SocratesTheme (Material3 + extras)
│           │   ├── auth/             # gate + forms + captcha
│           │   ├── main/             # MainShell (drawer + scaffold)
│           │   ├── sidebar/          # Knowledge / Recents / Mistakes / Agent
│           │   ├── chat/             # ChatViewModel + ChatView (topic + stream)
│           │   ├── settings/         # account + display + api keys
│           │   └── common/           # MarkdownText, etc.
│           └── util/Log.kt
├── gradle/libs.versions.toml         # version catalog
├── scripts/
│   ├── deploy-android.sh             # build + publish APK to /var/www
│   └── download-page.tpl.html        # static download page (envsubst)
└── README.md
```

## Backend wiring

`BuildConfig.BASE_URL` is set in `app/build.gradle.kts` and defaults to
`https://app.topodrive.top/`. Override it at build time:

```bash
./gradlew :app:assembleRelease -PBASE_URL=https://app.topodrive.top/
```

The app expects the backend to:

- serve `/api/auth/csrf-token` and accept the `X-CSRF-Token` header for
  state-changing requests,
- stream SSE on `/api/chat/stream` and `/api/agent/run`,
- set `sid` (session) and `csrf` cookies on the auth response,
- tolerate both `application/json` and `text/event-stream` content types.

## Building

You need JDK 17+ and the Android SDK (platform 34, build-tools 34).
Set `ANDROID_HOME` and `JAVA_HOME`, then:

```bash
cd android
./gradlew :app:assembleDebug        # debug APK
./gradlew :app:assembleRelease      # release APK
```

For a Play Store bundle:

```bash
./gradlew :app:bundleRelease
```

### Signing

Create `android/signing.properties`:

```
storeFile=/absolute/path/to/keystore.jks
storePassword=...
keyAlias=...
keyPassword=...
```

The `release` build type picks it up automatically. If the file is
absent, the release APK is signed with the debug key (handy for CI
smoke tests; never ship that).

## Deploying

```bash
./scripts/deploy-android.sh                # build + copy to /var/www
./scripts/deploy-android.sh --aab          # build an AAB instead
./scripts/deploy-android.sh --base https://staging.example.com/
```

The script:

1. builds the release artifact,
2. installs it into `/var/www/app.topodrive.top/downloads/socrates-<ver>-<code>.apk`,
3. updates the `socrates-latest.apk` symlink,
4. renders `download-page.tpl.html` into `/var/www/.../android.html`,
5. prints the SHA-256 and a `curl` health check.

## Deep links

Two schemes are registered in `AndroidManifest.xml`:

- `socrates://auth/verify?token=…` (used by the verification email if
  you want a native-only flow),
- `https://app.topodrive.top/?token=…` (the existing web link, via
  App Links — declare the assetlinks file on the backend to enable
  the auto-verify path).

Both land in `MainActivity.extractTokenFromIntent` and are forwarded
to `AuthGate`, which calls `AuthRepository.verify(token)`.

## Running tests

```bash
./gradlew :app:test                     # unit tests (Kotlin/JVM)
./gradlew :app:lintDebug                # Android lint
```

## What this app does NOT do yet

- **GitHub OAuth** — the button is wired but opens a placeholder; the
  real flow needs a `CustomTabs` intent and a tiny deep-link receiver.
- **KaTeX rendering** — assistant math is shown as raw `$...$` and as
  a monospace span; pulling in a `katex-android` library would let
  the app render expressions properly. The web client uses the same
  `katex` CSS so parity is straightforward.
- **Code highlighting** — currently renders fenced code blocks in
  monospace. Adding `prism4j` or `highlight-android` is a small drop-in.
- **Biometric unlock** — DataStore is encrypted at rest by Android, but
  the session cookie lives in memory + on disk; a `BiometricPrompt`
  gate on cold boot is a 50-line follow-up.

## Pointing it at a local backend

When running against a backend on your laptop:

```bash
adb reverse tcp:443 tcp:443
./gradlew :app:assembleDebug -PBASE_URL=https://app.topodrive.top/
```

Or run a release build pointed at `http://10.0.2.2:3000/` (emulator's
loopback to host); the manifest's `networkSecurityConfig` already
permits cleartext to `10.0.2.2` and `localhost`.
