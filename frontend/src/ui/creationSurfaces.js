import { openDetailSurface, closeDetailSurface } from './detailSurface.ts';
import { reportSwallow } from '../util/reportSwallow.ts';

const copy = {
  zh: { images: '图片', assistants: '助手', sites: '站点', createImage: '创建图片', createAssistant: '创建助手', createSite: '创建网站', imagePrompt: '描述你想创建的图片', sitePrompt: '描述你想创建的站点', generateSite: '生成页面', imageModel: '图片模型', create: '创建', retry: '重试', save: '保存', cancel: '取消', delete: '删除', edit: '编辑', use: '开始聊天', publish: '发布', unpublish: '取消发布', preview: '预览', name: '名称', description: '简介', instructions: '指令', starter: '开场白', code: 'HTML 源码', emptyImages: '还没有图片。描述一个画面开始创建。', emptyAssistants: '还没有助手。创建一个适合你的专属助手。', emptySites: '还没有站点。创建一个页面并发布。', loading: '正在加载…', error: '加载失败，请重试。', search: '搜索', searchSites: '搜索站点', siteBanner: '把你的想法变成网站', siteBannerBody: '用 Socrates 创建并发布网站。', sharedWith: '共享对象', gridView: '网格视图', listView: '列表视图', imageUnavailable: '请在设置中配置支持图片生成的模型，或在服务端设置 IMAGE_MODEL。', private: '仅自己', unlisted: '知道链接的人', public: '公开', copied: '链接已复制', confirmDelete: '确定删除？', noPrompt: '请输入图片描述。' },
  en: { images: 'Images', assistants: 'Assistants', sites: 'Sites', createImage: 'Create an image', createAssistant: 'Create assistant', createSite: 'Create site', imagePrompt: 'Describe the image you want to create', sitePrompt: 'Describe the site you want to create', generateSite: 'Generate page', imageModel: 'Image model', create: 'Create', retry: 'Retry', save: 'Save', cancel: 'Cancel', delete: 'Delete', edit: 'Edit', use: 'Start chat', publish: 'Publish', unpublish: 'Unpublish', preview: 'Preview', name: 'Name', description: 'Description', instructions: 'Instructions', starter: 'Conversation starter', code: 'HTML source', emptyImages: 'No images yet. Describe a scene to get started.', emptyAssistants: 'No assistants yet. Create one for your work.', emptySites: 'No sites yet. Create and publish a page.', loading: 'Loading…', error: 'Could not load. Try again.', search: 'Search', searchSites: 'Search sites', siteBanner: 'Turn your ideas into websites', siteBannerBody: 'Create and publish websites with Socrates.', sharedWith: 'Shared with', gridView: 'Grid view', listView: 'List view', imageUnavailable: 'Configure an image-capable model in Settings or set IMAGE_MODEL on the server.', private: 'Only me', unlisted: 'Anyone with the link', public: 'Public', copied: 'Link copied', confirmDelete: 'Delete this item?', noPrompt: 'Enter an image description.' },
};

const state = { images: [], assistants: [], sites: [], page: null, loading: false, error: '', editor: null, busy: false, query: '', siteView: 'list', siteMenu: null };
const lang = () => window._currentLang === 'en' ? 'en' : 'zh';
const t = (key) => copy[lang()][key] || key;
const panel = (name) => document.getElementById(`${name}Panel`);
const api = (url, options) => window.apiFetch(url, options);
const notice = (message) => typeof window.showToast === 'function' ? window.showToast(message) : window.alert(message);
const imageUrl = (id) => `/api/files/${encodeURIComponent(id)}/raw`;

function snapshot(name) {
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

function notifySurface(name) {
  panel(name)?.dispatchEvent(new CustomEvent('socrates:creation-surface-state', {
    detail: snapshot(name),
  }));
}

function ensurePanels() {
  const host = document.getElementById('mainInner');
  if (!host) return;
  for (const name of ['images', 'assistants', 'sites']) {
    if (panel(name)) continue;
    const section = document.createElement('section');
    section.id = `${name}Panel`;
    section.className = 'creation-panel main-page hidden';
    section.dataset.surface = name;
    host.appendChild(section);
    section.addEventListener('click', (event) => handleClick(name, event));
    section.addEventListener('input', (event) => {
      if (event.target?.matches('[data-search]')) {
        state.query = event.target.value;
        render(name);
      }
    });
    section.addEventListener('socrates:creation-search', (event) => {
      if (state.query === event.detail.query) return;
      state.query = event.detail.query;
      render(name);
    });
    section.addEventListener('socrates:creation-action', (event) => {
      runAction(name, event.detail.action, event.detail);
    });
    section.addEventListener('submit', (event) => { event.preventDefault(); handleSubmit(name, event.target); });
    void import('../react/creation/creationSurfaceHost.tsx').then(({ mountCreationSurface }) => {
      mountCreationSurface(section, name, snapshot(name));
    }).catch((error) => reportSwallow(error, 'ui/creationSurfaces.mountReactSurface', 'unexpected'));
  }
}
function render(name) {
  ensurePanels();
  notifySurface(name);
}

async function load(name) {
  state.loading = true; state.error = ''; render(name);
  try {
    const url = name === 'images' ? '/api/creations/images' : `/api/creations/items/${name}`;
    const result = await api(url);
    state[name] = name === 'images' ? result.images || [] : result.items || [];
  } catch { state.error = t('error'); }
  state.loading = false; render(name);
}

function previewSite(source, title) {
  const frame = document.createElement('iframe');
  frame.className = 'creation-preview-frame'; frame.title = title; frame.setAttribute('sandbox', ''); frame.srcdoc = source;
  openDetailSurface({ owner: 'site-preview', title: frame.title, closeLabel: t('cancel'), content: frame });
}

async function startNewCreation(name) {
  if (name === 'images') return panel(name).querySelector('textarea[name="prompt"]')?.focus();
  /* Sites are built by the agent now — "Create" returns to the composer
     with the create-site extension armed, the same as picking it from
     the "+" tools menu. The editor modal stays for editing existing sites. */
  if (name === 'sites') {
    const didReset = await window.resetApp?.();
    if (didReset === false) return;
    window.__socratesExtensionDispatch?.('createSite');
    return;
  }
  state.editor = { type: name, item: null };
  render(name);
}

async function deleteCreation(name, item) {
  if (!window.confirm(t('confirmDelete'))) return;
  try {
    await api(`/api/creations/items/${name}/${item.id}`, { method: 'DELETE' });
    await load(name);
  } catch (error) {
    notice(error?.message || t('error'));
  }
}

async function useAssistant(item) {
  const didReset = await window.resetApp?.();
  if (didReset === false) return;
  sessionStorage.setItem('socrates-active-assistant', item.id);
  let starter = '';
  try { starter = JSON.parse(item.source).starter || ''; } catch { /* assistants can have an empty draft */ }
  const composer = window.__socratesComposerController;
  if (starter) composer?.setMarkdown('topic', starter);
  composer?.focus('topic');
}

async function generateSite(button, name) {
  const form = panel(name).querySelector('.creation-site-editor');
  const prompt = form?.elements.prompt.value.trim();
  if (!prompt) return form?.elements.prompt.focus();
  button.disabled = true;
  button.textContent = t('loading');
  try {
    const result = await api('/api/creations/sites/generate', { method: 'POST', body: { prompt } });
    form.elements.source.value = result.source || '';
  } catch (error) {
    notice(error?.message || t('error'));
  } finally {
    button.disabled = false;
    button.textContent = t('generateSite');
  }
}

function clickHandlers(name, button, item) {
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
      panel(name).querySelector('textarea[name="prompt"]')?.focus();
    },
    delete: () => item ? deleteCreation(name, item) : undefined,
    use: () => item ? useAssistant(item) : undefined,
    preview: () => item ? previewSite(item.source, item.title) : undefined,
    'view-image': () => { if (item) window.open(imageUrl(item.id), '_blank', 'noopener'); },
    'preview-draft': () => previewSite(panel(name).querySelector('textarea[name="source"]')?.value || '', t('preview')),
    'generate-site': () => generateSite(button, name),
  };
}

async function runAction(name, action, detail = {}) {
  const button = detail.button || { dataset: { id: detail.id, view: detail.view } };
  if (['close', 'edit', 'new'].includes(action)) closeDetailSurface('site-preview');
  const item = state[name].find((entry) => entry.id === button.dataset.id);
  const handlers = clickHandlers(name, button, item);
  return Object.hasOwn(handlers, action) ? handlers[action]?.() : undefined;
}

async function handleClick(name, event) {
  const button = event.target.closest('[data-action]');
  if (!button) return;
  return runAction(name, button.dataset.action, { button });
}

async function submitImageForm(form) {
  const prompt = form.elements.prompt.value.trim();
  if (!prompt) throw new Error(t('noPrompt'));
  const model = form.elements.model.value.trim();
  if (model) localStorage.setItem('socrates-image-model', model);
  const reference = state.editor?.type === 'images' ? state.editor.item : null;
  const url = reference ? `/api/creations/images/${reference.id}/edit` : '/api/creations/images';
  await api(url, { method: 'POST', body: { prompt, model } });
  state.editor = null;
}

async function publishSite(saved, form) {
  const visibility = form.elements.visibility.value;
  const published = await api(`/api/creations/sites/${saved.id}/publish`, { method: 'POST', body: { visibility } });
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

async function submitEditorForm(name, form) {
  const item = state.editor?.item;
  const title = form.elements.title.value.trim();
  const source = name === 'assistants'
    ? JSON.stringify({ description: form.elements.description.value.trim(), instructions: form.elements.instructions.value.trim(), starter: form.elements.starter.value.trim() })
    : form.elements.source.value;
  const url = `/api/creations/items/${name}${item ? `/${item.id}` : ''}`;
  const saved = await api(url, { method: item ? 'PATCH' : 'POST', body: { title, source } });
  if (name === 'sites') await publishSite(saved, form);
  state.editor = null;
}

async function handleSubmit(name, form) {
  if (state.busy) return;
  state.busy = true;
  const button = form.querySelector('[type="submit"]');
  if (button) button.disabled = true;
  try {
    if (name === 'images') await submitImageForm(form);
    else await submitEditorForm(name, form);
    await load(name);
  } catch (error) {
    notice(error?.code === 'IMAGE_PROVIDER_NOT_CONFIGURED' ? t('imageUnavailable') : error?.message || t('error'));
  } finally {
    state.busy = false;
    if (button) button.disabled = false;
    render(name);
  }
}

export function renderCreationSurface(name) {
  if (!['images', 'assistants', 'sites'].includes(name)) return;
  state.page = name; state.query = ''; state.editor = null; state.siteMenu = null;
  load(name);
}

ensurePanels();
