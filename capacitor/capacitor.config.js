/** @type {import('@capacitor/cli').CapacitorConfig} */
const PRODUCTION_URL = 'https://app.topodrive.top';
const serverUrl = process.env.SOCRATES_SERVER_URL || PRODUCTION_URL;
const isHttp = serverUrl.startsWith('http://');
const serverHost = new URL(serverUrl).host;

const config = {
  appId: 'com.topodrive.socrates',
  appName: 'Socrates',
  webDir: '../frontend/dist',
  server: {
    url: serverUrl,
    hostname: serverHost,
    androidScheme: 'https',
    allowNavigation: [...new Set([serverHost, 'app.topodrive.top', 'topodrive.top', 'github.com', 'api.github.com'])],
    cleartext: isHttp,
  },
  android: {
    allowMixedContent: false,
    /* MainActivity forwards system-bar insets to CSS. Let the WebView draw
       edge-to-edge so Capacitor does not add a second set of margins. */
    adjustMarginsForEdgeToEdge: 'disable',
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 1400,
      launchAutoHide: true,
      resourceName: 'socrates_splash',
      backgroundColor: '#000000',
      androidScaleType: 'CENTER_CROP',
      showSpinner: false,
      /* Keep the post-splash window in the same edge-to-edge mode as the
         WebView. Fullscreen splash teardown otherwise restores fitsSystemWindows
         and moves the content under a second, inconsistent inset model. */
      splashFullScreen: false,
      splashImmersive: false,
    },
    StatusBar: {
      overlaysWebView: true,
      style: 'DARK',
      backgroundColor: '#000000',
    },
    Keyboard: {
      resize: 'native',
      resizeOnFullScreen: true,
      style: 'DARK',
      scrollAdjustment: false,
    },
  },
};

module.exports = config;
