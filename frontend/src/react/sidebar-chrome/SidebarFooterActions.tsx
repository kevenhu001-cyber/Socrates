import { Button } from '../ui/shadcn/button';
import { Icon } from '../../legacy/Icon';
import { i18n } from '../../ui/legacyI18n.ts';
import { openSettings } from '../settings/settings.service.ts';
import { preloadSettingsPage } from '../settings/settings.preload.ts';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { restingRect } from '../../legacy/pressFeedback.ts';
import {
  DISPLAY_PREFS_CHANGE_EVENT,
  DISPLAY_PREFS_TOGGLE_EVENT,
  getThemePreference,
  getThemeStyle,
  setThemePreference,
  setThemeStyle,
  toggleTheme,
} from '../../displayPrefs.ts';

function t(key: string, fallback: string): string {
  return i18n(key, fallback);
}

function ThemeToggleIcon() {
  return (
    <>
      <Icon name="sun" className="theme-sun" />
      <Icon name="moon" className="theme-moon" />
    </>
  );
}

function ThemeSelection({ theme, themeStyle }: { theme: string; themeStyle: string }) {
  return (
    <>
      <div className="display-prefs-row">
        <div className="display-prefs-label">
          <span data-i18n-key="display.theme">{t('display.theme', 'Theme')}</span>
        </div>
        <div
          className="display-prefs-segs display-theme-segs"
          id="displayThemeSegs"
          role="radiogroup"
          data-i18n-aria="display.theme"
          aria-label={t('display.theme', 'Theme')}
        >
          {(['system', 'light', 'dark'] as const).map((option) => (
            <Button
              key={option}
              variant="ghost"
              size="xs"
              type="button"
              className={`display-prefs-seg${theme === option ? ' on' : ''}`}
              data-theme-option={option}
              role="radio"
              aria-checked={theme === option}
              data-i18n-key={`display.theme${option[0].toUpperCase()}${option.slice(1)}`}
              onClick={() => setThemePreference(option)}
            >
              {t(
                `display.theme${option[0].toUpperCase()}${option.slice(1)}`,
                option[0].toUpperCase() + option.slice(1),
              )}
            </Button>
          ))}
        </div>
      </div>
      <div className="display-prefs-row">
        <div className="display-prefs-label">
          <span data-i18n-key="display.themeStyle">{t('display.themeStyle', 'Theme style')}</span>
        </div>
        <div
          className="display-prefs-segs display-theme-style-segs"
          id="displayThemeStyleSegs"
          role="radiogroup"
          data-i18n-aria="display.themeStyle"
          aria-label={t('display.themeStyle', 'Theme style')}
        >
          {(['socrates', 'philosophy'] as const).map((option) => {
            const key = option === 'socrates' ? 'display.styleModern' : 'display.stylePhilosophy';
            const fallback = option === 'socrates' ? 'Modern' : 'Philosophy';
            return (
              <Button
                key={option}
                variant="ghost"
                size="xs"
                type="button"
                className={`display-prefs-seg${themeStyle === option ? ' on' : ''}`}
                data-theme-style-option={option}
                role="radio"
                aria-checked={themeStyle === option}
                data-i18n-key={key}
                onClick={() => setThemeStyle(option)}
              >
                {t(key, fallback)}
              </Button>
            );
          })}
        </div>
      </div>
    </>
  );
}

function DisplayPreferences({ open, onClose }: { open: boolean; onClose: () => void }) {
  const popoverRef = useRef<HTMLDivElement>(null);
  const [theme, setTheme] = useState(() => getThemePreference());
  const [themeStyle, setThemeStyleValue] = useState(() => getThemeStyle());

  const refresh = useCallback(() => {
    setTheme(getThemePreference());
    setThemeStyleValue(getThemeStyle());
  }, []);

  useEffect(() => {
    window.addEventListener(DISPLAY_PREFS_CHANGE_EVENT, refresh);
    return () => window.removeEventListener(DISPLAY_PREFS_CHANGE_EVENT, refresh);
  }, [refresh]);

  useEffect(() => {
    if (!open) return;
    const onDocumentClick = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (
        popoverRef.current?.contains(target) ||
        document.getElementById('displayPrefsBtn')?.contains(target)
      )
        return;
      onClose();
    };
    document.addEventListener('click', onDocumentClick, true);
    return () => document.removeEventListener('click', onDocumentClick, true);
  }, [open, onClose]);

  useLayoutEffect(() => {
    if (!open) return;
    const popover = popoverRef.current;
    const trigger = document.getElementById('displayPrefsBtn');
    if (!popover || !(trigger instanceof HTMLElement)) return;

    const rect = restingRect(trigger);
    popover.style.left = `${Math.max(8, rect.right - 240)}px`;
    popover.style.bottom = `${window.innerHeight - rect.top + 8}px`;
    popover.style.right = 'auto';
    popover.style.top = 'auto';

    for (const wrap of popover.querySelectorAll<HTMLElement>('.display-prefs-segs')) {
      const selected = wrap.querySelector<HTMLElement>('.display-prefs-seg.on');
      if (!selected) continue;
      const applyIndicator = () => {
        const width = selected.offsetWidth;
        if (width === 0) return;
        wrap.style.setProperty('--seg-x', `${selected.offsetLeft}px`);
        wrap.style.setProperty('--seg-w', `${width}px`);
      };
      if (!wrap.style.getPropertyValue('--seg-x') || !wrap.style.getPropertyValue('--seg-w'))
        requestAnimationFrame(applyIndicator);
      else applyIndicator();
    }
  }, [open, theme, themeStyle]);

  return (
    <div
      ref={popoverRef}
      className={`display-prefs-popover${open ? '' : ' hidden'}`}
      id="displayPrefsPopover"
      aria-hidden={!open}
    >
      <ThemeSelection theme={theme} themeStyle={themeStyle} />
      <Button
        variant="ghost"
        type="button"
        className="display-prefs-all"
        data-i18n-key="display.allSettings"
        onClick={() => {
          onClose();
          void openSettings({ section: 'display' });
        }}
      >
        {t('display.allSettings', 'All display settings')}
      </Button>
    </div>
  );
}

export function SidebarFooterActions() {
  const [displayPrefsOpen, setDisplayPrefsOpen] = useState(false);
  const closeDisplayPrefs = useCallback(() => setDisplayPrefsOpen(false), []);

  useEffect(() => {
    const toggle = () => setDisplayPrefsOpen((open) => !open);
    document.addEventListener(DISPLAY_PREFS_TOGGLE_EVENT, toggle);
    return () => document.removeEventListener(DISPLAY_PREFS_TOGGLE_EVENT, toggle);
  }, []);

  return (
    <>
      <Button
        variant="ghost"
        size="icon-sm"
        type="button"
        className="btn-icon sm theme-toggle"
        id="themeToggle"
        title={t('display.themeToggle', 'Toggle theme')}
        aria-label={t('display.themeToggle', 'Toggle theme')}
        data-i18n-title="display.themeToggle"
        data-i18n-aria="display.themeToggle"
        onClick={() => {
          toggleTheme();
          closeDisplayPrefs();
        }}
      >
        <ThemeToggleIcon />
      </Button>
      <Button
        variant="ghost"
        size="icon-sm"
        type="button"
        className="btn-icon sm"
        id="displayPrefsBtn"
        title={t('chrome.displaySettings', 'Display settings')}
        aria-label={t('chrome.displaySettings', 'Display settings')}
        data-i18n-title="chrome.displaySettings"
        data-i18n-aria="chrome.displaySettings"
        aria-expanded={displayPrefsOpen}
        aria-controls="displayPrefsPopover"
        onClick={() => setDisplayPrefsOpen((open) => !open)}
      >
        <Icon name="sliders" />
      </Button>
      <Button
        variant="ghost"
        size="icon-sm"
        type="button"
        className="btn-icon sm"
        id="apiSettingsBtn"
        title={t('chrome.apiSettings', 'API Settings')}
        aria-label={t('chrome.apiSettings', 'API Settings')}
        data-i18n-title="chrome.apiSettings"
        data-i18n-aria="chrome.apiSettings"
        onPointerEnter={preloadSettingsPage}
        onPointerDown={preloadSettingsPage}
        onFocus={preloadSettingsPage}
        onClick={() => {
          void openSettings();
        }}
      >
        <Icon name="gear" />
      </Button>
      <DisplayPreferences open={displayPrefsOpen} onClose={closeDisplayPrefs} />
    </>
  );
}
