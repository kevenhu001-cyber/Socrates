/* app/errorGuard.js — extracted from main.js.
 * Global error / unhandledrejection guard with correlation banner.
 * Zero-behavior-change lift; self-contained (window/document only).
 */
export var __socratesGlobalErrorHandlerInstalled = false;

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

  function showBanner(correl, hint) {
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

      const btn = document.createElement('button');
      btn.type = 'button';
      btn.textContent = 'Dismiss';
      btn.style.cssText = 'background:transparent;color:#fff;border:1px solid rgba(255,255,255,0.6);border-radius:4px;padding:3px 8px;cursor:pointer;font-size:12px';
      btn.addEventListener('click', () => {
        if (el.parentNode) el.parentNode.removeChild(el);
      });

      el.appendChild(msg);
      el.appendChild(id);
      el.appendChild(btn);
      // Auto-dismiss after 12 s so it doesn't pile up.
      setTimeout(() => {
        if (el.parentNode) el.parentNode.removeChild(el);
      }, 12000);
    } catch (_) { /* banner creation failed — swallow */ }
  }

  function reportError(correl, label, payload) {
    try {
      var data = JSON.stringify({
        correl: correl,
        label: label,
        msg: payload && payload.message ? payload.message : (typeof payload === 'string' ? payload : String(payload)),
        stack: payload && payload.stack ? payload.stack : '',
        href: typeof window !== 'undefined' && window.location ? window.location.href : '',
        ua: typeof navigator !== 'undefined' ? navigator.userAgent : '',
      });
      if (typeof navigator !== 'undefined' && navigator.sendBeacon) {
        navigator.sendBeacon('/api/client-error', new Blob([data], { type: 'application/json' }));
      } else if (typeof fetch !== 'undefined') {
        fetch('/api/client-error', { method: 'POST', body: data, keepalive: true }).catch(function(){});
      }
    } catch (_) { /* swallow */ }
  }

  function handle(label, payload) {
    if (inHandler) return;
    /* P_turn-abort-quiet — lifecycle aborts (session-expired, user-stop,
       superseded, …) are intentional control flow. A late rejection that
       escaped a guarded turn path must not raise the red banner or file
       a client-error report; a one-line console note keeps it greppable. */
    if (label === 'unhandledrejection') {
      var sig = '';
      try { sig = String((payload && payload.reason != null ? payload.reason : '') + ' ' + ((payload && payload.message) || payload)).toLowerCase(); } catch (_) {}
      if (/session-expired|session-switch|session-deleted|session-purged|session-reset|archived-session|new-session|superseded|msg-edit|msg-regen|signout|sign-out|user-stop|user_stop|cancelled|canceled|first-delta-timeout/.test(sig)) {
        try { console.log('[global-error] ignored expected turn abort:', sig.slice(0, 120)); } catch (_) {}
        return;
      }
      var nm = '';
      try { nm = String(payload && payload.name || ''); } catch (_) {}
      if (nm === 'AbortError' && /abort/i.test(sig)) {
        try { console.log('[global-error] ignored AbortError:', sig.slice(0, 120)); } catch (_) {}
        return;
      }
    }
    inHandler = true;
    try {
      const correl = shortCorrel();
      // Full detail to console so dev tools / remote reporters can
      // see the stack; banner shows only the correlation token.
      console.error('[global-error]', label, correl, payload);
      reportError(correl, label, payload);
      if (typeof document !== 'undefined' && document.body) {
        const hint = label === 'unhandledrejection'
          ? 'Something went off-script. Try refreshing — if it repeats, share the code below.'
          : 'Something broke. Try refreshing — if it repeats, share the code below.';
        showBanner(correl, hint);
      }
    } finally {
      inHandler = false;
    }
  }

  window.addEventListener('error', (ev) => {
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

  window.addEventListener('unhandledrejection', (ev) => {
    handle('unhandledrejection', ev && (ev.reason || ev) || 'unknown');
    // Don't preventDefault — let the dev tools still flag it.
  });
}

installGlobalErrorGuard();
