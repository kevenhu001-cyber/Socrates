import { useEffect, useRef } from 'react';
import { createRoot } from 'react-dom/client';

import { getLegacyActions, t } from '../legacy/gateway';
import { installSettingsBridge } from './settingsStore';
import { useSettingsSnapshot } from './legacyAdapter';

const OVERLAY_ID = 'settingsOverlay';
const BODY_ID = 'settingsBody';

function SettingsModal() {
  const snap = useSettingsSnapshot();
  const bodyRef = useRef<HTMLDivElement>(null);

  // Apply the body HTML whenever the legacy renderer publishes new content
  useEffect(() => {
    if (bodyRef.current && snap.bodyHTML) {
      bodyRef.current.innerHTML = snap.bodyHTML;
    }
  }, [snap.bodyHTML]);

  // Close on overlay backdrop click
  const handleOverlayClick = (e: React.MouseEvent) => {
    if (
      (e.target as HTMLElement).getAttribute('data-action') === 'close-settings-overlay'
    ) {
      getLegacyActions().navigation.closeSettings();
    }
  };

  return (
    <div
      className={`settings-overlay${snap.open ? '' : ' hidden'}`}
      id={OVERLAY_ID}
      data-action="close-settings-overlay"
      onClick={handleOverlayClick}
    >
      <div className="settings-modal">
        <div className="settings-header">
          <span className="settings-title" data-i18n-key="settings.title">{t('settings.title')}</span>
          <button
            className="settings-close"
            id="settingsCloseBtn"
            onClick={() => {
              getLegacyActions().navigation.closeSettings();
            }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="settings-body" id={BODY_ID} ref={bodyRef} />
      </div>
    </div>
  );
}

/**
 * Mount the React settings modal. Creates a dedicated container outside
 * the legacy overlay so we can use `createRoot` without conflicts.
 * The legacy `openSettings()` / `closeSettings()` still manage visibility
 * and content generation; React renders the shell + applies body HTML.
 */
export function mountSettingsModal(): void {
  let container = document.getElementById('settingsModalReactRoot');
  if (!container) {
    container = document.createElement('div');
    container.id = 'settingsModalReactRoot';
    container.setAttribute('data-react-migration-runtime', 'settings-modal');
    document.body.appendChild(container);
  }

  if (container.dataset.settingsReactHydrated === '1') return;
  container.dataset.settingsReactHydrated = '1';

  installSettingsBridge();
  const root = createRoot(container);
  root.render(<SettingsModal />);
}
