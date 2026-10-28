/* Chrome keeps its HttpOnly sid. Only a short-lived, PKCE-bound code leaves
 * the browser, after an explicit account confirmation and link click. */
const ORIGIN = 'https://app.topodrive.top';
const CALLBACK_PATH = '/auth/android/callback';
const STORAGE_KEY = 'socrates.android.browser-login.v1';
const TTL_MS = 10 * 60 * 1000;
const HEX = /^[a-f0-9]{64}$/;
const CHALLENGE = /^[A-Za-z0-9_-]{43}$/;
export interface BrowserLoginRequest { state: string; codeChallenge: string; createdAt: number }

export function parseBrowserLoginRequest(url: URL, now = Date.now()): BrowserLoginRequest | null {
  if (url.origin !== ORIGIN || url.pathname !== '/' || url.searchParams.getAll('native_login').length !== 1
    || url.searchParams.get('native_login') !== '1' || url.searchParams.getAll('state').length !== 1
    || url.searchParams.getAll('code_challenge').length !== 1) return null;
  const state = url.searchParams.get('state') || '';
  const codeChallenge = url.searchParams.get('code_challenge') || '';
  return HEX.test(state) && CHALLENGE.test(codeChallenge) ? { state, codeChallenge, createdAt: now } : null;
}

export function readBrowserLoginRequest(storage: Storage, now = Date.now()): BrowserLoginRequest | null {
  try {
    const value = JSON.parse(storage.getItem(STORAGE_KEY) || 'null') as BrowserLoginRequest | null;
    if (value && HEX.test(value.state) && CHALLENGE.test(value.codeChallenge)
      && Number.isFinite(value.createdAt) && value.createdAt <= now && now - value.createdAt < TTL_MS) return value;
    storage.removeItem(STORAGE_KEY);
  } catch { /* empty-catch: intentional — unavailable or corrupt session storage fails closed */ }
  return null;
}

export function validateBrowserLoginCallback(value: unknown, state: string): string | null {
  if (typeof value !== 'string') return null;
  try {
    const url = new URL(value);
    const params = new URLSearchParams(url.hash.slice(1));
    if (url.origin !== ORIGIN || url.pathname !== CALLBACK_PATH || url.search || url.username || url.password
      || params.size !== 2 || params.getAll('code').length !== 1 || params.getAll('state').length !== 1
      || params.get('state') !== state || !HEX.test(params.get('code') || '')) return null;
    return url.href;
  } catch { return null; }
}

function clearPending(): void {
  try { sessionStorage.removeItem(STORAGE_KEY); }
  catch { /* empty-catch: intentional — no handoff is allowed without usable tab storage */ }
}

function isValidAuthorizationResponse(callback: string | null, expiresAt: number): callback is string {
  return Boolean(callback) && Number.isFinite(expiresAt) && expiresAt > Date.now()
    && expiresAt <= Date.now() + 5 * 60 * 1000 + 10000;
}

async function authorizeBrowserLogin(request: BrowserLoginRequest, userId: unknown, signal: AbortSignal) {
  if (Date.now() - request.createdAt >= TTL_MS || request.createdAt > Date.now()) throw new Error('expired');
  // No automatic retry after an ambiguous response, no Authorization header,
  // and no configurable host: only the current origin's HttpOnly sid is used.
  const csrfResponse = await fetch('/api/v2/auth/csrf-token', {
    credentials: 'same-origin', cache: 'no-store', signal,
  });
  if (!csrfResponse.ok) throw new Error('csrf');
  const csrf = document.cookie.match(/(?:^|;\s*)csrf=([^;]+)/)?.[1];
  if (!csrf) throw new Error('csrf');
  const meResponse = await fetch('/api/v2/auth/me', {
    credentials: 'same-origin', cache: 'no-store', signal,
  });
  if (!meResponse.ok) throw new Error('session');
  const me = await meResponse.json() as { user?: { id?: unknown } };
  if (typeof userId !== 'string' || me.user?.id !== userId) throw new Error('account changed');
  const response = await fetch('/api/v2/auth/mobile/browser/authorize', {
    method: 'POST', credentials: 'same-origin', cache: 'no-store', referrerPolicy: 'no-referrer',
    headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf },
    body: JSON.stringify({ state: request.state, codeChallenge: request.codeChallenge }), signal,
  });
  if (!response.ok) throw new Error('authorize');
  const data = await response.json() as { url?: unknown; expiresAt?: unknown };
  const callback = validateBrowserLoginCallback(data.url, request.state);
  const expiresAt = typeof data.expiresAt === 'string' ? Date.parse(data.expiresAt) : NaN;
  if (!isValidAuthorizationResponse(callback, expiresAt)) throw new Error('invalid response');
  return { callback, expiresAt };
}

/** Called before URL auth handlers rewrite queries; tab storage survives OAuth. */
export function captureBrowserLoginRequest(): void {
  const url = new URL(location.href);
  if (url.origin !== ORIGIN) return;
  if (url.pathname === CALLBACK_PATH) {
    // Verified App Links may be disabled by the OS/user. Never reissue or render
    // the code in a browser fallback, and remove it from the current history entry.
    clearPending();
    history.replaceState(null, '', CALLBACK_PATH);
    const dialog = document.createElement('dialog');
    dialog.className = 'browser-login-handoff';
    const message = document.createElement('p');
    message.textContent = '未能自动打开 Android 应用。请在系统设置中允许 Socrates 打开支持的链接，然后从应用重新发起登录。';
    const close = document.createElement('button');
    close.className = 'auth-btn secondary';
    close.textContent = '关闭';
    close.addEventListener('click', () => { dialog.close(); dialog.remove(); });
    dialog.append(message, close);
    document.body.append(dialog);
    dialog.showModal();
    return;
  }
  if (!url.searchParams.has('native_login')) return;
  clearPending();
  const pending = parseBrowserLoginRequest(url);
  url.searchParams.delete('native_login');
  url.searchParams.delete('state');
  url.searchParams.delete('code_challenge');
  history.replaceState(null, '', url.pathname + url.search + url.hash);
  if (pending) {
    try { sessionStorage.setItem(STORAGE_KEY, JSON.stringify(pending)); }
    catch { /* empty-catch: intentional — fail closed when the browser refuses tab storage */ }
  }
}

/** Every successful auth path calls this, including existing-cookie boot. */
export function offerBrowserLoginHandoff(): void {
  if (location.origin !== ORIGIN || document.getElementById('androidLoginHandoff')) return;
  let pending: BrowserLoginRequest | null;
  try { pending = readBrowserLoginRequest(sessionStorage); }
  catch { return; }
  if (!pending) return;
  const request = pending;
  const dialog = document.createElement('dialog');
  dialog.id = 'androidLoginHandoff';
  dialog.className = 'browser-login-handoff';
  dialog.setAttribute('aria-labelledby', 'androidLoginHandoffTitle');
  const title = document.createElement('h2');
  title.id = 'androidLoginHandoffTitle';
  title.textContent = '登录 Socrates Android';
  const description = document.createElement('p');
  const user = window.CURRENT_USER as { id?: unknown; email?: unknown } | null | undefined;
  description.textContent = `将使用当前网页账号${typeof user?.email === 'string' ? '（' + user.email + '）' : ''}登录 Android 应用。仅当你刚从该应用发起登录时才继续。`;
  const status = document.createElement('p');
  status.setAttribute('role', 'status');
  const consent = document.createElement('button');
  consent.className = 'auth-btn primary';
  consent.textContent = '确认此账号并继续';
  const cancel = document.createElement('button');
  cancel.className = 'auth-btn secondary';
  cancel.textContent = '取消';
  const link = document.createElement('a');
  link.className = 'auth-btn primary';
  link.textContent = '返回 Socrates Android';
  link.rel = 'noreferrer';
  link.referrerPolicy = 'no-referrer';
  link.hidden = true;
  let cancelled = false;
  let expiryTimer: ReturnType<typeof setTimeout> | undefined;
  const abort = new AbortController();
  const dismiss = () => {
    cancelled = true;
    abort.abort();
    if (expiryTimer) clearTimeout(expiryTimer);
    clearPending();
    dialog.close();
    dialog.remove();
  };
  cancel.addEventListener('click', dismiss);
  dialog.addEventListener('cancel', dismiss);
  link.addEventListener('click', () => {
    clearPending();
    status.textContent = '正在打开应用。如果仍停留在 Chrome，请检查系统的“打开支持的链接”设置，并从应用重新登录。';
  });
  consent.addEventListener('click', async () => {
    consent.disabled = true;
    status.textContent = '正在准备安全登录…';
    try {
      const { callback, expiresAt } = await authorizeBrowserLogin(request, user?.id, abort.signal);
      if (cancelled) return;
      clearPending();
      consent.hidden = true;
      link.href = callback;
      link.hidden = false;
      status.textContent = '已就绪。点击下方链接返回应用，链接仅短时有效且只能使用一次。';
      expiryTimer = setTimeout(() => {
        link.removeAttribute('href');
        link.hidden = true;
        status.textContent = '登录链接已过期，请从 Android 应用重新发起登录。';
      }, expiresAt - Date.now());
      link.focus();
    } catch {
      if (cancelled) return;
      clearPending();
      status.textContent = '未能完成交接。请关闭此提示，从 Android 应用重新发起登录。';
    }
  });
  dialog.append(title, description, status, consent, link, cancel);
  document.body.append(dialog);
  dialog.showModal();
}
