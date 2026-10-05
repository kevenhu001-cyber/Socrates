import type {
  ProviderConfig,
  ProviderConfigErrors,
  ProviderErrorField,
  ProviderField,
  ProviderSaveResult,
} from '../../config/providerConfig.types';

export type SettingsProviderField = ProviderField;
export type SettingsProviderErrorField = ProviderErrorField;
export type SettingsProviderSnapshot = ProviderConfig & { isActive: boolean };
export type SettingsProviderErrors = ProviderConfigErrors;
export type SettingsProviderSaveResult = ProviderSaveResult;

export interface SettingsSnapshot {
  open: boolean;
  externalApiOn: boolean;
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
