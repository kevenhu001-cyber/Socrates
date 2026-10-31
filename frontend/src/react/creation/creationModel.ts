import { reportSwallow } from '../../util/reportSwallow.ts';
import { apiFetch } from '../../util/api.ts';
import { getCurrentLanguage } from '../../i18n/languageState.ts';
import { getLegacyActions } from '../legacy/gateway.ts';

export type CreationName = 'images' | 'assistants' | 'sites';

export type CreationItem = {
  id: string;
  name?: string;
  title?: string;
  source?: string;
  visibility?: 'private' | 'unlisted' | 'public';
  updatedAt?: string;
  createdAt?: string;
};

export type CreationApiItem = CreationItem & { [key: string]: unknown };
export type CreationEditor = { type: CreationName; item: CreationItem | null } | null;
export type EditorDraft = {
  title: string;
  description: string;
  instructions: string;
  starter: string;
  prompt: string;
  source: string;
  visibility: 'private' | 'unlisted' | 'public';
};
export type EditorField = keyof EditorDraft;

const DEFAULT_SITE_SOURCE = '<!doctype html>\n<html lang="zh"><meta charset="utf-8"><title>Socrates Site</title><style>body{font-family:system-ui;max-width:720px;margin:10vh auto;padding:24px}</style><h1>我的站点</h1><p>在这里开始创作。</p></html>';

const copy: Record<'en' | 'zh', Record<string, string>> = {
  zh: { images: '图片', assistants: '助手', sites: '站点', createImage: '创建图片', createAssistant: '创建助手', createSite: '创建网站', imagePrompt: '描述你想创建的图片', sitePrompt: '描述你想创建的站点', generateSite: '生成页面', imageModel: '图片模型', create: '创建', retry: '重试', save: '保存', cancel: '取消', delete: '删除', edit: '编辑', use: '开始聊天', publish: '发布', unpublish: '取消发布', preview: '预览', name: '名称', description: '简介', instructions: '指令', starter: '开场白', code: 'HTML 源码', emptyImages: '还没有图片。描述一个画面开始创建。', emptyAssistants: '还没有助手。创建一个适合你的专属助手。', emptySites: '还没有站点。创建一个页面并发布。', loading: '正在加载…', error: '加载失败，请重试。', search: '搜索', searchSites: '搜索站点', siteBanner: '把你的想法变成网站', siteBannerBody: '用 Socrates 创建并发布网站。', sharedWith: '共享对象', gridView: '网格视图', listView: '列表视图', imageUnavailable: '请在设置中配置支持图片生成的模型，或在服务端设置 IMAGE_MODEL。', private: '仅自己', unlisted: '知道链接的人', public: '公开', copied: '链接已复制', confirmDelete: '确定删除？', noPrompt: '请输入图片描述。' },
  en: { images: 'Images', assistants: 'Assistants', sites: 'Sites', createImage: 'Create an image', createAssistant: 'Create assistant', createSite: 'Create site', imagePrompt: 'Describe the image you want to create', sitePrompt: 'Describe the site you want to create', generateSite: 'Generate page', imageModel: 'Image model', create: 'Create', retry: 'Retry', save: 'Save', cancel: 'Cancel', delete: 'Delete', edit: 'Edit', use: 'Start chat', publish: 'Publish', unpublish: 'Unpublish', preview: 'Preview', name: 'Name', description: 'Description', instructions: 'Instructions', starter: 'Conversation starter', code: 'HTML source', emptyImages: 'No images yet. Describe a scene to get started.', emptyAssistants: 'No assistants yet. Create one for your work.', emptySites: 'No sites yet. Create and publish a page.', loading: 'Loading…', error: 'Could not load. Try again.', search: 'Search', searchSites: 'Search sites', siteBanner: 'Turn your ideas into websites', siteBannerBody: 'Create and publish websites with Socrates.', sharedWith: 'Shared with', gridView: 'Grid view', listView: 'List view', imageUnavailable: 'Configure an image-capable model in Settings or set IMAGE_MODEL on the server.', private: 'Only me', unlisted: 'Anyone with the link', public: 'Public', copied: 'Link copied', confirmDelete: 'Delete this item?', noPrompt: 'Enter an image description.' },
};

export function currentCopy() {
  return copy[getCurrentLanguage() === 'en' ? 'en' : 'zh'];
}

export function imageUrl(id: string) {
  return `/api/files/${encodeURIComponent(id)}/raw`;
}

export function api<T = unknown>(url: string, options?: Parameters<typeof apiFetch>[1]): Promise<T> {
  return apiFetch<T>(url, options);
}

export function normalizeCreationItem(item: CreationApiItem): CreationItem {
  return { ...item, title: item.title || item.name || '', source: item.source || '' };
}

export function emptyEditorDraft(): EditorDraft {
  return { title: '', description: '', instructions: '', starter: '', prompt: '', source: DEFAULT_SITE_SOURCE, visibility: 'private' };
}

export function editorDraftFor(name: CreationName, item: CreationItem | null): EditorDraft {
  const draft = emptyEditorDraft();
  if (!item) return draft;
  draft.title = item.title || item.name || '';
  if (name === 'sites') {
    draft.source = item.source || DEFAULT_SITE_SOURCE;
    draft.visibility = item.visibility || 'private';
  } else if (name === 'assistants') {
    try {
      const config = JSON.parse(item.source || '{}') as Partial<EditorDraft>;
      draft.description = typeof config.description === 'string' ? config.description : '';
      draft.instructions = typeof config.instructions === 'string' ? config.instructions : '';
      draft.starter = typeof config.starter === 'string' ? config.starter : '';
    } catch (error) {
      reportSwallow(error, 'creation.editorDraftFor.parseAssistant');
    }
  }
  return draft;
}

export function readImageModel() {
  try { return localStorage.getItem('socrates-image-model') || ''; }
  catch (error) { reportSwallow(error, 'creation.readImageModel'); return ''; }
}

export function notice(message: string) {
  getLegacyActions().messages.showToast?.(message);
}
