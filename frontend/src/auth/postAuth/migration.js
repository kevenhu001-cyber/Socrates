import { apiFetch } from '../../util/api.js';
import { reportSwallow } from '../../util/reportSwallow.ts';
import { buildLegacyMigrationPayload } from './flow.js';

/** Move local-only account data to the server once a new session is active. */
export async function migrateLegacyStorage(options = {}) {
  const storage = options.storage || localStorage;
  const post = options.post || apiFetch;
  const report = options.report || reportSwallow;
  let localApi;
  let localSessions;
  try {
    localApi = storage.getItem('socrates-api');
    localSessions = storage.getItem('socrates-sessions-v2');
  } catch (error) {
    report(error, 'auth/postAuth.migrate.setup');
    return false;
  }

  const payload = buildLegacyMigrationPayload(localSessions, localApi, report);
  if (!payload) return false;
  try {
    await post('/api/migrate', { method: 'POST', body: payload });
  } catch (error) {
    report(error, 'auth/postAuth.migrate.post');
    return false;
  }

  try { storage.removeItem('socrates-sessions-v2'); }
  catch (error) { report(error, 'auth/postAuth.migrate.clearSessions', 'expected'); }
  try { storage.removeItem('socrates-api'); }
  catch (error) { report(error, 'auth/postAuth.migrate.clearApi', 'expected'); }
  return true;
}
