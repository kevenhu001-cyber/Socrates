import { hostIsMountedBy, markHostMountedBy } from '../lib/boot/ownership';
import { useEffect, useRef, useState } from 'react';
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
  const [section, setSection] = useState('general');
  const [query, setQuery] = useState('');
  const [uiLang, setUiLang] = useState(() => (window as any)._currentLang === 'en' ? 'en' : 'zh');
  const [saveError, setSaveError] = useState('');
  const [notifications, setNotifications] = useState(() => {
    try { return localStorage.getItem('socrates-notifications') !== 'off'; } catch { return true; }
  });
  const [imageModel, setImageModel] = useState(() => {
    try { return localStorage.getItem('socrates-image-model') || ''; } catch { return ''; }
  });
  const [voiceLanguage, setVoiceLanguage] = useState(() => localStorage.getItem('socrates-voice-language') || 'auto');
  const lang = uiLang;
  const label = (zh: string, en: string) => lang === 'zh' ? zh : en;
  const savePreference = async (patch: Record<string, unknown>) => {
    try {
      const result = await (window as any).apiFetch('/api/users/me/preferences', { method: 'PATCH', body: patch });
      if ((window as any).CURRENT_USER) (window as any).CURRENT_USER.preferences = result.preferences;
      setSaveError('');
    } catch {
      setSaveError(label('偏好已保存在此设备；账户同步暂不可用。', 'Saved on this device; account sync is unavailable.'));
    }
  };
  const categories = [
    ['general', label('通用', 'General')], ['notifications', label('通知', 'Notifications')],
    ['personalization', label('个性化', 'Personalization')], ['models', label('模型与语音', 'Models & voice')],
    ['apps', label('应用与连接', 'Apps & connections')], ['data', label('数据管理', 'Data controls')],
    ['account', label('账户', 'Account')],
  ];

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
      <div className="settings-modal settings-modal--full" onClick={(e) => e.stopPropagation()}>
        <div className="settings-header">
          <span className="settings-title" id="settingsTitle">{label('设置', 'Settings')}</span>
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
        <div className="settings-shell">
          <aside className="settings-nav" aria-label={label('设置分类', 'Settings categories')}>
            <input type="search" placeholder={label('搜索设置', 'Search settings')} aria-label={label('搜索设置', 'Search settings')} value={query} onChange={(event) => setQuery(event.target.value)} />
            {categories.filter(([, name]) => name.toLowerCase().includes(query.toLowerCase())).map(([key, name]) => (
              <button key={key} className={section === key ? 'active' : ''} onClick={() => setSection(key)}>{name}</button>
            ))}
          </aside>
        <div className="settings-body">
          <section className="settings-pane" hidden={section !== 'general'}>
            <h2>{label('通用', 'General')}</h2>
            <label className="settings-choice">{label('外观', 'Appearance')}
              <select value={document.documentElement.getAttribute('data-theme-preference') || 'system'} onChange={(event) => {
                document.querySelector<HTMLElement>(`[data-theme-option="${event.target.value}"]`)?.click();
                void savePreference({ theme: event.target.value });
              }}>
                <option value="system">{label('跟随系统', 'System')}</option><option value="light">{label('浅色', 'Light')}</option><option value="dark">{label('深色', 'Dark')}</option>
              </select>
            </label>
            <label className="settings-choice">{label('语言', 'Language')}
              <select value={lang} onChange={(event) => { setUiLang(event.target.value); (window as any).setLang?.(event.target.value); void savePreference({ language: event.target.value }); }}>
                <option value="zh">中文</option><option value="en">English</option>
              </select>
            </label>
          </section>
          <section className="settings-pane" hidden={section !== 'notifications'}>
            <h2>{label('通知', 'Notifications')}</h2>
            <label className="settings-choice">{label('显示任务与消息通知', 'Show task and message notifications')}
              <input type="checkbox" checked={notifications} onChange={(event) => { setNotifications(event.target.checked); localStorage.setItem('socrates-notifications', event.target.checked ? 'on' : 'off'); void savePreference({ notifications: event.target.checked }); }} />
            </label>
          </section>
          <section className="settings-pane" hidden={section !== 'apps'}>
            <h2>{label('应用与连接', 'Apps & connections')}</h2>
            <p>{label('管理已连接的插件与服务。', 'Manage connected plugins and services.')}</p>
            <button className="settings-btn secondary" onClick={() => { legacy.navigation.closeSettings(); legacy.navigation.openNav('plugins'); }}>{label('打开插件', 'Open plugins')}</button>
          </section>
          <section className="settings-pane" hidden={section !== 'data'}>
            <h2>{label('数据管理', 'Data controls')}</h2>
            <p>{label('你的文件和作品保存在资料库，可随时逐项删除。', 'Your files and artifacts are in Library, where you can remove them individually.')}</p>
            <button className="settings-btn secondary" onClick={() => { legacy.navigation.closeSettings(); legacy.navigation.openNav('library'); }}>{label('打开资料库', 'Open library')}</button>
          </section>
          <section className="settings-pane" hidden={section !== 'account'}>
            <h2>{label('账户', 'Account')}</h2>
            <p>{label('套餐与用量沿用当前 Socrates 账户。', 'Your plan and usage follow your current Socrates account.')}</p>
            <button className="settings-btn secondary" onClick={() => (window as any).openProfile?.()}>{label('查看账户', 'View account')}</button>
          </section>
          <section className="settings-pane" hidden={section !== 'personalization'}>
            <h2>{label('个性化', 'Personalization')}</h2>
            <p>{label('选择助手的说话风格。', 'Choose how Socrates speaks in a session.')}</p>
            <div className="tone-preset-options" id={TONE_OPTIONS_ID} />
          </section>
          <div className="settings-pane" hidden={section !== 'models'}>
          <div className="settings-hero">
            <div>
              <h2 className="settings-hero-title">{label('模型与语音', 'Models & voice')}</h2>
              <p className="settings-hero-subtitle">{label('配置对话和图片模型。语音输入使用浏览器麦克风。', 'Configure chat and image models. Voice input uses your browser microphone.')}</p>
            </div>
          </div>
          <section className="settings-section">
            <div className="settings-section-head">
              <h3>Connection</h3>
              <p>Choose whether Socrates may use your own API credentials.</p>
            </div>
            <div className="settings-card settings-card--toggle">
              <div className="stg-toggle" id="stgToggle" onClick={() => legacy.settings.toggleAPI()}>
                <span className="settings-label stg-toggle-label">{i18n('settings.useExternalApi', 'Use External API')}</span>
                <div className={`stg-toggle-track${snap.externalApiOn ? ' on' : ''}`} id={TRACK_ID}>
                  <div className="stg-toggle-knob" />
                </div>
              </div>
            </div>
          </section>
          <section className="settings-section">
            <div className="settings-section-head">
              <h3>Model providers</h3>
              <p>Add a provider or choose the active model.</p>
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
          </section>
          <div id="stgStatus" />
          <section className="settings-section">
            <div className="settings-section-head">
              <h3>{label('图片模型', 'Image model')}</h3>
              <p>{label('填写当前图片服务支持的模型 ID。', 'Enter the model ID supported by your image provider.')}</p>
            </div>
            <div className="settings-field">
              <input className="settings-input" value={imageModel} placeholder="gpt-image-1" onChange={(event) => { setImageModel(event.target.value); localStorage.setItem('socrates-image-model', event.target.value); }} />
              <button className="settings-btn secondary" onClick={() => void savePreference({ imageModel })}>{label('同步图片模型', 'Sync image model')}</button>
            </div>
          </section>
          <section className="settings-section">
            <div className="settings-section-head"><h3>{label('语音输入语言', 'Voice input language')}</h3></div>
            <label className="settings-choice">{label('识别语言', 'Recognition language')}
              <select value={voiceLanguage} onChange={(event) => { setVoiceLanguage(event.target.value); localStorage.setItem('socrates-voice-language', event.target.value); void savePreference({ voiceLanguage: event.target.value }); }}>
                <option value="auto">{label('自动', 'Automatic')}</option><option value="zh-CN">中文</option><option value="en-US">English</option>
              </select>
            </label>
          </section>

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
          {saveError ? <p className="settings-save-error" role="status">{saveError}</p> : null}
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
