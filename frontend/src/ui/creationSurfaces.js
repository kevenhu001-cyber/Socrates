const copy = {
  zh: { images: '图片', assistants: '助手', sites: '站点', createImage: '创建图片', createAssistant: '创建助手', createSite: '创建网站', imagePrompt: '描述你想创建的图片', sitePrompt: '描述你想创建的站点', generateSite: '生成页面', imageModel: '图片模型', create: '创建', retry: '重试', save: '保存', cancel: '取消', delete: '删除', edit: '编辑', use: '开始聊天', publish: '发布', unpublish: '取消发布', preview: '预览', name: '名称', description: '简介', instructions: '指令', starter: '开场白', code: 'HTML 源码', emptyImages: '还没有图片。描述一个画面开始创建。', emptyAssistants: '还没有助手。创建一个适合你的专属助手。', emptySites: '还没有站点。创建一个页面并发布。', loading: '正在加载…', error: '加载失败，请重试。', search: '搜索', searchSites: '搜索站点', siteBanner: '把你的想法变成网站', siteBannerBody: '用 Socrates 创建并发布网站。', sharedWith: '共享对象', gridView: '网格视图', listView: '列表视图', imageUnavailable: '请在设置中配置支持图片生成的模型，或在服务端设置 IMAGE_MODEL。', private: '仅自己', unlisted: '知道链接的人', public: '公开', copied: '链接已复制', confirmDelete: '确定删除？', noPrompt: '请输入图片描述。' },
  en: { images: 'Images', assistants: 'Assistants', sites: 'Sites', createImage: 'Create an image', createAssistant: 'Create assistant', createSite: 'Create site', imagePrompt: 'Describe the image you want to create', sitePrompt: 'Describe the site you want to create', generateSite: 'Generate page', imageModel: 'Image model', create: 'Create', retry: 'Retry', save: 'Save', cancel: 'Cancel', delete: 'Delete', edit: 'Edit', use: 'Start chat', publish: 'Publish', unpublish: 'Unpublish', preview: 'Preview', name: 'Name', description: 'Description', instructions: 'Instructions', starter: 'Conversation starter', code: 'HTML source', emptyImages: 'No images yet. Describe a scene to get started.', emptyAssistants: 'No assistants yet. Create one for your work.', emptySites: 'No sites yet. Create and publish a page.', loading: 'Loading…', error: 'Could not load. Try again.', search: 'Search', searchSites: 'Search sites', siteBanner: 'Turn your ideas into websites', siteBannerBody: 'Create and publish websites with Socrates.', sharedWith: 'Shared with', gridView: 'Grid view', listView: 'List view', imageUnavailable: 'Configure an image-capable model in Settings or set IMAGE_MODEL on the server.', private: 'Only me', unlisted: 'Anyone with the link', public: 'Public', copied: 'Link copied', confirmDelete: 'Delete this item?', noPrompt: 'Enter an image description.' },
};

const state = { images: [], assistants: [], sites: [], page: null, loading: false, error: '', editor: null, busy: false, query: '', siteView: 'list', siteMenu: null };
const lang = () => window._currentLang === 'en' ? 'en' : 'zh';
const t = (key) => copy[lang()][key] || key;
const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
const panel = (name) => document.getElementById(`${name}Panel`);
const api = (url, options) => window.apiFetch(url, options);
const notice = (message) => typeof window.showToast === 'function' ? window.showToast(message) : window.alert(message);
const imageUrl = (id) => `/api/files/${encodeURIComponent(id)}/raw`;

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
        const list = section.querySelector('[data-creation-list]');
        if (list) list.innerHTML = listMarkup(name);
      }
    });
    section.addEventListener('submit', (event) => { event.preventDefault(); handleSubmit(name, event.target); });
  }
}

function header(name) {
  const action = name === 'images' ? 'createImage' : name === 'assistants' ? 'createAssistant' : 'createSite';
  if (name === 'sites') return `<header class="creation-header creation-sites-header"><h1>${t(name)}</h1><button class="creation-primary creation-sites-new" data-action="new">${t('create')}</button></header><label class="creation-sites-search"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/></svg><input data-search type="search" placeholder="${t('searchSites')}" aria-label="${t('searchSites')}" value="${esc(state.query)}"></label><div class="creation-sites-view" role="group" aria-label="${t('listView')}"><button type="button" data-action="site-view" data-view="grid" aria-label="${t('gridView')}" aria-pressed="${state.siteView === 'grid'}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg></button><button type="button" data-action="site-view" data-view="list" aria-label="${t('listView')}" aria-pressed="${state.siteView === 'list'}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M8 6h13M8 12h13M8 18h13"/><circle cx="3.5" cy="6" r=".8"/><circle cx="3.5" cy="12" r=".8"/><circle cx="3.5" cy="18" r=".8"/></svg></button></div><div class="creation-site-banner"><span class="creation-site-banner-icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="3" width="8" height="8" rx="2"/><rect x="14" y="3" width="7" height="5" rx="1"/><rect x="14" y="11" width="7" height="10" rx="2"/><rect x="3" y="14" width="8" height="7" rx="2"/></svg></span><div><strong>${t('siteBanner')}</strong><small>${t('siteBannerBody')}</small></div><button class="creation-primary" data-action="new">${t('createSite')}</button></div>`;
  return `<header class="creation-header"><div><h1>${t(name)}</h1></div><div class="creation-header-actions"><input data-search type="search" placeholder="${t('search')}" aria-label="${t('search')}" value="${esc(state.query)}"><button class="creation-primary" data-action="new">${t(action)}</button></div></header>`;
}

function listMarkup(name) {
  if (state.loading) return `<div class="creation-empty" role="status">${t('loading')}</div>`;
  if (state.error) return `<div class="creation-empty" role="alert">${esc(state.error)} <button data-action="retry">${t('retry')}</button></div>`;
  const query = state.query.toLocaleLowerCase();
  const items = state[name].filter((item) => (item.title || item.name || '').toLocaleLowerCase().includes(query));
  if (!items.length) return `<div class="creation-empty">${t(name === 'images' ? 'emptyImages' : name === 'assistants' ? 'emptyAssistants' : 'emptySites')}</div>`;
  if (name === 'images') return `<div class="creation-gallery">${items.map((item) => `<div class="creation-image-card"><button data-action="view-image" data-id="${esc(item.id)}"><img src="${imageUrl(item.id)}" loading="lazy" alt="${esc(item.name)}"></button><span>${esc(item.name)}</span><button class="creation-image-edit" data-action="edit-image" data-id="${esc(item.id)}">${t('edit')}</button></div>`).join('')}</div>`;
  if (name === 'sites') return `<div class="creation-table creation-sites-table ${state.siteView === 'grid' ? 'is-grid' : ''}"><div class="creation-table-head"><span>${t('sites')}</span><span>${t('sharedWith')}</span><span></span></div>${items.map((item) => `<div class="creation-row"><button class="creation-site-main" data-action="edit" data-id="${esc(item.id)}"><iframe class="creation-site-thumb" tabindex="-1" sandbox="" srcdoc="${esc(item.source || '')}" title="${esc(item.title)}"></iframe><span><strong>${esc(item.title)}</strong><small>${esc(new Date(item.updatedAt || item.createdAt || Date.now()).toLocaleDateString(lang() === 'zh' ? 'zh-CN' : 'en-US', { month: 'short', day: 'numeric' }))}</small></span></button><span class="creation-site-visibility">${item.visibility === 'private' ? t('private') : item.visibility === 'public' ? t('public') : t('unlisted')}</span><div class="creation-row-actions"><button type="button" data-action="site-menu" data-id="${esc(item.id)}" aria-label="${t('name')}: ${esc(item.title)}" aria-expanded="${state.siteMenu === item.id}">⋯</button>${state.siteMenu === item.id ? `<div class="creation-site-row-menu" role="menu"><button type="button" role="menuitem" data-action="preview" data-id="${esc(item.id)}">${t('preview')}</button><button type="button" role="menuitem" data-action="edit" data-id="${esc(item.id)}">${t('edit')}</button><button type="button" role="menuitem" data-action="delete" data-id="${esc(item.id)}">${t('delete')}</button></div>` : ''}</div></div>`).join('')}</div>`;
  return `<div class="creation-table"><div class="creation-table-head"><span>${t('name')}</span><span></span></div>${items.map((item) => `<div class="creation-row"><div><strong>${esc(item.title)}</strong><small>${esc(assistantDescription(item))}</small></div><div class="creation-row-actions"><button data-action="use" data-id="${esc(item.id)}">${t('use')}</button><button data-action="edit" data-id="${esc(item.id)}">${t('edit')}</button><button data-action="delete" data-id="${esc(item.id)}" aria-label="${t('delete')}">⋯</button></div></div>`).join('')}</div>`;
}

function assistantDescription(item) {
  try { return JSON.parse(item.source).description || ''; } catch { return ''; }
}

function imageComposer() {
  const reference = state.editor?.type === 'images' ? state.editor.item : null;
  return `<form id="creationImageForm" class="creation-image-form">${reference ? `<div class="creation-image-reference"><img src="${imageUrl(reference.id)}" alt="${esc(reference.name)}"><span>${esc(reference.name)}</span><button type="button" data-action="close">×</button></div>` : ''}<textarea name="prompt" rows="3" placeholder="${t('imagePrompt')}" aria-label="${t('imagePrompt')}" required></textarea><div class="creation-image-actions"><input name="model" placeholder="${t('imageModel')}" aria-label="${t('imageModel')}" value="${esc(localStorage.getItem('socrates-image-model') || '')}"><button class="creation-primary" type="submit" ${state.busy ? 'disabled' : ''}>${state.busy ? t('loading') : t('create')}</button></div></form>`;
}

function editorMarkup(name) {
  if (name === 'images' || !state.editor || state.editor.type !== name) return '';
  const item = state.editor.item;
  if (name === 'assistants') {
    let config = {};
    try { config = JSON.parse(item?.source || '{}'); } catch { /* empty draft */ }
    return `<div class="creation-editor-backdrop"><form class="creation-editor" data-editor="assistants"><header><h2>${item ? t('edit') : t('createAssistant')}</h2><button type="button" data-action="close" aria-label="${t('cancel')}">×</button></header><label>${t('name')}<input name="title" maxlength="120" required value="${esc(item?.title)}"></label><label>${t('description')}<input name="description" maxlength="240" value="${esc(config.description)}"></label><label>${t('instructions')}<textarea name="instructions" rows="7" required>${esc(config.instructions)}</textarea></label><label>${t('starter')}<input name="starter" maxlength="300" value="${esc(config.starter)}"></label><footer><button type="button" data-action="close">${t('cancel')}</button><button class="creation-primary" type="submit" ${state.busy ? 'disabled' : ''}>${t('save')}</button></footer></form></div>`;
  }
  return `<div class="creation-editor-backdrop"><form class="creation-editor creation-site-editor" data-editor="sites"><header><h2>${item ? t('edit') : t('createSite')}</h2><button type="button" data-action="close" aria-label="${t('cancel')}">×</button></header><label>${t('name')}<input name="title" maxlength="120" required value="${esc(item?.title)}"></label><div class="creation-generation"><textarea name="prompt" rows="2" placeholder="${t('sitePrompt')}" aria-label="${t('sitePrompt')}"></textarea><button type="button" data-action="generate-site">${t('generateSite')}</button></div><label>${t('code')}<textarea name="source" rows="12" required spellcheck="false">${esc(item?.source || '<!doctype html>\n<html lang="zh"><meta charset="utf-8"><title>Socrates Site</title><style>body{font-family:system-ui;max-width:720px;margin:10vh auto;padding:24px}</style><h1>我的站点</h1><p>在这里开始创作。</p></html>')}</textarea></label><div class="creation-publish-controls"><label>${t('publish')}<select name="visibility"><option value="private" ${!item || item.visibility === 'private' ? 'selected' : ''}>${t('private')}</option><option value="unlisted" ${item?.visibility === 'unlisted' ? 'selected' : ''}>${t('unlisted')}</option><option value="public" ${item?.visibility === 'public' ? 'selected' : ''}>${t('public')}</option></select></label><button type="button" data-action="preview-draft">${t('preview')}</button></div><footer><button type="button" data-action="close">${t('cancel')}</button><button class="creation-primary" type="submit" ${state.busy ? 'disabled' : ''}>${t('save')}</button></footer></form></div>`;
}

function render(name) {
  ensurePanels();
  const el = panel(name);
  if (!el) return;
  el.innerHTML = header(name) + (name === 'images' ? imageComposer() : '') + `<div data-creation-list>${listMarkup(name)}</div>` + editorMarkup(name);
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

async function handleClick(name, event) {
  const button = event.target.closest('[data-action]');
  if (!button) return;
  const action = button.dataset.action;
  const item = state[name].find((entry) => entry.id === button.dataset.id);
  if (action === 'retry') return load(name);
  if (action === 'site-view') { state.siteView = button.dataset.view === 'grid' ? 'grid' : 'list'; return render(name); }
  if (action === 'site-menu' && item) { state.siteMenu = state.siteMenu === item.id ? null : item.id; return render(name); }
  if (action === 'new') { if (name === 'images') return panel(name).querySelector('textarea[name="prompt"]')?.focus(); state.editor = { type: name, item: null }; return render(name); }
  if (action === 'close') { state.editor = null; return render(name); }
  if (action === 'edit' && item) { state.editor = { type: name, item }; return render(name); }
  if (action === 'edit-image' && item) { state.editor = { type: 'images', item }; render(name); return panel(name).querySelector('textarea[name="prompt"]')?.focus(); }
  if (action === 'delete' && item) {
    if (!window.confirm(t('confirmDelete'))) return;
    try { await api(`/api/creations/items/${name}/${item.id}`, { method: 'DELETE' }); await load(name); } catch (error) { notice(error?.message || t('error')); }
  }
  if (action === 'use' && item) {
    const didReset = await window.resetApp?.();
    if (didReset === false) return;
    sessionStorage.setItem('socrates-active-assistant', item.id);
    const starter = (() => { try { return JSON.parse(item.source).starter || ''; } catch { return ''; } })();
    const composer = window.__socratesComposerController;
    if (starter) composer?.setMarkdown('topic', starter);
    composer?.focus('topic');
  }
  if (action === 'preview' && item) {
    const frame = document.createElement('iframe');
    frame.className = 'creation-preview-frame'; frame.title = item.title; frame.setAttribute('sandbox', ''); frame.srcdoc = item.source;
    const overlay = document.createElement('div'); overlay.className = 'creation-preview-overlay';
    const close = document.createElement('button'); close.textContent = '×'; close.setAttribute('aria-label', t('cancel')); close.onclick = () => overlay.remove();
    overlay.append(close, frame); document.body.append(overlay);
  }
  if (action === 'view-image' && item) window.open(imageUrl(item.id), '_blank', 'noopener');
  if (action === 'preview-draft') {
    const source = panel(name).querySelector('textarea[name="source"]')?.value || '';
    const frame = document.createElement('iframe'); frame.className = 'creation-preview-frame'; frame.title = t('preview'); frame.setAttribute('sandbox', ''); frame.srcdoc = source;
    const overlay = document.createElement('div'); overlay.className = 'creation-preview-overlay';
    const close = document.createElement('button'); close.textContent = '×'; close.setAttribute('aria-label', t('cancel')); close.onclick = () => overlay.remove();
    overlay.append(close, frame); document.body.append(overlay);
  }
  if (action === 'generate-site') {
    const form = panel(name).querySelector('.creation-site-editor');
    const prompt = form?.elements.prompt.value.trim();
    if (!prompt) return form?.elements.prompt.focus();
    button.disabled = true; button.textContent = t('loading');
    try { const result = await api('/api/creations/sites/generate', { method: 'POST', body: { prompt } }); form.elements.source.value = result.source || ''; }
    catch (error) { notice(error?.message || t('error')); }
    finally { button.disabled = false; button.textContent = t('generateSite'); }
  }
}

async function handleSubmit(name, form) {
  if (state.busy) return;
  state.busy = true;
  const button = form.querySelector('[type="submit"]'); if (button) button.disabled = true;
  try {
    if (name === 'images') {
      const prompt = form.elements.prompt.value.trim();
      if (!prompt) throw new Error(t('noPrompt'));
      const model = form.elements.model.value.trim();
      if (model) localStorage.setItem('socrates-image-model', model);
      const reference = state.editor?.type === 'images' ? state.editor.item : null;
      await api(reference ? `/api/creations/images/${reference.id}/edit` : '/api/creations/images', { method: 'POST', body: { prompt, model } });
      state.editor = null;
    } else {
      const item = state.editor?.item;
      const title = form.elements.title.value.trim();
      const source = name === 'assistants'
        ? JSON.stringify({ description: form.elements.description.value.trim(), instructions: form.elements.instructions.value.trim(), starter: form.elements.starter.value.trim() })
        : form.elements.source.value;
      const url = `/api/creations/items/${name}${item ? `/${item.id}` : ''}`;
      const saved = await api(url, { method: item ? 'PATCH' : 'POST', body: { title, source } });
      if (name === 'sites') {
        const visibility = form.elements.visibility.value;
        const published = await api(`/api/creations/sites/${saved.id}/publish`, { method: 'POST', body: { visibility } });
        if (published.url) {
          await navigator.clipboard?.writeText(new URL(published.url, location.origin).href).catch(() => {});
          notice(`${t('copied')}: ${new URL(published.url, location.origin).href}`);
        }
      }
      state.editor = null;
    }
    await load(name);
  } catch (error) {
    notice(error?.code === 'IMAGE_PROVIDER_NOT_CONFIGURED' ? t('imageUnavailable') : error?.message || t('error'));
  } finally { state.busy = false; if (button) button.disabled = false; }
}

export function renderCreationSurface(name) {
  if (!['images', 'assistants', 'sites'].includes(name)) return;
  state.page = name; state.query = ''; state.editor = null; state.siteMenu = null;
  load(name);
}

ensurePanels();
