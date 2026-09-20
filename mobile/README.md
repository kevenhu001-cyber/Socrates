# Socrates universal React Native client

`mobile/` is the Expo + React Native application. Native React Native
navigation is now the primary Android entry point: authentication, home,
chat, tutor mode, library, exams, search, settings, sharing, and artifact
preview are rendered with native components. The complex workspace and HTML
artifact surfaces remain isolated WebView routes while they are being
rewritten.

The existing Vite SPA in `frontend/` remains the web regression baseline during
the migration. Platform-neutral API contracts and stream/session helpers live
in [`packages/`](../packages/), so Android, Web, and the future desktop targets
share the same server semantics instead of maintaining separate protocol
implementations.

Production still has one API source of truth: `expo.extra.apiBaseUrl` in
`app.json`, using the same `/api/v2` cache-bypass prefix as the SPA. Native
authentication uses the shared API client and secure session persistence; it
does not depend on the WebView's cookies or web storage.

## Development

```bash
cd mobile
npm install
npm run typecheck
npm test -- --watch=false
npx expo start
```

Run the native Android target:

```bash
cd mobile
npx expo prebuild --platform android --no-install
npx expo run:android
```

For a standalone JavaScript export:

```bash
npx expo export --platform android --output-dir /tmp/socrates-rn-export
```

Generated `mobile/android/`, `mobile/ios/`, and `.expo/` state is intentionally
ignored. Change native generation inputs in `app.json` or Expo config plugins,
then regenerate rather than editing generated files. See
[`docs/plans/rn-migration.md`](../docs/plans/rn-migration.md) for the phase plan and
acceptance checklist.
