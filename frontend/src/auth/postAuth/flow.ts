/** Build the one-time migration request from legacy browser storage. */
export type MigrationReport = (
  error: unknown,
  context: string,
  severity?: 'expected' | 'recoverable' | 'invariant',
) => unknown;

export function buildLegacyMigrationPayload(
  localSessions: string | null,
  localApi: string | null,
  report: MigrationReport = () => null,
): Record<string, unknown> | null {
  const payload: Record<string, unknown> = {};
  if (localSessions) {
    try {
      const sessions: unknown = JSON.parse(localSessions);
      if (Array.isArray(sessions) && sessions.length) payload.localSessions = sessions;
    } catch (error) { report(error, 'auth/postAuth.migrate.parseSessions'); }
  }
  if (localApi) {
    try {
      const config = JSON.parse(localApi) as {
        activeId?: string;
        providers?: Array<{ id?: string; key?: string; label?: string; url?: string; model?: string }>;
      } | null;
      const providers = config && Array.isArray(config.providers) ? config.providers : [];
      const provider = providers.find((item) => item.id === config?.activeId) || providers[0];
      if (provider && provider.key) {
        payload.localApi = {
          label: provider.label,
          url: provider.url,
          model: provider.model,
          key: provider.key,
        };
      }
    } catch (error) { report(error, 'auth/postAuth.migrate.parseApi'); }
  }
  return Object.keys(payload).length ? payload : null;
}

export interface AuthGraceRetryOptions {
  isInGraceWindow?: () => boolean;
  wait?: (milliseconds: number) => Promise<unknown>;
}

/** Retry bootstrap reads only for a 401 during the fresh-session cookie window. */
export async function fetchWithAuthGraceRetry<T>(
  fetcher: (() => Promise<T>) | null | undefined,
  options: AuthGraceRetryOptions = {},
): Promise<T | null> {
  if (typeof fetcher !== 'function') return null;
  const isInGraceWindow = options.isInGraceWindow || (() => false);
  const wait = options.wait || ((milliseconds: number) => new Promise((resolve) => setTimeout(resolve, milliseconds)));
  try {
    return await fetcher();
  } catch (error) {
    const status = (error as { status?: number } | null)?.status;
    if (!error || status !== 401 || !isInGraceWindow()) throw error;
    await wait(500);
    return fetcher();
  }
}

async function tryRestoreSession(
  id: string,
  loadSession: (id: string) => Promise<unknown>,
  onFailure: (error: unknown) => void,
): Promise<boolean> {
  try {
    await loadSession(id);
    return true;
  } catch (error) {
    onFailure(error);
    return false;
  }
}

export interface RestoreRoutedSessionOptions {
  chatId?: string | null;
  examId?: string | null;
  loadSession: (id: string) => Promise<unknown>;
  onChatFailure: (error: unknown) => void;
  onExamFailure: (error: unknown) => void;
}

/** Restore the chat or exam route after the user's bootstrap data has loaded. */
export async function restoreRoutedSession(options: RestoreRoutedSessionOptions): Promise<boolean> {
  const {
    chatId,
    examId,
    loadSession,
    onChatFailure,
    onExamFailure,
  } = options;
  if (chatId) return tryRestoreSession(chatId, loadSession, onChatFailure);
  if (examId) return tryRestoreSession(examId, loadSession, onExamFailure);
  return false;
}
