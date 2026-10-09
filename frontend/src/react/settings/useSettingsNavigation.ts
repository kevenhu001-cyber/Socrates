import { useEffect, useState } from 'react';
import type { SettingsLabel } from './settings.types';

const SECTION_KEYS = [
  'general', 'display', 'notifications', 'personalization',
  'models', 'apps', 'data', 'account',
];

export function useSettingsNavigation(label: SettingsLabel) {
  const [section, setSection] = useState('general');
  const [query, setQuery] = useState('');
  useEffect(() => {
    const selectSection = (event: Event) => {
      const value = (event as CustomEvent<string>).detail;
      if (SECTION_KEYS.includes(value)) setSection(value);
    };
    document.addEventListener('socrates:settings-section', selectSection);
    return () => document.removeEventListener('socrates:settings-section', selectSection);
  }, []);

  const categories: Array<[string, string]> = [
    ['general', label('通用', 'General')],
    ['display', label('外观', 'Display')],
    ['notifications', label('通知', 'Notifications')],
    ['personalization', label('个性化', 'Personalization')],
    ['models', label('模型与语音', 'Models & voice')],
    ['apps', label('应用与连接', 'Apps & connections')],
    ['data', label('数据管理', 'Data controls')],
    ['account', label('账户', 'Account')],
  ];
  return { section, setSection, query, setQuery, categories };
}
