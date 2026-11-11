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

export interface SettingsCategory {
  key: SettingsSection;
  name: string;
  description: string;
}

function searchCategories(categories: SettingsCategory[], query: string): SettingsCategory[] {
  const normalizedQuery = normalizeQuery(query);
  if (!normalizedQuery) return categories;
  return categories.filter(({ key, name, description }) =>
    normalizeQuery(name).includes(normalizedQuery) ||
    normalizeQuery(description).includes(normalizedQuery) ||
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

  const categories: SettingsCategory[] = [
    { key: 'general', name: label('通用', 'General'), description: label('主题与语言', 'Theme and language') },
    { key: 'display', name: label('显示', 'Display'), description: label('字号、内容宽度和背景', 'Text size, content width, and background') },
    { key: 'notifications', name: label('通知', 'Notifications'), description: label('Android 通知权限', 'Android notification permissions') },
    { key: 'personalization', name: label('个性化', 'Personalization'), description: label('助手语气、指令和记忆', 'Assistant tone, instructions, and memory') },
    { key: 'models', name: label('模型与语音', 'Models & voice'), description: label('模型服务商、图片和语音', 'Providers, image models, and voice') },
    { key: 'apps', name: label('应用与连接', 'Apps & connections'), description: label('管理插件和服务连接', 'Manage plugins and service connections') },
    { key: 'data', name: label('数据管理', 'Data controls'), description: label('管理文件和资料库', 'Manage files and your library') },
    { key: 'account', name: label('账户', 'Account'), description: label('个人资料和账户安全', 'Profile and account security') },
  ];
  const normalizedQuery = normalizeQuery(query);
  const matchingCategories = searchCategories(categories, query);
  const changeQuery = (nextQuery: string) => {
    setQuery(nextQuery);
    if (!normalizeQuery(nextQuery)) return;
    const matches = searchCategories(categories, nextQuery);
    if (matches.length > 0 && !matches.some((category) => category.key === section)) {
      setSection(matches[0].key);
    }
  };

  const setQueryOnly = (nextQuery: string) => setQuery(nextQuery);

  return {
    section,
    setSection,
    query,
    setQuery: changeQuery,
    setQueryOnly,
    categories: matchingCategories,
    hasNoSearchResults: normalizedQuery.length > 0 && matchingCategories.length === 0,
  };
}
