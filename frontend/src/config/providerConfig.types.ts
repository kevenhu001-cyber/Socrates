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
