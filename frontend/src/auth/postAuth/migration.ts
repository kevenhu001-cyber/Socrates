import { apiFetch } from '../../util/api.ts';
import { reportSwallow } from '../../util/reportSwallow.ts';
import { buildLegacyMigrationPayload, type MigrationReport } from './flow.ts';

export interface MigrateLegacyStorageOptions {
  storage?: Storage;
  post?: typeof apiFetch;
  report?: MigrationReport;
}

/** Move local-only account data to the server once a new session is active. */
export async function migrateLegacyStorage(options: MigrateLegacyStorageOptions = {}): Promise<boolean> {
  const storage = options.storage || localStorage;
  const post = options.post || apiFetch;
  const report: MigrationReport = options.report || reportSwallow;
  let localApi: string | null;
  let localSessions: string | null;
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
