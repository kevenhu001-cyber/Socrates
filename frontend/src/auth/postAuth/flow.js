/** Build the one-time migration request from legacy browser storage. */
export function buildLegacyMigrationPayload(localSessions, localApi, report = () => null) {
  const payload = {};
  if (localSessions) {
    try {
      const sessions = JSON.parse(localSessions);
      if (Array.isArray(sessions) && sessions.length) payload.localSessions = sessions;
    } catch (error) { report(error, 'auth/postAuth.migrate.parseSessions'); }
  }
  if (localApi) {
    try {
      const config = JSON.parse(localApi);
      const providers = config && Array.isArray(config.providers) ? config.providers : [];
      const provider = providers.find((item) => item.id === config.activeId) || providers[0];
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

/** Retry bootstrap reads only for a 401 during the fresh-session cookie window. */
export async function fetchWithAuthGraceRetry(fetcher, options = {}) {
  if (typeof fetcher !== 'function') return null;
  const isInGraceWindow = options.isInGraceWindow || (() => false);
  const wait = options.wait || ((milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)));
  try {
    return await fetcher();
  } catch (error) {
    if (!error || error.status !== 401 || !isInGraceWindow()) throw error;
    await wait(500);
    return fetcher();
  }
}

async function tryRestoreSession(id, loadSession, onFailure) {
  try {
    await loadSession(id);
    return true;
  } catch (error) {
    onFailure(error);
    return false;
  }
}

/** Restore the chat or exam route after the user's bootstrap data has loaded. */
export async function restoreRoutedSession(options) {
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
