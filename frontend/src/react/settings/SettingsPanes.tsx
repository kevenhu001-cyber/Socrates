import { useEffect, useRef, useState, type ComponentType } from 'react';
import type { SaveSettingsPreference, SettingsLabel, SettingsSection } from './settings.types';

interface SettingsPanesProps {
  section: SettingsSection;
  language: 'zh' | 'en';
  externalApiOn: boolean;
  label: SettingsLabel;
  savePreference: SaveSettingsPreference;
  reportSaveError: (message: string) => void;
  onLanguageChange: (language: string) => void;
}

type PaneProps = Omit<SettingsPanesProps, 'section'> & { hidden: boolean };
// Keep export names beside their imports so retries select the same pane.
const panes = {
  general: { name: 'GeneralSettingsPane', load: () => import('./GeneralSettingsPane') },
  display: { name: 'DisplaySettingsPane', load: () => import('./DisplaySettingsPane') },
  notifications: { name: 'NotificationsSettingsPane', load: () => import('./SettingsUtilityPanes') },
  personalization: { name: 'PersonalizationSettingsPane', load: () => import('./PersonalizationSettingsPane') },
  models: { name: 'ModelsSettingsPane', load: () => import('./ModelsSettingsPane') },
  apps: { name: 'AppConnectionsSettingsPane', load: () => import('./SettingsUtilityPanes') },
  data: { name: 'DataControlsSettingsPane', load: () => import('./SettingsUtilityPanes') },
  account: { name: 'AccountSettingsPane', load: () => import('./AccountSettingsPane') },
} as const;

function failedModuleUrl(error: unknown): URL | null {
  // Browsers cache rejected module fetches. Only a same-origin JS module
  // named by the browser's network error is eligible for a cache-busted retry.
  if (!(error instanceof Error)) return null;
  const address = error.message.match(/https?:\/\/[^\s'"<>]+/)?.[0];
  if (!address) return null;
  try {
    const url = new URL(address);
    return url.origin === location.origin && /\.(?:js|tsx?)(?:$)/.test(url.pathname) ? url : null;
  } catch {
    return null;
  }
}

function SettingsPaneLoader({ section, ...props }: PaneProps & { section: SettingsSection }) {
  const [Component, setComponent] = useState<ComponentType<PaneProps> | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const retryUrl = useRef<URL | null>(null);
  useEffect(() => {
    let disposed = false;
    setFailed(false);
    const pane = panes[section];
    const url = retryUrl.current;
    if (url) url.searchParams.set('settings-retry', String(attempt));
    const load = url ? import(/* @vite-ignore */ url.href) : pane.load();
    void load.then((module: Record<string, ComponentType<PaneProps>>) => {
      const component = module[pane.name];
      if (!component) throw new Error('Settings category export unavailable');
      if (!disposed) setComponent(() => component);
    }).catch((error: unknown) => {
      if (!disposed) {
        retryUrl.current = failedModuleUrl(error) || retryUrl.current;
        setFailed(true);
      }
    });
    return () => { disposed = true; };
  }, [section, attempt]);

  if (Component) return <Component {...props} />;
  return <section className="settings-pane" hidden={props.hidden} aria-busy={!failed}>
    <p role={failed ? 'alert' : 'status'}>{failed
      ? props.label('无法加载此分类，请重试。', 'Could not load this category. Please try again.')
      : props.label('加载中…', 'Loading…')}</p>
    {failed ? <button type="button" className="btn" onClick={() => setAttempt((value) => value + 1)}>
      {props.label('重试', 'Try again')}
    </button> : null}
  </section>;
}

export function SettingsPanes({ section, ...props }: SettingsPanesProps) {
  const [visited, setVisited] = useState<SettingsSection[]>([section]);
  // Keep visited panes at stable keys so drafts and focusable controls survive
  // category switches. No extra DOM wrapper is needed around loaded panes.
  if (!visited.includes(section)) setVisited([...visited, section]);
  return <>{visited.map((key) =>
    <SettingsPaneLoader key={key} section={key} hidden={section !== key} {...props} />,
  )}</>;
}
