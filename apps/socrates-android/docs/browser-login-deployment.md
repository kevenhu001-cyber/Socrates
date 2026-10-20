# Browser login App Links deployment

The Android callback is the exact verified HTTPS App Link `https://app.topodrive.top/auth/android/callback`. Chrome retains its HttpOnly `sid`; after account confirmation, the web app supplies a five-minute, one-use code bound to the native PKCE verifier. Neither `sid` nor bearer/refresh credentials appear in the return URL. Pending native requests expire after ten minutes and are consumed before exchange, including rejected attempts.

## Required production configuration

Set both server variables:

- `ANDROID_APP_LINKS_PACKAGE_NAME=com.socrates.android`
- `ANDROID_APP_LINKS_SHA256_FINGERPRINTS`: the actual release signing certificate SHA-256 fingerprint, in colon-separated hexadecimal format; comma-separate multiple active release certificates.

For Play distribution, use the **Play App Signing certificate**, not merely the upload certificate. Do not invent a fingerprint or associate a debug key with the production domain. Missing/invalid configuration returns an empty association array (fail closed).

Install `ops/nginx/app-assetlinks-proxy.conf.example` inside the `app.topodrive.top` HTTPS server block so `/.well-known/assetlinks.json` reaches Express rather than the SPA fallback. Keep `/auth/android/callback` available as a SPA route for a safe browser-only fallback. Serve the association directly as JSON over HTTPS without redirects or authentication. Consult `server/README.md` for server configuration details.

## Native safety and release verification

Browser login is allowed only when the native connection is `https://app.topodrive.top/api/v2`. A custom API connection is rejected with a user-visible message; it is not silently overwritten and cannot receive the production code, verifier, or credentials. The app rechecks the connection before persisting credentials.

Cold-start and already-running callbacks use the same strict origin/path/state validation. Invalid, expired or replayed callbacks do not sign in. A successful exchange updates the native authenticated UI and reloads account data. If Android leaves a link in Chrome, the browser fallback removes the code from the current URL and directs the user to enable supported-link handling and restart from the app; it never downgrades to a custom scheme.

This change was validated from code only. Before release, verify the deployed association against the exact signed APK/AAB and test Android domain verification, Chrome return, account switching, expired/replayed callbacks and the user-disabled supported-links fallback on a device. No device verification or deployment is implied by a successful local build.
