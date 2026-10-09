import { reportSwallow } from '../reportSwallow.ts';

let onUnauthorized = null;
let isInGraceWindow = () => false;

export function installAuthHooks({ on401, isInGraceWindow: graceWindowCheck }) {
  if (on401) onUnauthorized = on401;
  if (graceWindowCheck) isInGraceWindow = graceWindowCheck;
}

export function authExpiryIsSuppressed() {
  return isInGraceWindow();
}

export function notifyUnauthorized(source, method, path) {
  try {
    if (onUnauthorized) onUnauthorized(source + ':' + method + ' ' + path);
  }
  catch (error) { reportSwallow(error, 'util/api.notifyUnauthorized'); }
}

/** Refresh CSRF state and yield once before the caller replays its request. */
export async function refreshCsrfToken(signal, source) {
  const options = { credentials: 'include' };
  if (signal) options.signal = signal;
  try { await fetch('/api/v2/auth/csrf-token', options); }
  catch (error) { reportSwallow(error, source + '.csrfRefresh'); }
  await new Promise((resolve) => setTimeout(resolve, 0));
}
