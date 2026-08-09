// @ts-check
/**
 * capacitorBridge — wires the running Capacitor WebView to the native
 * plugins (StatusBar, Keyboard, App). Only mounted when window.Capacitor
 * is present and isNativePlatform() returns true; safe to import in
 * web builds because every entry point guards on that flag.
 *
 * Goals:
 *  - Status bar: keep the OS chrome in sync with the in-app theme so
 *    the bar reads as part of the UI on both dark and light backgrounds.
 *  - Keyboard: forward Capacitor's keyboardWillShow/Hide as an explicit
 *    native event. Focus belongs to the editor; it must not be faked to
 *    represent an OS keyboard transition.
 *  - Back button: route Android's hardware back through the in-app
 *    router/history so the user can navigate Recents / modal stacks
 *    the same way as on desktop browsers, falling back to Capacitor's
 *    default exit behaviour on the root.
 */

const ROOT = document.documentElement;
export const NATIVE_KEYBOARD_EVENT = 'socrates:native-keyboard';

function getCapacitor() {
  // window.Capacitor is injected by the Capacitor runtime before any
  // module script runs. In a regular browser it is undefined and this
  // module becomes a no-op.
  return typeof window !== 'undefined' ? window.Capacitor : undefined;
}

export function isNativeApp() {
  const cap = getCapacitor();
  return !!(cap && typeof cap.isNativePlatform === 'function' && cap.isNativePlatform());
}

export function getPlatform() {
  const cap = getCapacitor();
  return cap && typeof cap.getPlatform === 'function' ? cap.getPlatform() : 'web';
}

function getPlugin(name) {
  const cap = getCapacitor();
  if (!cap || !cap.Plugins) return undefined;
  return cap.Plugins[name];
}

/* ─── Status bar theme sync ─────────────────────────────────────────── */

/*
 * Theme mapping (matches [data-theme=socrates][data-mode=light|dark] in
 * the bundled CSS):
 *   light → StatusBar Style.Light (dark icons on light bg)
 *   dark  → StatusBar Style.Dark  (light icons on dark bg)
 *
 * backgroundColor mirrors the page surface for a seamless cut. The page
 * root background comes from --bg-000; we hard-code the two values so
 * the bridge can run before any CSS is parsed.
 */
const STATUS_BAR_BG = {
  light: '#000000',
  dark:  '#000000',
};

function currentMode() {
  return ROOT.getAttribute('data-mode') === 'light' ? 'light' : 'dark';
}

async function applyStatusBar() {
  const StatusBar = getPlugin('StatusBar');
  if (!StatusBar) return;
  /* The Android reference surface is intentionally black even when the
     desktop theme preference is light; keep status-bar icons white so the
     OS chrome never fights the mobile canvas. */
  const mode = isNativeApp() ? 'dark' : currentMode();
  try {
    await StatusBar.setStyle({ style: mode === 'light' ? 'LIGHT' : 'DARK' });
    await StatusBar.setBackgroundColor({ color: STATUS_BAR_BG[mode] });
  } catch (_) {
    /* Plugin may be unavailable on some platforms (e.g. web). Swallow. */
  }
}

function setupStatusBarThemeSync() {
  if (!getPlugin('StatusBar')) return;
  applyStatusBar();
  const observer = new MutationObserver((mutations) => {
    for (const m of mutations) {
      if (m.type === 'attributes' && m.attributeName === 'data-mode') {
        applyStatusBar();
        break;
      }
    }
  });
  observer.observe(ROOT, { attributes: true, attributeFilter: ['data-mode'] });
  return () => observer.disconnect();
}

/* ─── Keyboard signal forwarding ────────────────────────────────────── */

/*
 * Capacitor's Keyboard plugin fires keyboardWillShow/Hide with the
 * keyboard height. Keep that signal separate from DOM focus: the same
 * viewport helper is used by both the topic and chat composers, and a
 * synthetic focus event cannot change document.activeElement anyway.
 */
function wireKeyboardBridge() {
  const Keyboard = getPlugin('Keyboard');
  if (!Keyboard) return () => {};

  const showHandle = Keyboard.addListener('keyboardWillShow', (info) => {
    const height = Number.isFinite(info?.keyboardHeight) ? info.keyboardHeight : undefined;
    ROOT.dataset.nativeKeyboardOpen = 'true';
    window.dispatchEvent(new CustomEvent(NATIVE_KEYBOARD_EVENT, {
      detail: { state: 'open', ...(height === undefined ? {} : { height }) },
    }));
  });
  const hideHandle = Keyboard.addListener('keyboardWillHide', () => {
    ROOT.dataset.nativeKeyboardOpen = 'false';
    window.dispatchEvent(new CustomEvent(NATIVE_KEYBOARD_EVENT, {
      detail: { state: 'closed' },
    }));
  });

  return () => {
    showHandle?.remove?.();
    hideHandle?.remove?.();
  };
}

/* ─── Android hardware back button ─────────────────────────────────── */

/*
 * Forward Android's hardware back gesture to the in-app router. The web
 * app keeps a history.back() friendly state in window.history; on
 * non-root routes this returns the user to the previous screen. On
 * the root, exitApp() lets Capacitor minimise/quit per platform rules.
 */
function setupBackButton() {
  const App = getPlugin('App');
  if (!App || getPlatform() !== 'android') return () => {};
  const Keyboard = getPlugin('Keyboard');

  const handle = App.addListener('backButton', ({ canGoBack }) => {
    /* Android sends the same back gesture for the IME and the page. Let the
       IME consume the first press; the page/router only sees the next one. */
    if (Keyboard && (ROOT.dataset.nativeKeyboardOpen === 'true'
      || ROOT.dataset.keyboardOpen === 'true')) {
      void Keyboard.hide?.();
      return;
    }

    /* If a modal/overlay is open it should intercept first. The web
       app dispatches a custom event that listeners can call
       preventDefault() on. */
    const evt = new CustomEvent('socrates:back', { cancelable: true });
    window.dispatchEvent(evt);
    if (evt.defaultPrevented) return;

    if (canGoBack && window.history.length > 1) {
      window.history.back();
    } else {
      App.exitApp();
    }
  });

  return () => handle?.remove?.();
}

/* ─── Deep link / OAuth callback handling ──────────────────────────── */

/*
 * When the app is opened via a deep link (e.g. OAuth callback from the
 * system browser redirecting to socrates://auth?token=... or
 * https://app.topodrive.top/api/auth/oauth/github/callback), Capacitor's
 * App plugin emits appUrlOpen. We forward the URL to the web app by
 * setting window.location, which preserves the SPA's session + CSRF
 * state because the OAuth callback URL is same-origin with the app's
 * server.url.
 *
 * For custom scheme callbacks (socrates://auth?code=...), we rewrite
 * the URL to the equivalent HTTPS path so the server's OAuth handler
 * processes it normally.
 */
function setupDeepLinkHandler() {
  const App = getPlugin('App');
  if (!App) return () => {};

  const handle = App.addListener('appUrlOpen', (data) => {
    try {
      let url = (data && data.url) || '';
      if (!url) return;

      // Custom scheme: socrates://auth?code=... → /api/auth/oauth/github/callback?code=...
      if (url.startsWith('socrates://auth')) {
        const search = url.includes('?') ? url.substring(url.indexOf('?')) : '';
        window.location.href = '/api/auth/oauth/github/callback' + search;
        return;
      }

      // HTTPS deep link that matches our backend — set the URL directly
      // so the WebView loads the callback page (which processes the
      // OAuth result and redirects with cookies set).
      if (url.startsWith('https://app.topodrive.top')) {
        window.location.href = url;
        return;
      }
    } catch (_) { /* ignore listener errors */ }
  });

  return () => handle?.remove?.();
}

/* ─── Lifecycle: app foreground / background ───────────────────────── */

/*
 * The web app already listens to `visibilitychange`. Capacitor's App
 * plugin emits `appStateChange` (active ↔ background) which on Android
 * is more accurate than the DOM event when the OS pauses the WebView.
 * We mirror it as a normal `visibilitychange` so existing listeners
 * fire without modification.
 */
function setupAppStateMirror() {
  const App = getPlugin('App');
  if (!App) return () => {};

  const handle = App.addListener('appStateChange', ({ isActive }) => {
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      get: () => (isActive ? 'visible' : 'hidden'),
    });
    document.dispatchEvent(new Event('visibilitychange'));
  });

  return () => handle?.remove?.();
}

/* ─── Entrypoint ───────────────────────────────────────────────────── */

/**
 * Mount all Capacitor bridges. Returns a single teardown that removes
 * every listener / observer registered here. Called once at app boot
 * from main.js; the caller is responsible for guarding on
 * isNativeApp() so web builds skip this entirely.
 */
export function setupNativeBridge() {
  if (!isNativeApp()) return () => {};

  const teardowns = [
    setupStatusBarThemeSync(),
    wireKeyboardBridge(),
    setupBackButton(),
    setupAppStateMirror(),
    setupDeepLinkHandler(),
  ].filter(Boolean);

  // Tag the root so CSS / JS can branch on native mode.
  ROOT.dataset.capacitor = getPlatform();

  return function teardownNativeBridge() {
    for (const fn of teardowns) {
      try { fn(); } catch (_) { /* ignore */ }
    }
  };
}
