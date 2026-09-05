import { hostIsMountedBy, markHostMountedBy } from '../lib/boot/ownership';
import { useEffect, useRef } from 'react';
import { createRoot } from 'react-dom/client';

import { getLegacyActions, i18n } from '../legacy/gateway';
import { installSettingsBridge, useSettingsSnapshot } from './settings.bridge';

const OVERLAY_ID = 'settingsOverlay';
const TRACK_ID = 'stgToggleTrack';
const PROVIDER_LIST_ID = 'providerList';
const TONE_OPTIONS_ID = 'tonePresetOptions';
const SAVE_BTN_ID = 'saveSettingsBtn';

function SettingsModal() {
  const snap = useSettingsSnapshot();
  const overlayRef = useRef<HTMLDivElement>(null);

  /* M4 step 4.5b — React owns the overlay now (static index.html markup
     removed). Legacy settings.js still renders the dynamic content
     (provider rows / tone preset buttons) into #providerList and
     #tonePresetOptions; React renders the empty containers so the
     legacy innerHTML writes survive React re-renders. */
  const legacy = getLegacyActions();

  /* Esc-to-close + focus management, replacing the legacy
     installModalA11y({ overlayId: 'settingsOverlay' }) registration
     (which ran before React mounted and would have found no element). */
  useEffect(() => {
    const overlay = overlayRef.current;
    if (!overlay) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.stopPropagation();
        legacy.navigation.closeSettings();
      }
    }
    overlay.addEventListener('keydown', onKey, true);
    return () => overlay.removeEventListener('keydown', onKey, true);
  }, [legacy]);

  useEffect(() => {
    if (!snap.open) return;
    const t1 = window.setTimeout(() => {
      const explicit = overlayRef.current?.querySelector('[data-initial-focus]') as
        | HTMLElement
        | null;
      if (explicit) {
        try { explicit.focus({ preventScroll: true }); } catch (_err) { /* focus is best-effort */ }
      }
    }, 50);
    return () => window.clearTimeout(t1);
  }, [snap.open]);

  const handleOverlayClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      legacy.navigation.closeSettings();
    }
  };

  return (
    <div
      ref={overlayRef}
      className={`settings-overlay${snap.open ? '' : ' hidden'}`}
      id={OVERLAY_ID}
      role="dialog"
      aria-modal="true"
      aria-labelledby="settingsTitle"
      onClick={handleOverlayClick}
    >
      <div className="settings-modal" onClick={(e) => e.stopPropagation()}>
        <div className="settings-header">
          <span className="settings-title" id="settingsTitle" data-i18n-key="settings.title">{i18n('settings.title', 'API Configuration')}</span>
          <button
            className="settings-close"
            id="settingsCloseBtn"
            aria-label="Close"
            data-initial-focus="true"
            onClick={() => legacy.navigation.closeSettings()}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="settings-body">
          <div className="stg-toggle" id="stgToggle" onClick={() => legacy.settings.toggleAPI()}>
            <span className="settings-label stg-toggle-label">{i18n('settings.useExternalApi', 'Use External API')}</span>
            <div className={`stg-toggle-track${snap.externalApiOn ? ' on' : ''}`} id={TRACK_ID}>
              <div className="stg-toggle-knob" />
            </div>
          </div>
          <div className="settings-field">
            <div className="settings-label-row">
              <span className="settings-label">{i18n('settings.models', 'Models')}</span>
              <button className="settings-btn-mini" id="addProviderBtn" onClick={() => legacy.settings.addProvider()}>
                {i18n('settings.addProvider', '+ Add')}
              </button>
            </div>
            <span className="settings-hint">
              {i18n('settings.providerHint', 'Configure one or more providers. Click the circle to set one as active.')}
            </span>
            <div
              className={`provider-list${snap.externalApiOn ? '' : ' collapsed'}`}
              id={PROVIDER_LIST_ID}
            />
          </div>
          <div id="stgStatus" />

          {/* Tone Presets */}
          <div className="settings-field">
            <div className="settings-label-row">
              <span className="settings-label">{i18n('settings.tone', 'AI Tone')}</span>
            </div>
            <span className="settings-hint">
              {i18n('settings.toneHint', 'Choose how the AI speaks to you. Works with the built-in AI and any provider you add.')}
            </span>
            <div className="tone-preset-options" id={TONE_OPTIONS_ID} />
          </div>

          <div className="settings-actions">
            <button className="settings-btn danger" id="clearSettingsBtn" onClick={() => legacy.settings.clearSettings()}>
              {i18n('settings.clearAll', 'Clear all')}
            </button>
            <button className="settings-btn secondary" id="cancelSettingsBtn" onClick={() => legacy.navigation.closeSettings()}>
              {i18n('common.cancel', 'Cancel')}
            </button>
            <button className="settings-btn primary" id={SAVE_BTN_ID} onClick={() => legacy.settings.saveSettings()}>
              {i18n('settings.save', 'Save')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Mount the React settings modal. Creates a dedicated container at body
 * level so `createRoot` owns the overlay shell. Legacy `openSettings()`
 * / `closeSettings()` still toggle visibility + publish bridge state;
 * React mirrors it and owns the interactive buttons (M4 step 4.5b).
 */
export function mountSettingsModal(): void {
  let container = document.getElementById('settingsModalReactRoot');
  if (!container) {
    container = document.createElement('div');
    container.id = 'settingsModalReactRoot';
    document.body.appendChild(container);
  }

  if (hostIsMountedBy(container, 'settings-modal')) return;
  markHostMountedBy(container, 'settings-modal');

  installSettingsBridge();
  const root = createRoot(container);
  root.render(<SettingsModal />);
}
