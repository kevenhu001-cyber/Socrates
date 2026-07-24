/**
 * Shared contracts for the settings modal React migration boundary.
 *
 * The legacy `ui/settings.js` generates the full settings body HTML.
 * This bridge publishes the open state and body HTML so the React
 * shell can render them declaratively.
 */

export interface SettingsSnapshot {
  open: boolean;
  bodyHTML: string;
  revision: number;
}

export interface SettingsBridge {
  getSnapshot: () => SettingsSnapshot;
  publish: (snapshot: Omit<SettingsSnapshot, 'revision'>) => void;
  subscribe: (listener: () => void) => () => void;
}

declare global {
  interface Window {
    __socratesSettingsBridge?: SettingsBridge;
    closeSettings?: () => void;
  }
}
