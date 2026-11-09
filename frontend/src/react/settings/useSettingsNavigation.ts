import { useEffect, useState } from 'react';
import { SETTINGS_SECTIONS, type SettingsLabel, type SettingsSection } from './settings.types';

const SETTINGS_SEARCH_TERMS: Record<SettingsSection, readonly string[]> = {
  general: [
    'appearance', 'theme', 'theme style', 'system', 'light', 'dark', 'language',
    '外观', '主题', '主题风格', '跟随系统', '浅色', '深色', '语言',
  ],
  display: [
    'display', 'font', 'font size', 'text size', 'content width', 'grid', 'background',
    '文字大小', '字号', '内容宽度', '网格', '背景', '自定义背景色',
  ],
  notifications: ['notification', 'push', 'push notification', '通知', '推送', '推送通知'],
  personalization: [
    'personalization', 'tone', 'personality', 'custom instructions', 'memory', 'memories',
    '个性化', '语气', '自定义指令', '记忆',
  ],
  models: [
    'model', 'provider', 'api', 'api key', 'external api', 'voice',
    '模型', '服务商', '提供商', '密钥', '外部 api', '语音',
  ],
  apps: ['app', 'connection', 'connector', 'plugin', '应用', '连接', '插件'],
  data: [
    'data', 'data controls', 'file', 'files', 'library', 'delete',
    '数据', '数据管理', '文件', '资料库', '删除',
  ],
  account: [
    'account', 'profile', 'display name', 'email', 'token usage', 'archived sessions',
    'sign out', 'logout', 'delete account', '账户', '个人资料', '显示名称', '邮箱',
    '用量', '已归档会话', '退出登录', '删除账户',
  ],
};

function normalizeQuery(value: string): string {
  return value.trim().toLocaleLowerCase().replace(/\s+/g, ' ');
}

type SettingsCategory = [SettingsSection, string];

function searchCategories(categories: SettingsCategory[], query: string): SettingsCategory[] {
  const normalizedQuery = normalizeQuery(query);
  if (!normalizedQuery) return categories;
  return categories.filter(([key, name]) =>
    normalizeQuery(name).includes(normalizedQuery) ||
    SETTINGS_SEARCH_TERMS[key].some((term) => normalizeQuery(term).includes(normalizedQuery)),
  );
}

export function useSettingsNavigation(label: SettingsLabel) {
  const [section, setSection] = useState<SettingsSection>('general');
  const [query, setQuery] = useState('');
  useEffect(() => {
    const selectSection = (event: Event) => {
      const value = (event as CustomEvent<SettingsSection>).detail;
      if (SETTINGS_SECTIONS.includes(value)) setSection(value);
    };
    document.addEventListener('socrates:settings-section', selectSection);
    return () => document.removeEventListener('socrates:settings-section', selectSection);
  }, []);

  const categories: Array<[SettingsSection, string]> = [
    ['general', label('通用', 'General')],
    ['display', label('外观', 'Display')],
    ['notifications', label('通知', 'Notifications')],
    ['personalization', label('个性化', 'Personalization')],
    ['models', label('模型与语音', 'Models & voice')],
    ['apps', label('应用与连接', 'Apps & connections')],
    ['data', label('数据管理', 'Data controls')],
    ['account', label('账户', 'Account')],
  ];
  const normalizedQuery = normalizeQuery(query);
  const matchingCategories = searchCategories(categories, query);
  const changeQuery = (nextQuery: string) => {
    setQuery(nextQuery);
    if (!normalizeQuery(nextQuery)) return;
    const matches = searchCategories(categories, nextQuery);
    if (matches.length > 0 && !matches.some(([key]) => key === section)) {
      setSection(matches[0][0]);
    }
  };

  return {
    section,
    setSection,
    query,
    setQuery: changeQuery,
    categories: matchingCategories,
    hasNoSearchResults: normalizedQuery.length > 0 && matchingCategories.length === 0,
  };
}
