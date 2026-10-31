import { useState, type FormEvent, type Ref } from 'react';
import {
  LayoutGrid,
  List,
  MoreHorizontal,
  PanelsTopLeft,
  Search,
  Trash2,
  X,
} from 'lucide-react';
import { Badge } from '../ui/shadcn/badge';
import { Button } from '../ui/shadcn/button';
import { Empty, EmptyDescription, EmptyHeader } from '../ui/shadcn/empty';
import { Field, FieldGroup, FieldLabel } from '../ui/shadcn/field';
import { Input } from '../ui/shadcn/input';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '../ui/shadcn/dropdown-menu';
import { NativeSelect, NativeSelectOption } from '../ui/shadcn/native-select';
import { Textarea } from '../ui/shadcn/textarea';
import { ToggleGroup, ToggleGroupItem } from '../ui/shadcn/toggle-group';
import { reportSwallow } from '../../util/reportSwallow.ts';
import { getCurrentLanguage } from '../../i18n/languageState.ts';
import { currentCopy, imageUrl, readImageModel, type CreationItem, type CreationName, type EditorDraft, type EditorField } from './creationModel.ts';
import { useCreationSurfaceController } from './useCreationSurfaceController.ts';
import type { CreationSurfacePreferences } from './useCreationSurfaceController.ts';

export type { CreationName } from './creationModel.ts';

function SearchField({ name, query, onQueryChange }: { name: CreationName; query: string; onQueryChange: (value: string) => void }) {
  const text = currentCopy();
  const sites = name === 'sites';
  return (
    <div className={sites ? 'workspace-search-field creation-sites-search' : 'workspace-search-field creation-header-search'}>
      <Search aria-hidden="true" />
      <Input
        type="search"
        aria-label={sites ? text.searchSites : text.search}
        placeholder={sites ? text.searchSites : text.search}
        value={query}
        onChange={(event) => onQueryChange(event.currentTarget.value)}
      />
    </div>
  );
}

function CreationHeader({ name, query, siteView, onQueryChange, onNew, onSiteViewChange }: {
  name: CreationName;
  query: string;
  siteView: 'grid' | 'list';
  onQueryChange: (value: string) => void;
  onNew: () => void;
  onSiteViewChange: (value: 'grid' | 'list') => void;
}) {
  const text = currentCopy();
  if (name === 'sites') {
    return (
      <>
        <header className="creation-header creation-sites-header">
          <h1>{text.sites}</h1>
          <Button className="creation-primary creation-sites-new" onClick={onNew}>{text.create}</Button>
        </header>
        <SearchField name={name} query={query} onQueryChange={onQueryChange} />
        <div className="creation-sites-view" aria-label={text.listView}>
          <ToggleGroup
            value={[siteView]}
            variant="outline"
            size="sm"
            spacing={0}
            aria-label={text.listView}
            onValueChange={(views) => {
              const view = views[views.length - 1];
              if (view === 'grid' || view === 'list') onSiteViewChange(view);
            }}
          >
            <ToggleGroupItem value="grid" aria-label={text.gridView}><LayoutGrid data-icon="inline-start" /></ToggleGroupItem>
            <ToggleGroupItem value="list" aria-label={text.listView}><List data-icon="inline-start" /></ToggleGroupItem>
          </ToggleGroup>
        </div>
        <div className="creation-site-banner">
          <span className="creation-site-banner-icon" aria-hidden="true"><PanelsTopLeft /></span>
          <div><strong>{text.siteBanner}</strong><small>{text.siteBannerBody}</small></div>
          <Button className="creation-primary" onClick={onNew}>{text.createSite}</Button>
        </div>
      </>
    );
  }

  const createLabel = name === 'images' ? text.createImage : text.createAssistant;
  return (
    <header className="creation-header">
      <div><h1>{text[name]}</h1></div>
      <div className="creation-header-actions">
        <SearchField name={name} query={query} onQueryChange={onQueryChange} />
        <Button className="creation-primary" onClick={onNew}>{createLabel}</Button>
      </div>
    </header>
  );
}

function CreationEmpty({ name }: { name: CreationName }) {
  const text = currentCopy();
  const message = text[name === 'images' ? 'emptyImages' : name === 'assistants' ? 'emptyAssistants' : 'emptySites'];
  return <Empty className="creation-empty"><EmptyHeader><EmptyDescription>{message}</EmptyDescription></EmptyHeader></Empty>;
}

function assistantDescription(item: CreationItem) {
  try { return JSON.parse(item.source || '{}').description || ''; }
  catch (error) { reportSwallow(error, 'creation.assistantDescription.parse'); return ''; }
}

function CreationList({ name, items, loading, error, query, siteView, onRetry, onAction }: {
  name: CreationName;
  items: CreationItem[];
  loading: boolean;
  error: boolean;
  query: string;
  siteView: 'grid' | 'list';
  onRetry: () => void;
  onAction: (action: string, id?: string) => void;
}) {
  const text = currentCopy();
  if (loading) return <div className="creation-empty" role="status">{text.loading}</div>;
  if (error) return <div className="creation-empty" role="alert">{text.error} <Button variant="outline" size="sm" onClick={onRetry}>{text.retry}</Button></div>;

  const normalizedQuery = query.toLocaleLowerCase();
  const visibleItems = items.filter((item) => (item.title || item.name || '').toLocaleLowerCase().includes(normalizedQuery));
  if (!visibleItems.length) return <CreationEmpty name={name} />;

  if (name === 'images') {
    return (
      <div className="creation-gallery">
        {visibleItems.map((item) => (
          <div className="creation-image-card" key={item.id}>
            <Button variant="ghost" className="h-auto w-full rounded-none p-0" onClick={() => onAction('view-image', item.id)} aria-label={item.name || ''}>
              <img src={imageUrl(item.id)} loading="lazy" alt={item.name || ''} />
            </Button>
            <span>{item.name}</span>
            <Button variant="secondary" size="sm" className="creation-image-edit" data-action="edit-image" onClick={() => onAction('edit-image', item.id)}>{text.edit}</Button>
          </div>
        ))}
      </div>
    );
  }

  if (name === 'sites') {
    const locale = getCurrentLanguage() === 'zh' ? 'zh-CN' : 'en-US';
    return (
      <div className={`creation-table creation-sites-table ${siteView === 'grid' ? 'is-grid' : ''}`}>
        <div className="creation-table-head"><span>{text.sites}</span><span>{text.sharedWith}</span><span /></div>
        {visibleItems.map((item) => {
          const date = new Date(item.updatedAt || item.createdAt || Date.now()).toLocaleDateString(locale, { month: 'short', day: 'numeric' });
          const visibility = item.visibility === 'private' ? text.private : item.visibility === 'public' ? text.public : text.unlisted;
          return (
            <div className="creation-row" key={item.id}>
              <Button variant="ghost" className="creation-site-main" data-action="edit" onClick={() => onAction('edit', item.id)}>
                <iframe className="creation-site-thumb" tabIndex={-1} sandbox="" srcDoc={item.source || ''} title={item.title || ''} />
                <span><strong>{item.title}</strong><small>{date}</small></span>
              </Button>
              <Badge variant="outline" className="creation-site-visibility">{visibility}</Badge>
              <div className="creation-row-actions">
                <DropdownMenu modal={false}>
                  <DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" aria-label={`${text.name}: ${item.title || ''}`}><MoreHorizontal data-icon="inline-start" /></Button>} />
                  <DropdownMenuContent align="end" className="w-36">
                    <DropdownMenuGroup>
                      <DropdownMenuItem nativeButton onClick={() => onAction('preview', item.id)}>{text.preview}</DropdownMenuItem>
                      <DropdownMenuItem nativeButton onClick={() => onAction('edit', item.id)}>{text.edit}</DropdownMenuItem>
                      <DropdownMenuItem nativeButton variant="destructive" onClick={() => onAction('delete', item.id)}>{text.delete}</DropdownMenuItem>
                    </DropdownMenuGroup>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>
          );
        })}
      </div>
    );
  }

  return (
    <div className="creation-table">
      <div className="creation-table-head"><span>{text.name}</span><span /></div>
      {visibleItems.map((item) => (
        <div className="creation-row" key={item.id}>
          <div><strong>{item.title}</strong><small>{assistantDescription(item)}</small></div>
          <div className="creation-row-actions">
            <Button variant="ghost" size="sm" data-action="use" onClick={() => onAction('use', item.id)}>{text.use}</Button>
            <Button variant="ghost" size="sm" data-action="edit" onClick={() => onAction('edit', item.id)}>{text.edit}</Button>
            <Button variant="ghost" size="icon-sm" data-action="delete" onClick={() => onAction('delete', item.id)} aria-label={text.delete}><Trash2 data-icon="inline-start" /></Button>
          </div>
        </div>
      ))}
    </div>
  );
}

function ImageComposer({ prompt, model, image, busy, inputRef, onPromptChange, onModelChange, onSubmit, onClose }: {
  prompt: string;
  model: string;
  image: CreationItem | null;
  busy: boolean;
  inputRef: Ref<HTMLTextAreaElement>;
  onPromptChange: (value: string) => void;
  onModelChange: (value: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onClose: () => void;
}) {
  const text = currentCopy();
  return (
    <form id="creationImageForm" className="creation-image-form" onSubmit={onSubmit}>
      {image && (
        <div className="creation-image-reference">
          <img src={imageUrl(image.id)} alt={image.name || ''} />
          <span>{image.name}</span>
          <Button variant="ghost" size="icon-sm" type="button" onClick={onClose} aria-label={text.cancel}><X data-icon="inline-start" /></Button>
        </div>
      )}
      <Textarea ref={inputRef} name="prompt" rows={3} placeholder={text.imagePrompt} aria-label={text.imagePrompt} required value={prompt} onChange={(event) => onPromptChange(event.currentTarget.value)} />
      <div className="creation-image-actions">
        <Input name="model" placeholder={text.imageModel} aria-label={text.imageModel} value={model} onChange={(event) => onModelChange(event.currentTarget.value)} />
        <Button className="creation-primary" type="submit" disabled={busy}>{busy ? text.loading : text.create}</Button>
      </div>
    </form>
  );
}

function EditorHeader({ title, cancel, onClose }: { title: string; cancel: string; onClose: () => void }) {
  return (
    <header>
      <h2>{title}</h2>
      <Button variant="ghost" size="icon-sm" type="button" aria-label={cancel} onClick={onClose}><X data-icon="inline-start" /></Button>
    </header>
  );
}

function AssistantEditor({ draft, editing, busy, onDraftChange, onClose, onSubmit }: {
  draft: EditorDraft;
  editing: boolean;
  busy: boolean;
  onDraftChange: (field: EditorField, value: string) => void;
  onClose: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  const text = currentCopy();
  const titleId = 'creation-assistant-title';
  const descriptionId = 'creation-assistant-description';
  const instructionsId = 'creation-assistant-instructions';
  const starterId = 'creation-assistant-starter';
  return (
    <div className="creation-editor-page">
      <form className="creation-editor" data-editor="assistants" onSubmit={onSubmit}>
        <EditorHeader title={editing ? text.edit : text.createAssistant} cancel={text.cancel} onClose={onClose} />
        <FieldGroup>
          <Field><FieldLabel htmlFor={titleId}>{text.name}</FieldLabel><Input id={titleId} name="title" maxLength={120} required value={draft.title} onChange={(event) => onDraftChange('title', event.currentTarget.value)} /></Field>
          <Field><FieldLabel htmlFor={descriptionId}>{text.description}</FieldLabel><Input id={descriptionId} name="description" maxLength={240} value={draft.description} onChange={(event) => onDraftChange('description', event.currentTarget.value)} /></Field>
          <Field><FieldLabel htmlFor={instructionsId}>{text.instructions}</FieldLabel><Textarea id={instructionsId} name="instructions" rows={7} required value={draft.instructions} onChange={(event) => onDraftChange('instructions', event.currentTarget.value)} /></Field>
          <Field><FieldLabel htmlFor={starterId}>{text.starter}</FieldLabel><Input id={starterId} name="starter" maxLength={300} value={draft.starter} onChange={(event) => onDraftChange('starter', event.currentTarget.value)} /></Field>
        </FieldGroup>
        <footer>
          <Button variant="ghost" type="button" onClick={onClose}>{text.cancel}</Button>
          <Button className="creation-primary" type="submit" disabled={busy}>{busy ? text.loading : text.save}</Button>
        </footer>
      </form>
    </div>
  );
}

function SiteEditor({ draft, editing, busy, generating, onDraftChange, onClose, onGenerate, onPreview, onSubmit }: {
  draft: EditorDraft;
  editing: boolean;
  busy: boolean;
  generating: boolean;
  onDraftChange: (field: EditorField, value: string) => void;
  onClose: () => void;
  onGenerate: () => void;
  onPreview: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  const text = currentCopy();
  const titleId = 'creation-site-title';
  const promptId = 'creation-site-prompt';
  const sourceId = 'creation-site-source';
  const visibilityId = 'creation-site-visibility';
  return (
    <div className="creation-editor-page">
      <form className="creation-editor creation-site-editor" data-editor="sites" onSubmit={onSubmit}>
        <EditorHeader title={editing ? text.edit : text.createSite} cancel={text.cancel} onClose={onClose} />
        <FieldGroup>
          <Field><FieldLabel htmlFor={titleId}>{text.name}</FieldLabel><Input id={titleId} name="title" maxLength={120} required value={draft.title} onChange={(event) => onDraftChange('title', event.currentTarget.value)} /></Field>
          <div className="creation-generation">
            <Textarea id={promptId} name="prompt" rows={2} placeholder={text.sitePrompt} aria-label={text.sitePrompt} value={draft.prompt} onChange={(event) => onDraftChange('prompt', event.currentTarget.value)} />
            <Button variant="outline" type="button" disabled={generating} onClick={onGenerate}>{generating ? text.loading : text.generateSite}</Button>
          </div>
          <Field><FieldLabel htmlFor={sourceId}>{text.code}</FieldLabel><Textarea id={sourceId} name="source" rows={12} required spellCheck={false} value={draft.source} onChange={(event) => onDraftChange('source', event.currentTarget.value)} /></Field>
          <div className="creation-publish-controls">
            <Field><FieldLabel htmlFor={visibilityId}>{text.publish}</FieldLabel>
              <NativeSelect id={visibilityId} name="visibility" value={draft.visibility} onChange={(event) => onDraftChange('visibility', event.currentTarget.value)}>
                <NativeSelectOption value="private">{text.private}</NativeSelectOption>
                <NativeSelectOption value="unlisted">{text.unlisted}</NativeSelectOption>
                <NativeSelectOption value="public">{text.public}</NativeSelectOption>
              </NativeSelect>
            </Field>
            <Button variant="outline" type="button" data-action="preview-draft" onClick={onPreview}>{text.preview}</Button>
          </div>
        </FieldGroup>
        <footer>
          <Button variant="ghost" type="button" onClick={onClose}>{text.cancel}</Button>
          <Button className="creation-primary" type="submit" disabled={busy}>{busy ? text.loading : text.save}</Button>
        </footer>
      </form>
    </div>
  );
}

function CreationSurfaceContent({ name, preferences }: { name: CreationName; preferences: CreationSurfacePreferences }) {
  const controller = useCreationSurfaceController(name, preferences);

  if (name === 'assistants' && controller.editor?.type === 'assistants') {
    return <AssistantEditor draft={controller.draft} editing={Boolean(controller.editor.item)} busy={controller.busy} onDraftChange={controller.setDraftField} onClose={controller.closeEditor} onSubmit={controller.submitEditorForm} />;
  }
  if (name === 'sites' && controller.editor?.type === 'sites') {
    return <SiteEditor draft={controller.draft} editing={Boolean(controller.editor.item)} busy={controller.busy} generating={controller.generatingSite} onDraftChange={controller.setDraftField} onClose={controller.closeEditor} onGenerate={() => { void controller.generateSite(); }} onPreview={controller.previewDraft} onSubmit={controller.submitEditorForm} />;
  }

  return (
    <>
      <CreationHeader
        name={name}
        query={controller.query}
        siteView={controller.siteView}
        onQueryChange={controller.setQuery}
        onNew={() => { void controller.handleAction('new'); }}
        onSiteViewChange={controller.setSiteView}
      />
      {name === 'images' && (
        <ImageComposer
          prompt={controller.imagePrompt}
          model={controller.imageModel}
          image={controller.editor?.type === 'images' ? controller.editor.item : null}
          busy={controller.busy}
          inputRef={controller.imagePromptRef}
          onPromptChange={controller.setImagePrompt}
          onModelChange={controller.setImageModel}
          onSubmit={controller.submitImageForm}
          onClose={controller.closeEditor}
        />
      )}
      <div data-creation-list>
        <CreationList name={name} items={controller.items} loading={controller.loading} error={controller.error} query={controller.query} siteView={controller.siteView} onRetry={() => { void controller.load(); }} onAction={controller.handleAction} />
      </div>
    </>
  );
}

export function CreationSurfaceView({ name, openRevision }: { name: CreationName; openRevision: number }) {
  const [siteView, setSiteView] = useState<'grid' | 'list'>('list');
  const [imagePrompt, setImagePrompt] = useState('');
  const [imageModel, setImageModel] = useState(readImageModel);
  const preferences = { siteView, setSiteView, imagePrompt, setImagePrompt, imageModel, setImageModel };
  return <CreationSurfaceContent key={openRevision} name={name} preferences={preferences} />;
}
