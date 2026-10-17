/* Session metadata edits share one persistence path. Reconcile only after the
 * server accepts the change; never mutate immutable React bridge snapshots. */
import { apiFetch } from '../util/api.ts';
import { serverCache } from './serverCache.ts';
import { stateStore } from '../state/store.js';
import { detailCache } from './detailCache.ts';

/** Fields the row menu can PATCH; anything else is passed through. */
export interface SessionMetadataPatch {
  title?: string | null;
  projectId?: string | null;
  [key: string]: unknown;
}

/** Recents renderer published by the legacy shell. */
interface RowActionsWindow extends Window {
  renderRecents?: () => void;
}

export async function updateSessionMetadata(id: string, patch: SessionMetadataPatch): Promise<void> {
  await apiFetch('/api/sessions/' + encodeURIComponent(id), { method: 'PATCH', body: patch });
  const row = serverCache.sessions.find((item) => item.id === id);
  if (row) Object.assign(row, patch);
  detailCache.invalidate(id);
  if (stateStore.read('currentSessionId') === id) {
    if ('title' in patch) stateStore.dispatch({ type: 'state/set', key: 'sessionTitle', value: patch.title });
    if ('projectId' in patch) stateStore.dispatch({ type: 'state/set', key: 'currentProjectId', value: patch.projectId });
  }
  (window as RowActionsWindow).renderRecents?.();
}
