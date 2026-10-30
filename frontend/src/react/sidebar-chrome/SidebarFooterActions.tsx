import { Button } from '../ui/shadcn/button';
import { NativeControl } from '../ui/NativeControl';
import { i18n } from '../legacy/gateway.ts';
import { useState } from 'react';
import {
  DEFAULT_DARK_PICKER,
  DEFAULT_LIGHT_PICKER,
} from '../../ui/tokens.ts';
import {
  DISPLAY_FONT_STEPS,
  DISPLAY_WIDTH_STEPS,
  FONT_LABELS,
  WIDTH_LABELS,
  displayPrefs,
  getThemePreference,
  getThemeStyle,
  setBackgroundDark,
  setBackgroundLight,
} from '../../displayPrefs.ts';

function t(key: string, fallback: string): string {
  return i18n(key, fallback);
}

function ThemeToggleIcon() {
  return <>
    <svg className="theme-sun" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false"><circle cx="12" cy="12" r="3.75" /><path d="M12 3v1.5M12 19.5V21M3 12h1.5M19.5 12H21M5.6 5.6l1 1m10.8 10.8 1 1M5.6 18.4l1-1M17.4 6.6l1-1" /></svg>
    <svg className="theme-moon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false"><path d="M20.2 13.7A8.5 8.5 0 0 1 10.3 3.8a8.5 8.5 0 1 0 9.9 9.9Z" /></svg>
  </>;
}

function DisplayPreferences() {
  const [display, setDisplay] = useState(() => ({ ...displayPrefs }));
  const apply = (mutation: () => void) => {
    mutation();
    setDisplay({ ...displayPrefs });
  };
  const theme = getThemePreference();
  const themeStyle = getThemeStyle();

  return <div className="display-prefs-popover hidden" id="displayPrefsPopover">
    <div className="display-prefs-row">
      <div className="display-prefs-label"><span data-i18n-key="display.theme">{t('display.theme', 'Theme')}</span></div>
      <div className="display-prefs-segs display-theme-segs" id="displayThemeSegs" role="radiogroup" data-i18n-aria="display.theme" aria-label={t('display.theme', 'Theme')}>
        {(['system', 'light', 'dark'] as const).map((option) => (
          <Button key={option} variant="ghost" size="xs" type="button" className={`display-prefs-seg${theme === option ? ' on' : ''}`}
            data-theme-option={option} role="radio" aria-checked={theme === option}
            data-i18n-key={`display.theme${option[0].toUpperCase()}${option.slice(1)}`}>
            {t(`display.theme${option[0].toUpperCase()}${option.slice(1)}`, option[0].toUpperCase() + option.slice(1))}
          </Button>
        ))}
      </div>
    </div>

    <div className="display-prefs-row">
      <div className="display-prefs-label"><span data-i18n-key="display.themeStyle">{t('display.themeStyle', 'Theme style')}</span></div>
      <div className="display-prefs-segs display-theme-style-segs" id="displayThemeStyleSegs" role="radiogroup" data-i18n-aria="display.themeStyle" aria-label={t('display.themeStyle', 'Theme style')}>
        {(['socrates', 'philosophy'] as const).map((option) => {
          const key = option === 'socrates' ? 'display.styleModern' : 'display.stylePhilosophy';
          const fallback = option === 'socrates' ? 'Modern' : 'Philosophy';
          return <Button key={option} variant="ghost" size="xs" type="button" className={`display-prefs-seg${themeStyle === option ? ' on' : ''}`}
            data-theme-style-option={option} role="radio" aria-checked={themeStyle === option} data-i18n-key={key}>
            {t(key, fallback)}
          </Button>;
        })}
      </div>
    </div>

    <div className="display-prefs-row">
      <div className="display-prefs-label"><span data-i18n-key="sidebar.textSize">{t('sidebar.textSize', 'Text size')}</span></div>
      <div className="display-prefs-segs" id="displayPrefsFontSegs" role="radiogroup" data-i18n-aria="sidebar.textSize" aria-label={t('sidebar.textSize', 'Text size')}>
        {DISPLAY_FONT_STEPS.map((step, index) => (
          <Button key={step} variant="ghost" size="xs" type="button" className={`display-prefs-seg${display.font === step ? ' on' : ''}`}
            role="radio" aria-checked={display.font === step} data-font={step}>{FONT_LABELS[index]}</Button>
        ))}
      </div>
    </div>

    <div className="display-prefs-row">
      <div className="display-prefs-label"><span data-i18n-key="sidebar.contentWidth">{t('sidebar.contentWidth', 'Content width')}</span></div>
      <div className="display-prefs-segs" id="displayPrefsWidthSegs" role="radiogroup" data-i18n-aria="sidebar.contentWidth" aria-label={t('sidebar.contentWidth', 'Content width')}>
        {DISPLAY_WIDTH_STEPS.map((step, index) => {
          const keys = ['sidebar.narrow', 'sidebar.medium', 'sidebar.wide', 'sidebar.fullWidth'];
          const fallbacks = ['Narrow', 'Medium', 'Wide', 'Full width'];
          return <Button key={step} variant="ghost" size="xs" type="button" className={`display-prefs-seg${display.width === step ? ' on' : ''}`}
            role="radio" aria-checked={display.width === step} data-width={step}
            title={t(keys[index], fallbacks[index])} data-i18n-title={keys[index]}>{WIDTH_LABELS[index]}</Button>;
        })}
      </div>
    </div>

    <div className="display-prefs-row display-prefs-toggle-row">
      <div className="display-prefs-label"><span data-i18n-key="chrome.backgroundGrid">{t('chrome.backgroundGrid', 'Background grid')}</span></div>
      <Button variant="ghost" size="icon-xs" type="button" className={`grid-toggle${display.showGrid !== false ? ' on' : ''}`}
        id="gridToggle" role="switch" aria-checked={display.showGrid !== false}
        title={t('chrome.toggleBackgroundGrid', 'Toggle background grid')}
        aria-label={t('chrome.toggleBackgroundGrid', 'Toggle background grid')}
        data-i18n-title="chrome.toggleBackgroundGrid" data-i18n-aria="chrome.toggleBackgroundGrid">
        <span className="toggle-knob" />
      </Button>
    </div>

    <div className="display-prefs-row">
      <div className="display-prefs-label"><span data-i18n-key="chrome.darkModeBg">{t('chrome.darkModeBg', 'Dark mode BG')}</span></div>
      <div className="display-prefs-bg-picker">
        <NativeControl type="color" id="displayPrefsBgDark" value={display.darkBg || DEFAULT_DARK_PICKER}
          onChange={(event) => apply(() => setBackgroundDark(event.currentTarget.value))}
          title={t('chrome.darkModePageBg', 'Dark mode page background')} data-i18n-title="chrome.darkModePageBg" />
        <Button variant="ghost" size="icon-xs" type="button" className="display-prefs-bg-reset" id="displayPrefsBgDarkReset"
          title={t('chrome.resetDarkBg', 'Reset dark mode to theme default')} data-i18n-title="chrome.resetDarkBg">↺</Button>
      </div>
    </div>

    <div className="display-prefs-row">
      <div className="display-prefs-label"><span data-i18n-key="chrome.lightModeBg">{t('chrome.lightModeBg', 'Light mode BG')}</span></div>
      <div className="display-prefs-bg-picker">
        <NativeControl type="color" id="displayPrefsBgLight" value={display.lightBg || DEFAULT_LIGHT_PICKER}
          onChange={(event) => apply(() => setBackgroundLight(event.currentTarget.value))}
          title={t('chrome.lightModePageBg', 'Light mode page background')} data-i18n-title="chrome.lightModePageBg" />
        <Button variant="ghost" size="icon-xs" type="button" className="display-prefs-bg-reset" id="displayPrefsBgLightReset"
          title={t('chrome.resetLightBg', 'Reset light mode to theme default')} data-i18n-title="chrome.resetLightBg">↺</Button>
      </div>
    </div>
  </div>;
}

export function SidebarFooterActions() {
  return <>
    <Button variant="ghost" size="icon-sm" type="button" className="btn-icon theme-toggle" id="themeToggle"
      title={t('display.themeToggle', 'Toggle theme')} aria-label={t('display.themeToggle', 'Toggle theme')}
      data-i18n-title="display.themeToggle" data-i18n-aria="display.themeToggle"><ThemeToggleIcon /></Button>
    <Button variant="ghost" size="icon-sm" type="button" className="btn-icon" id="displayPrefsBtn"
      title={t('chrome.displaySettings', 'Display settings')} aria-label={t('chrome.displaySettings', 'Display settings')}
      data-i18n-title="chrome.displaySettings" data-i18n-aria="chrome.displaySettings">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false"><path d="M4 7h7m4 0h5M4 17h3m4 0h9" /><circle cx="13" cy="7" r="2" /><circle cx="9" cy="17" r="2" /></svg>
    </Button>
    <Button variant="ghost" size="icon-sm" type="button" className="btn-icon" id="apiSettingsBtn"
      title={t('chrome.apiSettings', 'API Settings')} aria-label={t('chrome.apiSettings', 'API Settings')}
      data-i18n-title="chrome.apiSettings" data-i18n-aria="chrome.apiSettings">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false"><path d="m9.5 4 .5-1h4l.5 1 .6 1.8 1.9.5 1.8-.4 2 3.4-1.3 1.3-.5 1.4.5 1.4 1.3 1.3-2 3.4-1.8-.4-1.9.5-.6 1.8-.5 1h-4l-.5-1-.6-1.8-1.9-.5-1.8.4-2-3.4 1.3-1.3.5-1.4-.5-1.4-1.3-1.3 2-3.4 1.8.4 1.9-.5.6-1.8Z" /><circle cx="12" cy="12" r="3" /></svg>
    </Button>
    <DisplayPreferences />
  </>;
}
