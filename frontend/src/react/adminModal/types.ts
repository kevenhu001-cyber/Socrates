/**
 * Shared contracts for the admin modal React migration boundary.
 *
 * React owns the overlay shell and the form skeleton (system model +
 * embedding provider cards). The bridge publishes the fetch state so
 * React re-renders when the admin API answers.
 */

export interface SystemModelConfig {
  id: string;
  label: string;
  url: string;
  model: string;
  keyHint: string | null;
  isActive: boolean;
  isMultimodal: boolean;
  hasKey: boolean;
}

export interface EmbeddingProviderConfig {
  id: string;
  label: string;
  url: string;
  model: string;
  keyHint: string | null;
  dimensions: number;
  isActive: boolean;
  hasKey: boolean;
}

export interface AdminSnapshot {
  open: boolean;
  loading: boolean;
  error: string | null;
  systemModel: SystemModelConfig | null;
  embedding: EmbeddingProviderConfig | null;
  isAdmin: boolean;
  adminGateError: string | null;
  savingSystem: boolean;
  savingEmbedding: boolean;
  revision: number;
}

export interface AdminBridge {
  getSnapshot: () => AdminSnapshot;
  publish: (snapshot: Omit<AdminSnapshot, 'revision'>) => void;
  subscribe: (listener: () => void) => () => void;
}

declare global {
  interface Window {
    __socratesAdminBridge?: AdminBridge;
    closeAdminModal?: () => void;
  }
}
