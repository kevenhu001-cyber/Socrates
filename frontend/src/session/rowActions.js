/* Session metadata edits share one persistence path. Reconcile only after the
 * server accepts the change; never mutate immutable React bridge snapshots. */
import { apiFetch } from '../util/api.js';
import { serverCache } from './serverCache.js';
import { stateStore } from '../state/store.js';
import { detailCache } from './detailCache.js';

export async function updateSessionMetadata(id, patch) {
  await apiFetch('/api/sessions/' + encodeURIComponent(id), { method: 'PATCH', body: patch });
  const row = serverCache.sessions.find((item) => item.id === id);
  if (row) Object.assign(row, patch);
  detailCache.invalidate(id);
  if (stateStore.read('currentSessionId') === id) {
    if ('title' in patch) stateStore.dispatch({ type: 'state/set', key: 'sessionTitle', value: patch.title });
    if ('projectId' in patch) stateStore.dispatch({ type: 'state/set', key: 'currentProjectId', value: patch.projectId });
  }
  window.renderRecents?.();
}
