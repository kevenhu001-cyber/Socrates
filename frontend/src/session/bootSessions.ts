/* session/bootSessions.ts — consume the optional Recents prefetch started by
 * index.html's <head>.
 *
 * The head script fires `GET /api/v2/sessions?limit=40&cursorVersion=2` as
 * soon as /me confirms a signed-in user. That overlaps the entry-JS download
 * and the auth → React-mount sequence, which is exactly the window where the
 * sidebar used to sit empty waiting for its own request.
 *
 * The prefetch is a one-shot handoff: whichever `refreshServerSessions()`
 * call arrives first takes it and deletes it, so a later user switch or a
 * manual refresh goes back to the normal apiFetch path. A stale entry (the
 * user left the tab open before signing in) is discarded rather than shown.
 */
import type { BootPreflightResponse } from '../auth/boot/requests.ts';
import type { SessionRow } from './store.ts';

const BOOT_SESSIONS_MAX_AGE_MS = 30_000;

export interface BootSessionHost {
  __bootApi?: {
    sessions?: {
      startedAt: number;
      promise: Promise<BootPreflightResponse>;
    };
  } | null;
}

/** Take the prefetch once, or null when it is absent/stale. */
export function takeBootSessionPrefetch(
  host: BootSessionHost | null | undefined,
  now = Date.now(),
): Promise<BootPreflightResponse> | null {
  const boot = host && host.__bootApi;
  const prefetch = boot && boot.sessions;
  if (!boot || !prefetch) return null;
  delete boot.sessions;
  const age = now - prefetch.startedAt;
  if (!Number.isFinite(prefetch.startedAt) || age < 0 || age > BOOT_SESSIONS_MAX_AGE_MS)
    return null;
  return prefetch.promise;
}

export interface BootSessionPage {
  sessions: SessionRow[];
  nextCursor: string | null;
}

/** Preserve the cursor as well as rows so the sidebar can page after boot. */
export async function readBootSessions(
  host: BootSessionHost | null | undefined,
  now = Date.now(),
): Promise<BootSessionPage | null> {
  const promise = takeBootSessionPrefetch(host, now);
  if (!promise) return null;
  try {
    const response = await promise;
    if (!response || response.failed || response.status < 200 || response.status >= 300)
      return null;
    const payload = response.json as { sessions?: unknown; nextCursor?: unknown } | null | undefined;
    if (!Array.isArray(payload?.sessions)) return null;
    return {
      sessions: payload.sessions as SessionRow[],
      nextCursor: typeof payload.nextCursor === 'string' ? payload.nextCursor : null,
    };
  } catch {
    return null;
  }
}
