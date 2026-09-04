/**
 * Legacy-facing helpers for the admin modal. main.js and the sidebar
 * chrome import from this module so the React / legacy split stays
 * behind one entry point.
 */

import { installAdminBridge } from './admin.bridge';
import type { AdminSnapshot, EmbeddingProviderConfig, SystemModelConfig } from './types';

type AdminAction = Omit<AdminSnapshot, 'revision'>;

export function publishAdminSnapshot(action: Partial<AdminAction> & { open: boolean }): void {
  const bridge = installAdminBridge();
  bridge.publish({
    open: action.open,
    loading: action.loading ?? false,
    error: action.error ?? null,
    systemModel: (action.systemModel ?? null) as SystemModelConfig | null,
    embedding: (action.embedding ?? null) as EmbeddingProviderConfig | null,
    isAdmin: action.isAdmin ?? false,
    adminGateError: action.adminGateError ?? null,
    savingSystem: action.savingSystem ?? false,
    savingEmbedding: action.savingEmbedding ?? false,
  });
}

export function closeAdminModal(): void {
  publishAdminSnapshot({ open: false });
}

export function openAdminModal(): void {
  publishAdminSnapshot({ open: true, loading: false, error: null });
}

export { installAdminBridge };
export type { AdminSnapshot };
