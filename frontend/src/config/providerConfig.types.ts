import type { ProviderCapabilities } from '@socrates/contracts';

export type ProviderField = 'label' | 'url' | 'model' | 'vision' | 'key';
export type ProviderErrorField = Exclude<ProviderField, 'vision'>;

/** Provider metadata shared by settings and model consumers. Credentials are never part of this type. */
export interface ProviderConfig {
  id: string;
  label: string;
  url: string;
  model: string;
  vision: boolean;
  isBuiltIn: boolean;
  hasKey: boolean;
  serverIsActive?: boolean;
  /* P_model-capability-registry — what the server knows the model can do.
     Absent means "not published": the browser then forwards the user's
     intent and lets the server resolve it, as it did before. */
  capabilities?: ProviderCapabilities;
}

export interface ProviderConfigErrors {
  [id: string]: Partial<Record<ProviderErrorField, string>>;
}

export interface ProviderConfigSnapshot {
  providers: readonly ProviderConfig[];
  activeId: string | null;
  fetched: boolean;
  saving: boolean;
  errors: ProviderConfigErrors;
  revision: number;
}

export type ProviderFieldValue = string | boolean;

export interface ProviderSaveResult {
  savedIds: string[];
  failedIds: string[];
}
