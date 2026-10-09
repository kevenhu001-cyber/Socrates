import { getAdminSnapshot } from './admin.bridge';
import { publishAdminSnapshot } from './legacyApi';
import type { AdminSnapshot } from './types';

type AdminSnapshotPatch = Partial<Omit<AdminSnapshot, 'open' | 'revision'>>;

export function publishAdminPatch(patch: AdminSnapshotPatch): void {
  const current = getAdminSnapshot();
  publishAdminSnapshot({
    open: true,
    loading: patch.loading ?? current.loading,
    error: patch.error === undefined ? current.error : patch.error,
    systemModel: patch.systemModel === undefined ? current.systemModel : patch.systemModel,
    embedding: patch.embedding === undefined ? current.embedding : patch.embedding,
    isAdmin: patch.isAdmin ?? current.isAdmin,
    adminGateError: patch.adminGateError === undefined ? current.adminGateError : patch.adminGateError,
    savingSystem: patch.savingSystem ?? current.savingSystem,
    savingEmbedding: patch.savingEmbedding ?? current.savingEmbedding,
  });
}
