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

export interface ProviderListProps {
  id: string;
  providers: SettingsProviderSnapshot[];
  providerErrors: SettingsProviderErrors;
  externalApiOn: boolean;
  language: 'zh' | 'en';
  onFieldChange: (id: string, field: SettingsProviderField, value: string | boolean) => void;
  onKeyRef: (id: string, element: HTMLInputElement | null) => void;
  onLabelRef: (id: string, element: HTMLInputElement | null) => void;
  onSetActive: (id: string) => void;
  onRemove: (id: string) => void;
}

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
