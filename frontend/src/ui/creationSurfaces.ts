import type { CreationName, CreationSnapshot } from '../react/creation/CreationSurface.tsx';
type SurfaceName = CreationName;
interface CreationItem { id: string; source: string; title: string; name?: string; [key: string]: unknown }
interface CreationApiItem { id: string; source?: string; title?: string; name?: string; [key: string]: unknown }
interface CreationCollectionResponse { images?: CreationApiItem[]; items?: CreationApiItem[] }
interface CreationState {
 images: CreationItem[]; assistants: CreationItem[]; sites: CreationItem[];
 page: SurfaceName | null; loading: boolean; error: string;
 editor: { type: SurfaceName; item: CreationItem | null } | null;
 busy: boolean; query: string; siteView: 'grid' | 'list'; siteMenu: string | null;
}
type CreationForm = HTMLFormElement & { elements: HTMLFormControlsCollection & {
 prompt: HTMLTextAreaElement; model: HTMLInputElement; title: HTMLInputElement;
 description: HTMLTextAreaElement; instructions: HTMLTextAreaElement; starter: HTMLInputElement;
 source: HTMLTextAreaElement; visibility: HTMLSelectElement;
} };
interface CreationAction { button?: HTMLButtonElement; id?: string; view?: string }
function isSurfaceName(value: unknown): value is SurfaceName { return value === 'images' || value === 'assistants' || value === 'sites'; }
import { openDetailSurface, closeDetailSurface } from './detailSurface.ts';
import { dispatchExtension } from '../extensions/index.ts';
import { reportSwallow } from '../util/reportSwallow.ts';
import { runtimeWindow as browserWindow } from "../types/runtimeWindow.ts";


const copy: Record<'en' | 'zh', Record<string, string>> = {
  zh: { images: '图片', assistants: '助手', sites: '站点', createImage: '创建图片', createAssistant: '创建助手', createSite: '创建网站', imagePrompt: '描述你想创建的图片', sitePrompt: '描述你想创建的站点', generateSite: '生成页面', imageModel: '图片模型', create: '创建', retry: '重试', save: '保存', cancel: '取消', delete: '删除', edit: '编辑', use: '开始聊天', publish: '发布', unpublish: '取消发布', preview: '预览', name: '名称', description: '简介', instructions: '指令', starter: '开场白', code: 'HTML 源码', emptyImages: '还没有图片。描述一个画面开始创建。', emptyAssistants: '还没有助手。创建一个适合你的专属助手。', emptySites: '还没有站点。创建一个页面并发布。', loading: '正在加载…', error: '加载失败，请重试。', search: '搜索', searchSites: '搜索站点', siteBanner: '把你的想法变成网站', siteBannerBody: '用 Socrates 创建并发布网站。', sharedWith: '共享对象', gridView: '网格视图', listView: '列表视图', imageUnavailable: '请在设置中配置支持图片生成的模型，或在服务端设置 IMAGE_MODEL。', private: '仅自己', unlisted: '知道链接的人', public: '公开', copied: '链接已复制', confirmDelete: '确定删除？', noPrompt: '请输入图片描述。' },
  en: { images: 'Images', assistants: 'Assistants', sites: 'Sites', createImage: 'Create an image', createAssistant: 'Create assistant', createSite: 'Create site', imagePrompt: 'Describe the image you want to create', sitePrompt: 'Describe the site you want to create', generateSite: 'Generate page', imageModel: 'Image model', create: 'Create', retry: 'Retry', save: 'Save', cancel: 'Cancel', delete: 'Delete', edit: 'Edit', use: 'Start chat', publish: 'Publish', unpublish: 'Unpublish', preview: 'Preview', name: 'Name', description: 'Description', instructions: 'Instructions', starter: 'Conversation starter', code: 'HTML source', emptyImages: 'No images yet. Describe a scene to get started.', emptyAssistants: 'No assistants yet. Create one for your work.', emptySites: 'No sites yet. Create and publish a page.', loading: 'Loading…', error: 'Could not load. Try again.', search: 'Search', searchSites: 'Search sites', siteBanner: 'Turn your ideas into websites', siteBannerBody: 'Create and publish websites with Socrates.', sharedWith: 'Shared with', gridView: 'Grid view', listView: 'List view', imageUnavailable: 'Configure an image-capable model in Settings or set IMAGE_MODEL on the server.', private: 'Only me', unlisted: 'Anyone with the link', public: 'Public', copied: 'Link copied', confirmDelete: 'Delete this item?', noPrompt: 'Enter an image description.' },
};

const state: CreationState = { images: [], assistants: [], sites: [], page: null, loading: false, error: '', editor: null, busy: false, query: '', siteView: 'list', siteMenu: null };
const lang = () => browserWindow._currentLang === 'en' ? 'en' : 'zh';
const t = (key: string) => copy[lang()][key] || key;
const panel = (name: SurfaceName) => document.getElementById(`${name}Panel`);
const api = <T = unknown>(url: string, options?: Parameters<typeof browserWindow.apiFetch>[1]): Promise<T> => browserWindow.apiFetch<T>(url, options);
const notice = (message: string) => typeof browserWindow.showToast === 'function' ? browserWindow.showToast(message) : browserWindow.alert(message);
const imageUrl = (id: string|number|boolean) => `/api/files/${encodeURIComponent(id)}/raw`;
function normalizeCreationItem(item: CreationApiItem): CreationItem {
  return { ...item, title: item.title || item.name || '', source: item.source || '' };
}

function snapshot(name: SurfaceName): CreationSnapshot {
  return {
    name,
    items: [...state[name]],
    loading: state.loading,
    error: state.error,
    editor: state.editor,
    busy: state.busy,
    query: state.query,
    siteView: state.siteView,
    siteMenu: state.siteMenu,
    locale: lang(),
    text: copy[lang()],
    imageModel: localStorage.getItem('socrates-image-model') || '',
  };
}

function notifySurface(name: SurfaceName) {
  panel(name)?.dispatchEvent(new CustomEvent('socrates:creation-surface-state', {
    detail: snapshot(name),
  }));
}

function ensurePanels() {
  const host = document.getElementById('mainInner');
  if (!host) return;
  for (const name of ['images', 'assistants', 'sites'] as const) {
    if (panel(name)) continue;
    const section = document.createElement('section');
    section.id = `${name}Panel`;
    section.className = 'creation-panel main-page hidden';
    section.dataset.surface = name;
    host.appendChild(section);
    section.addEventListener('click', (event) => handleClick(name, event));
    section.addEventListener('input', (event) => {
      if ((event.target as Element | null)?.matches('[data-search]')) {
        state.query = (event.target as HTMLInputElement).value;
        render(name);
      }
    });
    section.addEventListener('socrates:creation-search', (event) => {
      if (state.query === (event as CustomEvent).detail.query) return;
      state.query = (event as CustomEvent).detail.query;
      render(name);
    });
    section.addEventListener('socrates:creation-action', (event) => {
      runAction(name, (event as CustomEvent).detail.action, (event as CustomEvent).detail);
    });
    section.addEventListener('submit', (event) => { event.preventDefault(); handleSubmit(name, event.target as CreationForm); });
    void import('../react/creation/creationSurfaceHost.tsx').then(({ mountCreationSurface }) => {
      mountCreationSurface(section, name, snapshot(name));
    }).catch((error) => reportSwallow(error, 'ui/creationSurfaces.mountReactSurface'));
  }
}
function render(name: SurfaceName) {
  ensurePanels();
  notifySurface(name);
}

async function load(name: SurfaceName) {
  state.loading = true; state.error = ''; render(name);
  try {
    const url = name === 'images' ? '/api/creations/images' : `/api/creations/items/${name}`;
    const result = await api<CreationCollectionResponse>(url);
    const rows = name === 'images' ? result.images || [] : result.items || [];
    state[name] = rows.map(normalizeCreationItem);
  } catch { state.error = t('error'); }
  state.loading = false; render(name);
}

function previewSite(source: string, title: string) {
  const frame = document.createElement('iframe');
  frame.className = 'creation-preview-frame'; frame.title = title; frame.setAttribute('sandbox', ''); frame.srcdoc = source;
  openDetailSurface({ owner: 'site-preview', title: frame.title, closeLabel: t('cancel'), content: frame });
}

async function startNewCreation(name: SurfaceName) {
  if (name === 'images') return panel(name)!.querySelector<HTMLTextAreaElement>('textarea[name="prompt"]')?.focus();
  /* Sites are built by the agent now — "Create" returns to the composer
     with the create-site extension armed, the same as picking it from
     the "+" tools menu. The editor modal stays for editing existing sites. */
  if (name === 'sites') {
    const didReset = await (browserWindow.resetApp as (() => boolean | void | Promise<boolean | void>) | undefined)?.();
    if (didReset === false) return;
    dispatchExtension('createSite');
    return;
  }
  state.editor = { type: name, item: null };
  render(name);
}

async function deleteCreation(name: SurfaceName, item: CreationItem) {
  if (!browserWindow.confirm(t('confirmDelete'))) return;
  try {
    await api(`/api/creations/items/${name}/${item.id}`, { method: 'DELETE' });
    await load(name);
  } catch (error) {
    notice((error as Error)?.message || t('error'));
  }
}

async function useAssistant(item: CreationItem) {
  const didReset = await (browserWindow.resetApp as (() => boolean | void | Promise<boolean | void>) | undefined)?.();
  if (didReset === false) return;
  sessionStorage.setItem('socrates-active-assistant', item.id);
  let starter = '';
  try { starter = JSON.parse(item.source).starter || ''; } catch (error) {
    reportSwallow(error, 'empty catch: ui/creationSurfaces.ts:140');
    /* assistants can have an empty draft */
  }
  const composer = browserWindow.__socratesComposerController;
  if (starter) composer?.setMarkdown('topic', starter);
  composer?.focus('topic');
}

async function generateSite(button: HTMLButtonElement, name: SurfaceName) {
  const form = panel(name)!.querySelector<CreationForm>('.creation-site-editor');
  const prompt = form?.elements.prompt.value.trim();
  if (!prompt) return form?.elements.prompt.focus();
  button.disabled = true;
  button.textContent = t('loading');
  try {
    const result = await api<{ source?: string }>('/api/creations/sites/generate', { method: 'POST', body: { prompt } });
    form!.elements.source.value = result.source || '';
  } catch (error) {
    notice((error as Error)?.message || t('error'));
  } finally {
    button.disabled = false;
    button.textContent = t('generateSite');
  }
}

function clickHandlers(name: SurfaceName, button: Pick<HTMLButtonElement, "dataset">, item?: CreationItem) {
  return {
    retry: () => load(name),
    'site-view': () => { state.siteView = button.dataset.view === 'grid' ? 'grid' : 'list'; render(name); },
    'site-menu': () => { if (item) { state.siteMenu = state.siteMenu === item.id ? null : item.id; render(name); } },
    new: () => startNewCreation(name),
    close: () => { state.editor = null; render(name); },
    edit: () => { if (item) { state.editor = { type: name, item }; render(name); } },
    'edit-image': () => {
      if (!item) return;
      state.editor = { type: 'images', item };
      render(name);
      panel(name)!.querySelector<HTMLTextAreaElement>('textarea[name="prompt"]')?.focus();
    },
    delete: () => item ? deleteCreation(name, item) : undefined,
    use: () => item ? useAssistant(item) : undefined,
    preview: () => item ? previewSite(item.source, item.title) : undefined,
    'view-image': () => { if (item) browserWindow.open(imageUrl(item.id), '_blank', 'noopener'); },
    'preview-draft': () => previewSite((panel(name)!.querySelector('textarea[name="source"]') as HTMLInputElement)?.value || '', t('preview')),
    'generate-site': () => generateSite((button as HTMLButtonElement), name),
  };
}

async function runAction(name: SurfaceName, action: string, detail: CreationAction = {}) {
  const button = detail.button || { dataset: { id: detail.id, view: detail.view } };
  if (['close', 'edit', 'new'].includes(action)) closeDetailSurface('site-preview');
  const item = state[name].find((entry) => entry.id === button.dataset.id);
  const handlers = clickHandlers(name, button, item);
  const handler = (handlers as Record<string, (() => unknown) | undefined>)[action];
  return handler?.();
}

async function handleClick(name: SurfaceName, event: MouseEvent) {
  const button = (event.target as Element)!.closest<HTMLButtonElement>('[data-action]');
  if (!button) return;
  return runAction(name, button.dataset.action!, { button });
}

async function submitImageForm(form: CreationForm) {
  const prompt = form.elements.prompt.value.trim();
  if (!prompt) throw new Error(t('noPrompt'));
  const model = form.elements.model.value.trim();
  if (model) localStorage.setItem('socrates-image-model', model);
  const reference = state.editor?.type === 'images' ? state.editor.item : null;
  const url = reference ? `/api/creations/images/${reference.id}/edit` : '/api/creations/images';
  await api(url, { method: 'POST', body: { prompt, model } });
  state.editor = null;
}

async function publishSite(saved: CreationItem, form: CreationForm) {
  const visibility = form.elements.visibility.value;
  const published = await api<{ url?: string | null }>(`/api/creations/sites/${saved.id}/publish`, { method: 'POST', body: { visibility } });
  if (!published.url) return;
  const publishedUrl = new URL(published.url, location.origin).href;
  let copied = false;
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(publishedUrl);
      copied = true;
    }
  } catch (error) {
    reportSwallow(error, 'ui/creationSurfaces.copyPublishedSiteUrl', 'expected');
  }
  notice(copied ? `${t('copied')}: ${publishedUrl}` : publishedUrl);
}

async function submitEditorForm(name: SurfaceName, form: CreationForm) {
  const item = state.editor?.item;
  const title = form.elements.title.value.trim();
  const source = name === 'assistants'
    ? JSON.stringify({ description: form.elements.description.value.trim(), instructions: form.elements.instructions.value.trim(), starter: form.elements.starter.value.trim() })
    : form.elements.source.value;
  const url = `/api/creations/items/${name}${item ? `/${item.id}` : ''}`;
  const saved = normalizeCreationItem(await api<CreationApiItem>(url, { method: item ? 'PATCH' : 'POST', body: { title, source } }));
  if (name === 'sites') await publishSite(saved, form);
  state.editor = null;
}

async function handleSubmit(name: SurfaceName, form: CreationForm) {
  if (state.busy) return;
  state.busy = true;
  const button = (form as Element)!.querySelector('[type="submit"]');
  if (button) (button as HTMLInputElement).disabled = true;
  try {
    if (name === 'images') await submitImageForm(form);
    else await submitEditorForm(name, form);
    await load(name);
  } catch (error) {
    const code = error && typeof error === 'object' && 'code' in error ? error.code : undefined;
    notice(code === 'IMAGE_PROVIDER_NOT_CONFIGURED' ? t('imageUnavailable') : (error as Error)?.message || t('error'));
  } finally {
    state.busy = false;
    if (button) (button as HTMLInputElement).disabled = false;
    render(name);
  }
}

export function renderCreationSurface(name: string|null) {
  if (!isSurfaceName(name)) return;
  state.page = name; state.query = ''; state.editor = null; state.siteMenu = null;
  load(name);
}

ensurePanels();
