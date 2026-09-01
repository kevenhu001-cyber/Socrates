/**
 * Shared contracts for the settings modal React migration boundary.
 *
 * React owns the overlay shell and the static skeleton (toggle, provider
 * list container, tone preset container, action buttons). Legacy
 * `ui/settings.js` renders the dynamic content (provider rows, tone
 * presets) into the React-owned containers and publishes the open state
 * plus the external-API toggle so React can mirror visibility and the
 * toggle track.
 */

export interface SettingsSnapshot {
  open: boolean;
  externalApiOn: boolean;
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
