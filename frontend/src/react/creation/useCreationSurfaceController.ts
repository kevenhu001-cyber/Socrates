import { createElement, useCallback, useEffect, useRef, useState, type Dispatch, type FormEvent, type SetStateAction } from 'react';
import { focusComposer, setComposerMarkdown } from '../../composer/controller.ts';
import { dispatchExtension } from '../../extensions/index.ts';
import { closeDetailSurface, openDetailSurface } from '../../ui/detailSurface.ts';
import { reportSwallow } from '../../util/reportSwallow.ts';
import { runtimeWindow as browserWindow } from '../../types/runtimeWindow.ts';
import {
  api,
  currentCopy,
  editorDraftFor,
  emptyEditorDraft,
  imageUrl,
  normalizeCreationItem,
  notice,
  type CreationApiItem,
  type CreationEditor,
  type CreationItem,
  type CreationName,
  type EditorDraft,
  type EditorField,
} from './creationModel.ts';

type CreationResponse = { images?: CreationApiItem[]; items?: CreationApiItem[] };

export type CreationSurfacePreferences = {
  siteView: 'grid' | 'list';
  setSiteView: Dispatch<SetStateAction<'grid' | 'list'>>;
  imagePrompt: string;
  setImagePrompt: Dispatch<SetStateAction<string>>;
  imageModel: string;
  setImageModel: Dispatch<SetStateAction<string>>;
};

export function useCreationSurfaceController(name: CreationName, preferences: CreationSurfacePreferences) {
  const [items, setItems] = useState<CreationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [editor, setEditor] = useState<CreationEditor>(null);
  const [draft, setDraft] = useState<EditorDraft>(emptyEditorDraft);
  const [busy, setBusy] = useState(false);
  const [generatingSite, setGeneratingSite] = useState(false);
  const [query, setQuery] = useState('');
  const imagePromptRef = useRef<HTMLTextAreaElement>(null);
  const [, setLocaleRevision] = useState(0);

  useEffect(() => {
    const onLanguageChange = () => setLocaleRevision((revision) => revision + 1);
    document.addEventListener('socrates:langchange', onLanguageChange);
    return () => document.removeEventListener('socrates:langchange', onLanguageChange);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const url = name === 'images' ? '/api/creations/images' : `/api/creations/items/${name}`;
      const result = await api<CreationResponse>(url);
      const rows = name === 'images' ? result.images || [] : result.items || [];
      setItems(rows.map(normalizeCreationItem));
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [name]);

  useEffect(() => { void load(); }, [load]);

  function setDraftField(field: EditorField, value: string) {
    if (field === 'visibility') {
      const visibility = value === 'private' || value === 'public' ? value : 'unlisted';
      setDraft((previous) => ({ ...previous, visibility }));
      return;
    }
    setDraft((previous) => ({ ...previous, [field]: value } as EditorDraft));
  }

  function openEditor(type: CreationName, item: CreationItem | null) {
    setEditor({ type, item });
    setDraft(editorDraftFor(type, item));
  }

  function closeEditor() {
    setEditor(null);
    setDraft(emptyEditorDraft());
  }

  async function resetAppForComposer(): Promise<boolean> {
    const didReset = await (browserWindow.resetApp as (() => boolean | void | Promise<boolean | void>) | undefined)?.();
    return didReset !== false;
  }

  async function startAssistantChat(item: CreationItem) {
    if (!await resetAppForComposer()) return;
    sessionStorage.setItem('socrates-active-assistant', item.id);
    let starter = '';
    try { starter = JSON.parse(item.source || '{}').starter || ''; }
    catch (cause) { reportSwallow(cause, 'creation.startAssistantChat.parseStarter'); }
    if (starter) setComposerMarkdown('topic', starter);
    focusComposer('topic');
  }

  function previewSite(source: string, title: string) {
    const frame = createElement('iframe', {
      className: 'creation-preview-frame',
      title,
      sandbox: '',
      srcDoc: source,
    });
    void openDetailSurface({ owner: 'site-preview', title, closeLabel: currentCopy().cancel, content: frame });
  }

  async function deleteCreation(item: CreationItem) {
    if (!browserWindow.confirm(currentCopy().confirmDelete)) return;
    try {
      await api(`/api/creations/items/${name}/${item.id}`, { method: 'DELETE' });
      await load();
    } catch (cause) {
      notice((cause as Error)?.message || currentCopy().error);
    }
  }

  async function startNewCreation() {
    if (name === 'images') {
      imagePromptRef.current?.focus();
      return;
    }
    if (name === 'sites') {
      if (await resetAppForComposer()) dispatchExtension('createSite');
      return;
    }
    openEditor('assistants', null);
  }

  function handleAction(action: string, id?: string) {
    if (['close', 'edit', 'new'].includes(action)) closeDetailSurface('site-preview');
    const item = items.find((entry) => entry.id === id);
    const handlers: Record<string, () => void | Promise<void>> = {
      retry: () => { void load(); },
      new: startNewCreation,
      close: closeEditor,
      edit: () => { if (item) openEditor(name, item); },
      'edit-image': () => {
        if (!item) return;
        openEditor('images', item);
        imagePromptRef.current?.focus();
      },
      delete: () => { if (item) void deleteCreation(item); },
      use: () => { if (item) void startAssistantChat(item); },
      preview: () => { if (item) previewSite(item.source || '', item.title || ''); },
      'view-image': () => { if (item) browserWindow.open(imageUrl(item.id), '_blank', 'noopener'); },
    };
    return handlers[action]?.();
  }

  async function generateSite() {
    const prompt = draft.prompt.trim();
    if (!prompt) return;
    setGeneratingSite(true);
    try {
      const result = await api<{ source?: string }>('/api/creations/sites/generate', { method: 'POST', body: { prompt } });
      setDraft((previous) => ({ ...previous, source: result.source || '' }));
    } catch (cause) {
      notice((cause as Error)?.message || currentCopy().error);
    } finally {
      setGeneratingSite(false);
    }
  }

  async function submitImage() {
    const text = currentCopy();
    const prompt = preferences.imagePrompt.trim();
    if (!prompt) { notice(text.noPrompt); return; }
    const model = preferences.imageModel.trim();
    if (model) {
      try { localStorage.setItem('socrates-image-model', model); }
      catch (cause) { reportSwallow(cause, 'creation.saveImageModel'); }
    }
    const reference = editor?.type === 'images' ? editor.item : null;
    const url = reference ? `/api/creations/images/${reference.id}/edit` : '/api/creations/images';
    setBusy(true);
    try {
      await api(url, { method: 'POST', body: { prompt, model } });
      closeEditor();
      await load();
    } catch (cause) {
      const code = cause && typeof cause === 'object' && 'code' in cause ? cause.code : undefined;
      notice(code === 'IMAGE_PROVIDER_NOT_CONFIGURED' ? text.imageUnavailable : (cause as Error)?.message || text.error);
    } finally {
      setBusy(false);
    }
  }

  async function publishSite(saved: CreationItem) {
    const published = await api<{ url?: string | null }>(`/api/creations/sites/${saved.id}/publish`, { method: 'POST', body: { visibility: draft.visibility } });
    if (!published.url) return;
    const publishedUrl = new URL(published.url, location.origin).href;
    let copied = false;
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(publishedUrl);
        copied = true;
      }
    } catch (cause) {
      reportSwallow(cause, 'creation.copyPublishedSiteUrl', 'expected');
    }
    notice(copied ? `${currentCopy().copied}: ${publishedUrl}` : publishedUrl);
  }

  async function submitEditor() {
    setBusy(true);
    try {
      const item = editor?.item || null;
      const title = draft.title.trim();
      const source = name === 'assistants'
        ? JSON.stringify({ description: draft.description.trim(), instructions: draft.instructions.trim(), starter: draft.starter.trim() })
        : draft.source;
      const url = `/api/creations/items/${name}${item ? `/${item.id}` : ''}`;
      const saved = normalizeCreationItem(await api<CreationApiItem>(url, { method: item ? 'PATCH' : 'POST', body: { title, source } }));
      if (name === 'sites') await publishSite(saved);
      closeEditor();
      await load();
    } catch (cause) {
      const code = cause && typeof cause === 'object' && 'code' in cause ? cause.code : undefined;
      notice(code === 'IMAGE_PROVIDER_NOT_CONFIGURED' ? currentCopy().imageUnavailable : (cause as Error)?.message || currentCopy().error);
    } finally {
      setBusy(false);
    }
  }

  function submitImageForm(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void submitImage();
  }

  function submitEditorForm(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void submitEditor();
  }

  function previewDraft() {
    previewSite(draft.source, currentCopy().preview);
  }

  return {
    items, loading, error, editor, draft, busy, generatingSite, query, setQuery,
    ...preferences,
    imagePromptRef, setDraftField, closeEditor, handleAction, load, generateSite,
    submitImageForm, submitEditorForm, previewDraft,
  };
}
