/* app/errorGuard.ts — extracted from legacy entry.
 * Global error / unhandledrejection guard with correlation banner.
 * Zero-behavior-change lift; self-contained (window/document only).
 */
import { CLIENT_ERROR_PATH } from '../util/clientErrorReporter.ts';
import { renderActionButton } from '../legacy/actionButton.ts';
import { reportSwallow as reportEmptyCatch } from '../util/reportSwallow.ts';

export let __socratesGlobalErrorHandlerInstalled = false;

function renderDismissButton(host: HTMLElement, onDismiss: () => void) {
  renderActionButton(host, {
    type: 'button',
    variant: 'outline',
    size: 'sm',
    className: 'global-error-banner-dismiss',
    style: {
      background: 'transparent',
      color: '#fff',
      borderColor: 'rgba(255,255,255,0.6)',
      borderRadius: '4px',
      padding: '3px 8px',
      cursor: 'pointer',
      fontSize: '12px',
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

const EXPECTED_ABORT_PATTERN =
  /session-expired|session-switch|session-deleted|session-purged|session-reset|archived-session|new-session|superseded|msg-edit|msg-regen|signout|sign-out|user-stop|user_stop|cancelled|canceled|first-delta-timeout|abort|aborted|请求被取消|the user aborted|signal is aborted|bodystreambuffer was aborted|operation was aborted/;

function isAbortCodeOrName(code: unknown, name: unknown): boolean {
  if (code === 'ABORTED' || code === 'ABORT_ERR' || code === 20) return true;
  return String(name || '') === 'AbortError';
}

function isExpectedTurnAbort(payload: unknown): boolean {
  const code = payloadField(payload, 'code');
  const name = payloadField(payload, 'name');
  if (isAbortCodeOrName(code, name)) return true;

  const reason = payloadField(payload, 'reason');
  const message = payloadField(payload, 'message');
  const sig = `${String(reason ?? '')} ${String(message ?? payload ?? '')}`.toLowerCase();
  if (EXPECTED_ABORT_PATTERN.test(sig)) return true;

  const isHidden = typeof document !== 'undefined' && document.visibilityState === 'hidden';
  return isHidden && (String(name || '') === 'TypeError' || /fetch/i.test(sig));
}

function shortCorrel() {
  // 8 hex chars from time + 4 random hex — enough for a user to
  // quote in a bug report; not enough to be a guessable secret.
  return (
    Date.now().toString(36).slice(-6) +
    Math.floor(Math.random() * 0xffff)
      .toString(16)
      .padStart(4, '0')
  );
}

function ensureBanner() {
  let el = document.getElementById('__socrates_global_err_banner');
  if (el) return el;
  el = document.createElement('div');
  el.id = '__socrates_global_err_banner';
  el.setAttribute('role', 'status');
  el.style.cssText = [
    'position:fixed',
    'left:16px',
    'right:16px',
    'bottom:16px',
    'z-index:2147483647',
    'padding:10px 14px',
    'border-radius:8px',
    'background:rgba(178,34,34,0.92)',
    'color:#fff',
    'font:13px/1.4 "Geist Sans","Noto Sans SC",sans-serif',
    'box-shadow:0 4px 16px rgba(0,0,0,0.18)',
    'display:flex',
    'align-items:center',
    'justify-content:space-between',
    'gap:12px',
    'pointer-events:auto',
  ].join(';');
  document.body.appendChild(el);
  return el;
}

function showBanner(correl: string, hint: string | null) {
  try {
    const el = ensureBanner();
    // Clear any previous banner content first (multiple errors
    // before the user dismisses — keep the latest).
    while (el.firstChild) el.firstChild.remove();

    const msg = document.createElement('span');
    msg.textContent = hint;
    const id = document.createElement('code');
    id.textContent = '#' + correl;
    id.style.cssText =
      'background:rgba(0,0,0,0.25);padding:2px 6px;border-radius:4px;font-size:12px';

    const btnHost = document.createElement('span');
    btnHost.className = 'global-error-banner-dismiss-host';
    renderDismissButton(btnHost, () => {
      el.remove();
    });

    el.appendChild(msg);
    el.appendChild(id);
    el.appendChild(btnHost);
    // Auto-dismiss after 12 s so it doesn't pile up.
    setTimeout(() => {
      el.remove();
    }, 12000);
  } catch (_) {
    reportEmptyCatch(_, 'empty catch: app/errorGuard.ts');
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
      msg: message ? String(message) : typeof payload === 'string' ? payload : String(payload),
      stack: stack ? String(stack) : '',
      href: typeof window !== 'undefined' && window.location ? window.location.href : '',
      ua: typeof navigator !== 'undefined' ? navigator.userAgent : '',
    });
    if (typeof navigator !== 'undefined' && navigator.sendBeacon) {
      navigator.sendBeacon(CLIENT_ERROR_PATH, new Blob([data], { type: 'application/json' }));
    } else if (typeof fetch !== 'undefined') {
      fetch(CLIENT_ERROR_PATH, { method: 'POST', body: data, keepalive: true }).catch(function () {
        /* noop: beacon fallback error */
      });
    }
  } catch (_) {
    reportEmptyCatch(_, 'empty catch: app/errorGuard.ts');
    /* swallow */
  }
}

function showErrorBanner(correl: string, label: string) {
  if (typeof document === 'undefined' || !document.body) return;
  const hint =
    label === 'unhandledrejection'
      ? 'Something went off-script. Try refreshing — if it repeats, share the code below.'
      : 'Something broke. Try refreshing — if it repeats, share the code below.';
  showBanner(correl, hint);
}

export function installGlobalErrorGuard() {
  if (typeof window === 'undefined') return;
  if (__socratesGlobalErrorHandlerInstalled) return;
  __socratesGlobalErrorHandlerInstalled = true;
  // Re-entrancy flag — if our own banner code throws, we MUST NOT
  // dispatch the handler again (would loop and lock the page).
  let inHandler = false;

  function handle(label: string, payload: unknown) {
    if (inHandler) return;
    /* lifecycle aborts (session-expired, user-stop,
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

  if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
    window.addEventListener('error', (ev) => {
      /* Browsers report a ResizeObserver callback that resized observed
         content as a window error. It is a benign layout notice (the
         remaining notifications are simply delivered next frame), not a
         crash, so it must not raise the red banner. */
      if (ev && /ResizeObserver loop/i.test(String(ev.message || ''))) return true;
      // ev.error holds the Error object when available; fall back to
      // ev.message for the rare case the browser only reports a string.
      handle('error', (ev && (ev.error || ev.message)) || 'unknown');
      // Returning true suppresses the browser's default handler so we
      // don't double-report via onerror("…", "…", line, col).
      return true;
    });

    window.addEventListener('unhandledrejection', (ev) => {
      handle('unhandledrejection', (ev && (ev.reason || ev)) || 'unknown');
      // Don't preventDefault — let the dev tools still flag it.
    });

    window.addEventListener('beforeunload', () => {
      inHandler = true;
    });
  }
}

installGlobalErrorGuard();
