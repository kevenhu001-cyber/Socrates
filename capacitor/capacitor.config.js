/**
 * Capacitor config for the Socrates Android shell.
 *
 * NOTE: this is a .js config (not .ts) on purpose — the workspace pins
 * typescript@7 (native preview), whose API surface breaks @capacitor/cli's
 * TS config loader (`ts.ModuleKind.CommonJS` lookup). Plain CJS gives
 * us the same env-var support with zero toolchain risk.
 *
 * Architecture: the WebView loads the frontend REMOTELY from
 * `server.url` (default: the production origin). All `/api/*` calls in
 * the frontend are relative paths, so they stay same-origin with the
 * backend — session cookies (SameSite=Lax) and the CSRF double-submit
 * flow work without any backend changes. The `webDir` assets are still
 * synced into the APK because Capacitor requires them, but they are
 * not served at runtime while `server.url` is set.
 *
 * Retargeting the backend at build time:
 *
 *   SOCRATES_SERVER_URL=https://staging.topodrive.top npx cap sync android
 *   SOCRATES_SERVER_URL=http://10.0.2.2:3037 npx cap sync android
 *
 * The npm scripts `apk:debug:local` / `apk:debug:staging` (see
 * scripts/apk.mjs) set this variable for you. For http targets,
 * `cleartext` is enabled automatically; the release manifest still
 * blocks cleartext, so http targets only work in debug builds (the
 * debug manifest overlay opts in via usesCleartextTraffic).
 */

const PRODUCTION_URL = 'https://app.topodrive.top';
const serverUrl = process.env.SOCRATES_SERVER_URL || PRODUCTION_URL;
const isHttp = serverUrl.startsWith('http://');
const serverHost = new URL(serverUrl).host;

/** @type {import('@capacitor/cli').CapacitorConfig} */
const config = {
  appId: 'com.topodrive.socrates',
  appName: 'Socrates',
  webDir: '../frontend/dist',
  server: {
    url: serverUrl,
    hostname: serverHost,
    androidScheme: 'https',
    allowNavigation: [...new Set([
      serverHost,
      'app.topodrive.top',
      'topodrive.top',
      'github.com',
      'api.github.com',
    ])],
    cleartext: isHttp,
  },
  android: {
    allowMixedContent: false,
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 2000,
      launchAutoHide: true,
      backgroundColor: '#101318',
      androidScaleType: 'CENTER_CROP',
      showSpinner: false,
      splashFullScreen: true,
      splashImmersive: true,
    },
    StatusBar: {
      overlaysWebView: false,
      style: 'DEFAULT',
      backgroundColor: '#101318',
    },
    Keyboard: {
      resize: 'native',
      resizeOnFullScreen: true,
      style: 'DEFAULT',
      scrollAdjustment: false,
    },
  },
};

module.exports = config;
