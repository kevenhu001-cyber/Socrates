import { openPromptTemplatesModal } from '../ui/promptTemplates.js';
/*
 * Narrow bridge used only by the React Native embedded-workspace flow.
 *
 * The server consumes a one-time mobile web-session capability, sets the
 * normal HttpOnly `sid` cookie, and redirects back to the SPA with an
 * allow-listed `mobile_target`.  Resolve that target only after the regular
 * web auth bootstrap has completed: doing it earlier races the workspace
 * data load and can render an empty panel.
 */

const TARGETS = new Set([
  'projects', 'scheduled', 'plugins', 'knowledge', 'mistakes', 'skills', 'api-settings',
  'profile', 'usage', 'storage',
]);

function postToNative(message) {
  try {
    const bridge = window.ReactNativeWebView;
    if (bridge && typeof bridge.postMessage === 'function') {
      bridge.postMessage(JSON.stringify(message));
    }
  } catch (_) { /* The page also runs as a normal browser SPA. */ }
}

export function notifyEmbeddedReady() {
  postToNative({ type: 'ready' });
}

export function notifyEmbeddedAuthExpired() {
  postToNative({ type: 'authExpired' });
}

/* When Android opens an exact SPA modal, the SPA remains the owner of the
 * close button/backdrop semantics. Reflect that close back to the native
 * navigation stack instead of leaving the user on the underlying SPA shell.
 * Dynamic portal modals (storage/prompt templates) are considered open while
 * their element exists; static overlays are open while `hidden` is absent. */
const EMBEDDED_MODAL_SELECTORS = {
  'api-settings': '#settingsOverlay',
  profile: '#profileOverlay',
  usage: '#usageOverlay',
  storage: '#storageModalOverlay',
  skills: '#promptTemplatesOverlay',
};

function watchEmbeddedModalClose(target) {
  if (!window.ReactNativeWebView) return;
  const selector = EMBEDDED_MODAL_SELECTORS[target];
  if (!selector || typeof MutationObserver === 'undefined') return;

  const isOpen = () => {
    const el = document.querySelector(selector);
    if (!el) return false;
    return !el.classList.contains('hidden');
  };
  let seenOpen = isOpen();
  let closed = false;
  const observer = new MutationObserver(() => {
    if (closed) return;
    const open = isOpen();
    if (open) {
      seenOpen = true;
      return;
    }
    if (seenOpen) {
      closed = true;
      observer.disconnect();
      postToNative({ type: 'close' });
    }
  });
  observer.observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['class'] });
  /* React portals may mount after the open action publishes its state. */
  window.setTimeout(() => {
    if (!closed && isOpen()) seenOpen = true;
  }, 0);
}

/**
 * Open an explicitly allow-listed web workspace after a native hand-off.
 * Query cleanup intentionally keeps unrelated state such as ?chat=… or
 * ?share=… intact, and never treats arbitrary query data as a route.
 */
export function openMobileTargetFromUrl() {
  let url;
  try { url = new URL(window.location.href); } catch (_) { return false; }
  const target = url.searchParams.get('mobile_target');
  if (!target || !TARGETS.has(target)) return false;

  let opened = false;
  try {
    if (target === 'projects' || target === 'scheduled' || target === 'plugins') {
      if (typeof window.openNav !== 'function') return false;
      window.openNav(target);
      opened = true;
    } else if (target === 'knowledge' || target === 'mistakes') {
      if (typeof window.toggleSidebarView !== 'function') return false;
      window.toggleSidebarView(target);
      opened = true;
    } else if (target === 'skills') {
      if (typeof openPromptTemplatesModal !== 'function') return false;
      openPromptTemplatesModal();
      opened = true;
    } else if (target === 'api-settings') {
      if (typeof window.openSettings !== 'function') return false;
      window.openSettings();
      opened = true;
    } else if (target === 'profile') {
      if (typeof window.openProfile !== 'function') return false;
      window.openProfile();
      opened = true;
    } else if (target === 'usage') {
      if (typeof window.openUsageModal !== 'function') return false;
      window.openUsageModal();
      opened = true;
    } else if (target === 'storage') {
      if (typeof window.openStorageModal !== 'function') return false;
      window.openStorageModal();
      opened = true;
    }
  } catch (_) {
    return false;
  }

  if (opened) {
    watchEmbeddedModalClose(target);
    /* Some targets (projects/scheduled/plugins) update the SPA history while
     * opening.  Remove the hand-off parameter from the *current* URL rather
     * than the pre-navigation URL, otherwise this cleanup silently replaces
     * /projects with / and breaks reload/back-route parity. */
    let current = url;
    try { current = new URL(window.location.href); } catch (_) {}
    current.searchParams.delete('mobile_target');
    const next = current.pathname + current.search + current.hash;
    try { window.history.replaceState(window.history.state, '', next); } catch (_) {}
  }
  return opened;
}

/* Let the native shell dismiss its loading layer even for the default
 * workspace route. This is harmless in every normal browser. */
if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', notifyEmbeddedReady, { once: true });
  } else {
    setTimeout(notifyEmbeddedReady, 0);
  }
}
