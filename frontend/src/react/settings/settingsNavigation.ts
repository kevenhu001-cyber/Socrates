import type { SettingsLabel, SettingsSection } from './settings.types';

const SETTINGS_SEARCH_TERMS: Record<SettingsSection, readonly string[]> = {
  general: [
    'appearance',
    'theme',
    'theme style',
    'system',
    'light',
    'dark',
    'language',
    '外观',
    '主题',
    '主题风格',
    '跟随系统',
    '浅色',
    '深色',
    '语言',
  ],
  display: [
    'display',
    'font',
    'font size',
    'text size',
    'content width',
    'grid',
    'background',
    '文字大小',
    '字号',
    '内容宽度',
    '网格',
    '背景',
    '自定义背景色',
  ],
  notifications: ['notification', 'push', 'push notification', '通知', '推送', '推送通知'],
  personalization: [
    'personalization',
    'tone',
    'personality',
    'custom instructions',
    'memory',
    'memories',
    '个性化',
    '语气',
    '自定义指令',
    '记忆',
  ],
  models: [
    'model',
    'provider',
    'api',
    'api key',
    'external api',
    'voice',
    '模型',
    '服务商',
    '提供商',
    '密钥',
    '外部 api',
    '语音',
  ],
  apps: ['app', 'connection', 'connector', 'plugin', '应用', '连接', '插件'],
  data: [
    'data',
    'data controls',
    'file',
    'files',
    'library',
    'archive',
    'archived chats',
    'archived sessions',
    'chat history',
    '数据',
    '数据管理',
    '文件',
    '资料库',
    '归档',
    '已归档会话',
    '对话记录',
  ],
  account: [
    'account',
    'profile',
    'display name',
    'email',
    'token usage',
    'sign out',
    'logout',
    'delete account',
    '账户',
    '个人资料',
    '显示名称',
    '邮箱',
    '用量',
    '退出登录',
    '删除账户',
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
  return categories.filter(
    ({ key, name, description }) =>
      normalizeQuery(name).includes(normalizedQuery) ||
      normalizeQuery(description).includes(normalizedQuery) ||
      SETTINGS_SEARCH_TERMS[key].some((term) => normalizeQuery(term).includes(normalizedQuery)),
  );
}

export function getSettingsNavigation(
  label: SettingsLabel,
  section: SettingsSection,
  query: string,
) {
  const categories: SettingsCategory[] = [
    {
      key: 'general',
      name: label('通用', 'General'),
      description: label('主题与语言', 'Theme and language'),
    },
    {
      key: 'display',
      name: label('显示', 'Display'),
      description: label('字号、宽度和背景', 'Text size and width'),
    },
    {
      key: 'notifications',
      name: label('通知', 'Notifications'),
      description: label('Android 通知权限', 'Android notifications'),
    },
    {
      key: 'personalization',
      name: label('个性化', 'Personalization'),
      description: label('语气、指令和记忆', 'Tone, instructions, memory'),
    },
    {
      key: 'models',
      name: label('模型与语音', 'Models & voice'),
      description: label('服务商与语音', 'Providers and voice'),
    },
    {
      key: 'apps',
      name: label('应用与连接', 'Apps & connections'),
      description: label('插件与服务连接', 'Plugins and connections'),
    },
    {
      key: 'data',
      name: label('数据管理', 'Data controls'),
      description: label('归档对话和资料库', 'Archived chats and library'),
    },
    {
      key: 'account',
      name: label('账户', 'Account'),
      description: label('资料与安全', 'Profile and security'),
    },
  ];
  const matchingCategories = searchCategories(categories, query);
  const sectionForQuery = (nextQuery: string) => {
    if (!normalizeQuery(nextQuery)) return section;
    const matches = searchCategories(categories, nextQuery);
    return matches.some((category) => category.key === section)
      ? section
      : (matches[0]?.key ?? section);
  };

  return {
    sectionForQuery,
    categories: matchingCategories,
    hasNoSearchResults: matchingCategories.length === 0,
  };
}
