import { useLayoutEffect, useMemo, useState, type ChangeEvent } from 'react';
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

export type CreationSnapshot = {
  name: CreationName;
  items: CreationItem[];
  loading: boolean;
  error: string;
  editor: { type: CreationName; item: CreationItem | null } | null;
  busy: boolean;
  query: string;
  siteView: 'grid' | 'list';
  siteMenu: string | null;
  locale: 'en' | 'zh';
  text: Record<string, string>;
  imageModel: string;
};

type CreationSurfaceProps = {
  host: HTMLElement;
  initialState: CreationSnapshot;
};

const DEFAULT_SITE_SOURCE = '<!doctype html>\n<html lang="zh"><meta charset="utf-8"><title>Socrates Site</title><style>body{font-family:system-ui;max-width:720px;margin:10vh auto;padding:24px}</style><h1>我的站点</h1><p>在这里开始创作。</p></html>';

function imageUrl(id: string) {
  return `/api/files/${encodeURIComponent(id)}/raw`;
}

function emitAction(host: HTMLElement, action: string, detail: Record<string, string> = {}) {
  host.dispatchEvent(new CustomEvent('socrates:creation-action', {
    detail: { action, ...detail },
  }));
}

function SearchField({ host, state, sites = false }: { host: HTMLElement; state: CreationSnapshot; sites?: boolean }) {
  const text = state.text;
  function onChange(event: ChangeEvent<HTMLInputElement>) {
    const query = event.currentTarget.value;
    host.dispatchEvent(new CustomEvent('socrates:creation-search', { detail: { query } }));
  }

  return (
    <div className={sites ? 'workspace-search-field creation-sites-search' : 'workspace-search-field creation-header-search'}>
      <Search aria-hidden="true" />
      <Input
        data-search
        type="search"
        aria-label={sites ? text.searchSites : text.search}
        placeholder={sites ? text.searchSites : text.search}
        value={state.query}
        onChange={onChange}
      />
    </div>
  );
}

function CreationHeader({ host, state }: { host: HTMLElement; state: CreationSnapshot }) {
  const { name, text } = state;
  if (name === 'sites') {
    return (
      <>
        <header className="creation-header creation-sites-header">
          <h1>{text.sites}</h1>
          <Button className="creation-primary creation-sites-new" data-action="new">{text.create}</Button>
        </header>
        <SearchField host={host} state={state} sites />
        <div className="creation-sites-view" aria-label={text.listView}>
          <ToggleGroup
            value={[state.siteView]}
            variant="outline"
            size="sm"
            spacing={0}
            aria-label={text.listView}
            onValueChange={(views) => {
              const view = views[views.length - 1];
              if (view === 'grid' || view === 'list') emitAction(host, 'site-view', { view });
            }}
          >
            <ToggleGroupItem value="grid" aria-label={text.gridView}>
              <LayoutGrid data-icon="inline-start" />
            </ToggleGroupItem>
            <ToggleGroupItem value="list" aria-label={text.listView}>
              <List data-icon="inline-start" />
            </ToggleGroupItem>
          </ToggleGroup>
        </div>
        <div className="creation-site-banner">
          <span className="creation-site-banner-icon" aria-hidden="true"><PanelsTopLeft /></span>
          <div><strong>{text.siteBanner}</strong><small>{text.siteBannerBody}</small></div>
          <Button className="creation-primary" data-action="new">{text.createSite}</Button>
        </div>
      </>
    );
  }

  const createLabel = name === 'images' ? text.createImage : text.createAssistant;
  return (
    <header className="creation-header">
      <div><h1>{text[name]}</h1></div>
      <div className="creation-header-actions">
        <SearchField host={host} state={state} />
        <Button className="creation-primary" data-action="new">{createLabel}</Button>
      </div>
    </header>
  );
}

function CreationEmpty({ state }: { state: CreationSnapshot }) {
  const message = state.text[state.name === 'images' ? 'emptyImages' : state.name === 'assistants' ? 'emptyAssistants' : 'emptySites'];
  return (
    <Empty className="creation-empty">
      <EmptyHeader><EmptyDescription>{message}</EmptyDescription></EmptyHeader>
    </Empty>
  );
}

function CreationList({ host, state }: { host: HTMLElement; state: CreationSnapshot }) {
  const { name, text } = state;
  if (state.loading) return <div className="creation-empty" role="status">{text.loading}</div>;
  if (state.error) {
    return <div className="creation-empty" role="alert">{state.error} <Button variant="outline" size="sm" data-action="retry">{text.retry}</Button></div>;
  }

  const query = state.query.toLocaleLowerCase();
  const items = state.items.filter((item) => (item.title || item.name || '').toLocaleLowerCase().includes(query));
  if (!items.length) return <CreationEmpty state={state} />;

  if (name === 'images') {
    return (
      <div className="creation-gallery">
        {items.map((item) => (
          <div className="creation-image-card" key={item.id}>
            <Button variant="ghost" className="h-auto w-full rounded-none p-0" data-action="view-image" data-id={item.id} aria-label={item.name || ''}>
              <img src={imageUrl(item.id)} loading="lazy" alt={item.name || ''} />
            </Button>
            <span>{item.name}</span>
            <Button variant="secondary" size="sm" className="creation-image-edit" data-action="edit-image" data-id={item.id}>{text.edit}</Button>
          </div>
        ))}
      </div>
    );
  }

  if (name === 'sites') {
    return (
      <div className={`creation-table creation-sites-table ${state.siteView === 'grid' ? 'is-grid' : ''}`}>
        <div className="creation-table-head"><span>{text.sites}</span><span>{text.sharedWith}</span><span /></div>
        {items.map((item) => {
          const date = new Date(item.updatedAt || item.createdAt || Date.now()).toLocaleDateString(state.locale === 'zh' ? 'zh-CN' : 'en-US', { month: 'short', day: 'numeric' });
          const visibility = item.visibility === 'private' ? text.private : item.visibility === 'public' ? text.public : text.unlisted;
          return (
            <div className="creation-row" key={item.id}>
              <Button variant="ghost" className="creation-site-main" data-action="edit" data-id={item.id}>
                <iframe className="creation-site-thumb" tabIndex={-1} sandbox="" srcDoc={item.source || ''} title={item.title || ''} />
                <span><strong>{item.title}</strong><small>{date}</small></span>
              </Button>
              <Badge variant="outline" className="creation-site-visibility">{visibility}</Badge>
              <div className="creation-row-actions">
                <DropdownMenu modal={false}>
                  <DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" aria-label={`${text.name}: ${item.title || ''}`}><MoreHorizontal data-icon="inline-start" /></Button>} />
                  <DropdownMenuContent align="end" className="w-36">
                    <DropdownMenuGroup>
                      <DropdownMenuItem nativeButton onClick={() => emitAction(host, 'preview', { id: item.id })}>{text.preview}</DropdownMenuItem>
                      <DropdownMenuItem nativeButton onClick={() => emitAction(host, 'edit', { id: item.id })}>{text.edit}</DropdownMenuItem>
                      <DropdownMenuItem nativeButton variant="destructive" onClick={() => emitAction(host, 'delete', { id: item.id })}>{text.delete}</DropdownMenuItem>
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
      {items.map((item) => (
        <div className="creation-row" key={item.id}>
          <div><strong>{item.title}</strong><small>{assistantDescription(item)}</small></div>
          <div className="creation-row-actions">
            <Button variant="ghost" size="sm" data-action="use" data-id={item.id}>{text.use}</Button>
            <Button variant="ghost" size="sm" data-action="edit" data-id={item.id}>{text.edit}</Button>
            <Button variant="ghost" size="icon-sm" data-action="delete" data-id={item.id} aria-label={text.delete}><Trash2 data-icon="inline-start" /></Button>
          </div>
        </div>
      ))}
    </div>
  );
}

function assistantDescription(item: CreationItem) {
  try { return JSON.parse(item.source || '{}').description || ''; } catch { return ''; }
}

function ImageComposer({ state }: { state: CreationSnapshot }) {
  const reference = state.editor?.type === 'images' ? state.editor.item : null;
  return (
    <form id="creationImageForm" className="creation-image-form">
      {reference && (
        <div className="creation-image-reference">
          <img src={imageUrl(reference.id)} alt={reference.name || ''} />
          <span>{reference.name}</span>
          <Button variant="ghost" size="icon-sm" type="button" data-action="close" aria-label={state.text.cancel}><X data-icon="inline-start" /></Button>
        </div>
      )}
      <Textarea name="prompt" rows={3} placeholder={state.text.imagePrompt} aria-label={state.text.imagePrompt} required />
      <div className="creation-image-actions">
        <Input name="model" placeholder={state.text.imageModel} aria-label={state.text.imageModel} defaultValue={state.imageModel} />
        <Button className="creation-primary" type="submit" disabled={state.busy}>{state.busy ? state.text.loading : state.text.create}</Button>
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

function AssistantEditor({ host, state }: { host: HTMLElement; state: CreationSnapshot }) {
  const item = state.editor?.item || null;
  const config = useMemo(() => {
    try { return JSON.parse(item?.source || '{}'); } catch { return {}; }
  }, [item?.source]);
  const titleId = 'creation-assistant-title';
  const descriptionId = 'creation-assistant-description';
  const instructionsId = 'creation-assistant-instructions';
  const starterId = 'creation-assistant-starter';
  const text = state.text;

  return (
    <div className="creation-editor-page">
      <form className="creation-editor" data-editor="assistants" key={item?.id || 'new-assistant'}>
        <EditorHeader title={item ? text.edit : text.createAssistant} cancel={text.cancel} onClose={() => emitAction(host, 'close')} />
        <FieldGroup>
          <Field><FieldLabel htmlFor={titleId}>{text.name}</FieldLabel><Input id={titleId} name="title" maxLength={120} required defaultValue={item?.title || ''} /></Field>
          <Field><FieldLabel htmlFor={descriptionId}>{text.description}</FieldLabel><Input id={descriptionId} name="description" maxLength={240} defaultValue={config.description || ''} /></Field>
          <Field><FieldLabel htmlFor={instructionsId}>{text.instructions}</FieldLabel><Textarea id={instructionsId} name="instructions" rows={7} required defaultValue={config.instructions || ''} /></Field>
          <Field><FieldLabel htmlFor={starterId}>{text.starter}</FieldLabel><Input id={starterId} name="starter" maxLength={300} defaultValue={config.starter || ''} /></Field>
        </FieldGroup>
        <footer>
          <Button variant="ghost" type="button" data-action="close">{text.cancel}</Button>
          <Button className="creation-primary" type="submit" disabled={state.busy}>{text.save}</Button>
        </footer>
      </form>
    </div>
  );
}

function SiteEditor({ host, state }: { host: HTMLElement; state: CreationSnapshot }) {
  const item = state.editor?.item || null;
  const text = state.text;
  const titleId = 'creation-site-title';
  const promptId = 'creation-site-prompt';
  const sourceId = 'creation-site-source';
  const visibilityId = 'creation-site-visibility';

  return (
    <div className="creation-editor-page">
      <form className="creation-editor creation-site-editor" data-editor="sites" key={item?.id || 'new-site'}>
        <EditorHeader title={item ? text.edit : text.createSite} cancel={text.cancel} onClose={() => emitAction(host, 'close')} />
        <FieldGroup>
          <Field><FieldLabel htmlFor={titleId}>{text.name}</FieldLabel><Input id={titleId} name="title" maxLength={120} required defaultValue={item?.title || ''} /></Field>
          <div className="creation-generation">
            <Textarea id={promptId} name="prompt" rows={2} placeholder={text.sitePrompt} aria-label={text.sitePrompt} />
            <Button variant="outline" type="button" data-action="generate-site">{text.generateSite}</Button>
          </div>
          <Field><FieldLabel htmlFor={sourceId}>{text.code}</FieldLabel><Textarea id={sourceId} name="source" rows={12} required spellCheck={false} defaultValue={item?.source || DEFAULT_SITE_SOURCE} /></Field>
          <div className="creation-publish-controls">
            <Field><FieldLabel htmlFor={visibilityId}>{text.publish}</FieldLabel>
              <NativeSelect id={visibilityId} name="visibility" defaultValue={item?.visibility || 'private'}>
                <NativeSelectOption value="private">{text.private}</NativeSelectOption>
                <NativeSelectOption value="unlisted">{text.unlisted}</NativeSelectOption>
                <NativeSelectOption value="public">{text.public}</NativeSelectOption>
              </NativeSelect>
            </Field>
            <Button variant="outline" type="button" data-action="preview-draft">{text.preview}</Button>
          </div>
        </FieldGroup>
        <footer>
          <Button variant="ghost" type="button" data-action="close">{text.cancel}</Button>
          <Button className="creation-primary" type="submit" disabled={state.busy}>{text.save}</Button>
        </footer>
      </form>
    </div>
  );
}

function CreationSurfaceView({ host, initialState }: CreationSurfaceProps) {
  const [state, setState] = useState(initialState);
  useLayoutEffect(() => {
    const onState = (event: Event) => setState((event as CustomEvent<CreationSnapshot>).detail);
    host.addEventListener('socrates:creation-surface-state', onState);
    return () => host.removeEventListener('socrates:creation-surface-state', onState);
  }, [host]);

  if (state.name !== 'images' && state.editor?.type === state.name) {
    return state.name === 'assistants' ? <AssistantEditor host={host} state={state} /> : <SiteEditor host={host} state={state} />;
  }

  return (
    <>
      <CreationHeader host={host} state={state} />
      {state.name === 'images' && <ImageComposer state={state} />}
      <div data-creation-list><CreationList host={host} state={state} /></div>
    </>
  );
}

export { CreationSurfaceView };
