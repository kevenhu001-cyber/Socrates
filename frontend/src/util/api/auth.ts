import { reportSwallow } from '../reportSwallow.ts';

export interface AuthHooks {
  on401?: (detail: string) => void;
  isInGraceWindow?: () => boolean;
}

let onUnauthorized: ((detail: string) => void) | null = null;
let isInGraceWindow: () => boolean = () => false;

export function installAuthHooks({ on401, isInGraceWindow: graceWindowCheck }: AuthHooks): void {
  if (on401) onUnauthorized = on401;
  if (graceWindowCheck) isInGraceWindow = graceWindowCheck;
  // auth/boot already adopts index.html's early /api/v2/auth/me request.
  // That request warms the same auth cache; a second legacy-path probe adds
  // traffic and another anonymous 401 without warming anything new.
}

export function authExpiryIsSuppressed(): boolean {
  return isInGraceWindow();
}

export function notifyUnauthorized(source: string, method: string, path: string): void {
  try {
    if (onUnauthorized) onUnauthorized(source + ':' + method + ' ' + path);
  }
  catch (error) { reportSwallow(error, 'util/api.notifyUnauthorized'); }
}

/** Refresh CSRF state and yield once before the caller replays its request. */
export async function refreshCsrfToken(
  signal: AbortSignal | null | undefined,
  source: string,
): Promise<void> {
  const options: RequestInit = { credentials: 'include' };
  if (signal) options.signal = signal;
  try { await fetch('/api/v2/auth/csrf-token', options); }
  catch (error) { reportSwallow(error, source + '.csrfRefresh'); }
  await new Promise((resolve) => setTimeout(resolve, 0));
}
