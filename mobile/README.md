# Socrates Android Native Client

React Native + Expo Prebuild client for the Socrates learning platform.

## Development

```powershell
cd mobile
npm install
npx expo prebuild --platform android
npx expo run:android
```

The app uses the production API by default. Override it for local Android
development with `EXPO_PUBLIC_API_BASE_URL=http://10.0.2.2:3037/api`.

This project intentionally uses a Development Build, not Expo Go, because it
needs SecureStore, SQLite, notifications, file pickers, and WebView.

For production Android notifications, add the Firebase Android app to the
Expo project and provide its `google-services.json` through the EAS build
configuration. The server can send registered FCM device tokens when
`FCM_SERVER_KEY` is configured. GitHub mobile OAuth uses
`GITHUB_MOBILE_CALLBACK_URL=https://<host>/api/auth/oauth/github/mobile-callback`
and must register that URL in the GitHub OAuth application.
