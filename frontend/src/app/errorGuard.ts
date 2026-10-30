/* app/errorGuard.ts — extracted from main.js.
 * Global error / unhandledrejection guard with correlation banner.
 * Zero-behavior-change lift; self-contained (window/document only).
 */
import { CLIENT_ERROR_PATH } from '../util/clientErrorReporter.ts';
import { renderActionButton } from '../ui/actionButton.ts';
import { runtimeWindow as browserWindow } from "../types/runtimeWindow.ts";
import { reportSwallow as reportEmptyCatch } from '../util/reportSwallow.ts';


export let __socratesGlobalErrorHandlerInstalled = false;

function renderDismissButton(host: HTMLElement, onDismiss: () => void) {
  renderActionButton(host, {
    type: 'button',
    variant: 'outline',
    size: 'sm',
    className: 'global-error-banner-dismiss',
    style: {
      background: 'transparent', color: '#fff', borderColor: 'rgba(255,255,255,0.6)',
      borderRadius: '4px', padding: '3px 8px', cursor: 'pointer', fontSize: '12px',
    },
    onClick: onDismiss,
    children: 'Dismiss',
  });
}

function payloadField(payload: unknown, key: string): unknown {
  return payload !== null && typeof payload === 'object'
    ? (payload as Record<string, unknown>)[key]
    : undefined;
}

function isExpectedTurnAbort(payload: unknown) {
  const reason = payloadField(payload, 'reason');
  const message = payloadField(payload, 'message');
  const name = payloadField(payload, 'name');
  let sig = '';
  try { sig = String((reason != null ? reason : '') + ' ' + (message || payload)).toLowerCase(); } catch (_) { /* empty-catch: intentional — safe stringify */ }
  if (/session-expired|session-switch|session-deleted|session-purged|session-reset|archived-session|new-session|superseded|msg-edit|msg-regen|signout|sign-out|user-stop|user_stop|cancelled|canceled|first-delta-timeout/.test(sig)) {
    try { console.log('[global-error] ignored expected turn abort:', sig.slice(0, 120)); } catch (_) { /* empty-catch: intentional — console log best effort */ }
    return true;
  }
  let nm = '';
  try { nm = String(name || ''); } catch (_) { /* empty-catch: intentional — safe stringify */ }
  if (nm === 'AbortError' && /abort/i.test(sig)) {
    try { console.log('[global-error] ignored AbortError:', sig.slice(0, 120)); } catch (_) { /* empty-catch: intentional — console log best effort */ }
    return true;
  }
  return false;
}

export function installGlobalErrorGuard() {
  if (typeof window === 'undefined') return;
  if (__socratesGlobalErrorHandlerInstalled) return;
  __socratesGlobalErrorHandlerInstalled = true;
  // Re-entrancy flag — if our own banner code throws, we MUST NOT
  // dispatch the handler again (would loop and lock the page).
  let inHandler = false;

  function shortCorrel() {
    // 8 hex chars from time + 4 random hex — enough for a user to
    // quote in a bug report; not enough to be a guessable secret.
    return (
      Date.now().toString(36).slice(-6) +
      Math.floor(Math.random() * 0xffff).toString(16).padStart(4, '0')
    );
  }

  function ensureBanner() {
    let el = document.getElementById('__socrates_global_err_banner');
    if (el) return el;
    el = document.createElement('div');
    el.id = '__socrates_global_err_banner';
    el.setAttribute('role', 'status');
    el.style.cssText = [
      'position:fixed', 'left:16px', 'right:16px', 'bottom:16px',
      'z-index:2147483647',
      'padding:10px 14px',
      'border-radius:8px',
      'background:rgba(178,34,34,0.92)',
      'color:#fff',
      'font:13px/1.4 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif',
      'box-shadow:0 4px 16px rgba(0,0,0,0.18)',
      'display:flex', 'align-items:center', 'justify-content:space-between', 'gap:12px',
      'pointer-events:auto',
    ].join(';');
    document.body.appendChild(el);
    return el;
  }

  function showBanner(correl: string, hint: string|null) {
    try {
      const el = ensureBanner();
      // Clear any previous banner content first (multiple errors
      // before the user dismisses — keep the latest).
      while (el.firstChild) el.removeChild(el.firstChild);

      const msg = document.createElement('span');
      msg.textContent = hint;
      const id = document.createElement('code');
      id.textContent = '#' + correl;
      id.style.cssText = 'background:rgba(0,0,0,0.25);padding:2px 6px;border-radius:4px;font-size:12px';

      const btnHost = document.createElement('span');
      btnHost.className = 'global-error-banner-dismiss-host';
      renderDismissButton(btnHost, () => {
        if (el.parentNode) el.parentNode.removeChild(el);
      });

      el.appendChild(msg);
      el.appendChild(id);
      el.appendChild(btnHost);
      // Auto-dismiss after 12 s so it doesn't pile up.
      setTimeout(() => {
        if (el.parentNode) el.parentNode.removeChild(el);
      }, 12000);
    } catch (_) {
      reportEmptyCatch(_, 'empty catch: app/errorGuard.ts:92');
      /* banner creation failed — swallow */
    }
  }

  function reportError(correl: string, label: string, payload: unknown) {
    try {
      const message = payloadField(payload, 'message');
      const stack = payloadField(payload, 'stack');
      const data = JSON.stringify({
        correl: correl,
        label: label,
        msg: message ? String(message) : (typeof payload === 'string' ? payload : String(payload)),
        stack: stack ? String(stack) : '',
        href: typeof window !== 'undefined' && browserWindow.location ? browserWindow.location.href : '',
        ua: typeof navigator !== 'undefined' ? navigator.userAgent : '',
      });
      if (typeof navigator !== 'undefined' && navigator.sendBeacon) {
        navigator.sendBeacon(CLIENT_ERROR_PATH, new Blob([data], { type: 'application/json' }));
      } else if (typeof fetch !== 'undefined') {
        fetch(CLIENT_ERROR_PATH, { method: 'POST', body: data, keepalive: true }).catch(function () { /* noop: beacon fallback error */ });
      }
    } catch (_) {
      reportEmptyCatch(_, 'empty catch: app/errorGuard.ts:110');
      /* swallow */
    }
  }

  function showErrorBanner(correl: string, label: string) {
    if (typeof document === 'undefined' || !document.body) return;
    const hint = label === 'unhandledrejection'
      ? 'Something went off-script. Try refreshing — if it repeats, share the code below.'
      : 'Something broke. Try refreshing — if it repeats, share the code below.';
    showBanner(correl, hint);
  }

  function handle(label: string, payload: unknown) {
    if (inHandler) return;
    /* P_turn-abort-quiet — lifecycle aborts (session-expired, user-stop,
       superseded, …) are intentional control flow. A late rejection that
       escaped a guarded turn path must not raise the red banner or file
       a client-error report; a one-line console note keeps it greppable. */
    if (label === 'unhandledrejection' && isExpectedTurnAbort(payload)) return;
    inHandler = true;
    try {
      const correl = shortCorrel();
      // Full detail to console so dev tools / remote reporters can
      // see the stack; banner shows only the correlation token.
      console.error('[global-error]', label, correl, payload);
      reportError(correl, label, payload);
      showErrorBanner(correl, label);
    } finally {
      inHandler = false;
    }
  }

  browserWindow.addEventListener('error', (ev) => {
    /* Browsers report a ResizeObserver callback that resized observed
       content as a window error. It is a benign layout notice (the
       remaining notifications are simply delivered next frame), not a
       crash, so it must not raise the red banner. */
    if (ev && /ResizeObserver loop/i.test(String(ev.message || ''))) return true;
    // ev.error holds the Error object when available; fall back to
    // ev.message for the rare case the browser only reports a string.
    handle('error', ev && (ev.error || ev.message) || 'unknown');
    // Returning true suppresses the browser's default handler so we
    // don't double-report via onerror("…", "…", line, col).
    return true;
  });

  browserWindow.addEventListener('unhandledrejection', (ev) => {
    handle('unhandledrejection', ev && (ev.reason || ev) || 'unknown');
    // Don't preventDefault — let the dev tools still flag it.
  });
}

installGlobalErrorGuard();
