/** Module-owned admin state shared with the admin service and React. */

import { createImmutableBridge, useBridge } from '../../lib/bridge';
import type { AdminBridge, AdminSnapshot } from './types';

type Action = Omit<AdminSnapshot, 'revision'>;

const factoryBridge = createImmutableBridge<AdminSnapshot, Action>({
  initial: {
    open: false,
    loading: false,
    error: null,
    systemModel: null,
    embedding: null,
    isAdmin: false,
    adminGateError: null,
    savingSystem: false,
    savingEmbedding: false,
    revision: 0,
  },
  reducer: (_state, action) => ({
    ...action,
    systemModel: action.systemModel ? Object.freeze({ ...action.systemModel }) : null,
    embedding: action.embedding ? Object.freeze({ ...action.embedding }) : null,
  }),
});

const bridge: AdminBridge = Object.assign(factoryBridge, {
  publish: factoryBridge.dispatch,
}) as AdminBridge;

export function installAdminBridge(): AdminBridge {
  return bridge;
}

export function getAdminSnapshot(): AdminSnapshot {
  return installAdminBridge().getSnapshot();
}

export function subscribeToAdmin(listener: () => void): () => void {
  return installAdminBridge().subscribe(listener);
}

export function useAdminSnapshot(): AdminSnapshot {
  return useBridge(factoryBridge);
}
