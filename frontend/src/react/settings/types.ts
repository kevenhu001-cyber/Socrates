export type SettingsProviderField = 'label' | 'url' | 'key' | 'model' | 'vision';
export type SettingsProviderErrorField = Exclude<SettingsProviderField, 'vision'>;

export interface SettingsProviderSnapshot {
  id: string;
  label: string;
  url: string;
  model: string;
  vision: boolean;
  isBuiltIn: boolean;
  isActive: boolean;
  hasKey: boolean;
}

export type SettingsProviderDraft = Partial<Pick<SettingsProviderSnapshot, 'label' | 'url' | 'model' | 'vision'>>;

export type SettingsProviderErrors = Record<
  string,
  Partial<Record<SettingsProviderErrorField, string>>
>;

export interface SettingsProviderSaveResult {
  savedIds: string[];
  failedIds: string[];
}

export interface SettingsSnapshot {
  open: boolean;
  externalApiOn: boolean;
  providers: SettingsProviderSnapshot[];
  providerErrors: SettingsProviderErrors;
  saving: boolean;
  revision: number;
}

export interface SettingsBridge {
  getSnapshot: () => SettingsSnapshot;
  publish: (snapshot: Partial<Omit<SettingsSnapshot, 'revision'>>) => void;
  subscribe: (listener: () => void) => () => void;
}

declare global {
  interface Window {
    __socratesSettingsBridge?: SettingsBridge;
    closeSettings?: () => void;
  }
}
