import type { ReactElement } from 'react';
import { getApiFetch, getConnectorIconMarkupFn, getLegacyActions, i18n, setActiveProject, setNextProjectId } from '../../legacy/gateway.ts';
import { getCachedProjects } from '../../../projects/projectCache.ts';
import { dispatchSession, sessionStore } from '../../../store/index.ts';
import { openLibraryDetail } from '../../../ui/libraryDetail.js';
import { mountDialogCard, unmountDialogCard } from './workspace.dialogHost';
import {
  AgentRunView,
  ArxivSearchView,
  ConnectorCredentialsView,
  ManageConnectorView,
  ProjectFormView,
  ProjectWorkspaceView,
  ScheduledTaskFormView,
  ZoteroSearchView,
} from './workspace.dialogViews';
import { useWorkspaceStore } from './workspace.store';
import {
  deleteProjectRecord,
  disconnectProjectPlugin,
  getWorkspaceLibraryItem,
  saveProjectRecord,
  submitProjectPluginCredentials,
} from './workspace.service';
import {
  deleteScheduledTask,
  saveScheduledTask,
} from '../scheduled/scheduled.service';
import { useScheduledStore } from '../scheduled/scheduled.store';

type Api = NonNullable<ReturnType<typeof getApiFetch>>;

interface ProjectRunSummary {
  id: string;
  task?: string;
  status?: string;
  startedAt?: string | number;
  summary?: string;
  error?: string;
}

interface ProjectRunDetails {
  run?: ProjectRunSummary;
  artifacts?: Array<{ id: string; name?: string }>;
  events?: Array<{ event?: string; data?: { command?: string; delta?: unknown } }>;
}

interface PaperSummary {
  title?: string;
  authors?: string[];
  publishedAt?: string;
  categories?: string[];
  abstractUrl?: string;
  pdfUrl?: string;
  summary?: string;
}

interface ReferenceSummary {
  title?: string;
  itemType?: string;
  creators?: string[];
  date?: string;
}

function api(): Api {
  const request = getApiFetch();
  if (!request) throw new Error('The API client is not ready.');
  return request;
}

function byId<T extends HTMLElement = HTMLElement>(id: string): T | null {
  return document.getElementById(id) as T | null;
}

function escapeHtml(value: unknown): string {
  return String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function toast(message: string): void {
  getLegacyActions().messages.showToast?.(message);
}

async function confirmAction(title: string, message: string): Promise<boolean> {
  return getLegacyActions().confirm.showConfirm(title, message, true);
}

function dialogHost(): HTMLDivElement {
  let dialog = byId<HTMLDivElement>('workspaceDialog');
  if (dialog) return dialog;
  dialog = document.createElement('div');
  dialog.id = 'workspaceDialog';
  dialog.className = 'workspace-dialog hidden';
  dialog.setAttribute('role', 'dialog');
  dialog.setAttribute('aria-modal', 'true');
  dialog.addEventListener('click', (event) => { if (event.target === dialog) closeWorkspaceDialog(); });
  document.body.appendChild(dialog);
  return dialog;
}

/** Mount a React view into the same card shell and run the shared wiring. */
export function showWorkspaceDialogView(element: ReactElement, cardClass = ''): HTMLDivElement {
  const dialog = dialogHost();
  const extraClass = cardClass === 'library-file-preview-card' ? cardClass : '';
  unmountDialogCard();
  dialog.replaceChildren();
  mountDialogCard(dialog, element, extraClass);
  dialog.classList.remove('hidden');
  dialog.querySelectorAll<HTMLElement>('[data-dialog-close]').forEach((button) => button.addEventListener('click', closeWorkspaceDialog));
  const focus = dialog.querySelector<HTMLElement>('input, textarea, select');
  if (focus) setTimeout(() => focus.focus(), 0);
  return dialog;
}

export function closeWorkspaceDialog(): void {
  const dialog = byId('workspaceDialog');
  if (!dialog) return;
  dialog.classList.add('hidden');
  unmountDialogCard();
  dialog.innerHTML = '';
}


type CachedProject = ReturnType<typeof getCachedProjects>[number];

async function deleteProjectFromForm(project: CachedProject): Promise<void> {
  const accepted = await confirmAction(i18n('confirm.deleteProject.title', 'Delete this project?'), i18n('confirm.deleteProject.msg', "This permanently deletes the project's chats, files, artifacts, and memories. This cannot be undone."));
  if (!accepted) return;
  await deleteProjectRecord(project.id);
  closeWorkspaceDialog();
  void getLegacyActions().sessions.flushRecentsReconcile();
}

function bindProjectForm(dialog: HTMLDivElement, project: CachedProject | null): void {
  const form = dialog.querySelector<HTMLFormElement>('#projectForm');
  form?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(form).entries());
    try {
      await saveProjectRecord(project?.id || null, data);
      closeWorkspaceDialog();
    } catch { /* service already reports the save failure */ }
  });
  if (!project) return;
  dialog.querySelector('[data-action="delete-project"]')?.addEventListener('click', async () => {
    await deleteProjectFromForm(project);
  });
}

function libraryFilePreviewBody(mime: string, name: string, rawUrl: string): { html: string; isMedia: boolean } {
  if (mime.startsWith('image/')) {
    return { html: `<div class="library-file-preview-media"><img src="${escapeHtml(rawUrl)}" alt="${escapeHtml(name)}" /></div>`, isMedia: true };
  }
  if (mime === 'application/pdf') {
    return { html: `<iframe class="library-file-preview-frame" src="${escapeHtml(rawUrl)}" title="${escapeHtml(name)}"></iframe>`, isMedia: true };
  }
  if (mime.startsWith('video/')) {
    return { html: `<div class="library-file-preview-media"><video controls preload="metadata" src="${escapeHtml(rawUrl)}"></video></div>`, isMedia: true };
  }
  if (mime.startsWith('audio/')) {
    return { html: `<div class="library-file-preview-audio"><audio controls preload="metadata" src="${escapeHtml(rawUrl)}"></audio></div>`, isMedia: true };
  }
  return {
    html: '<div id="libraryFilePreviewBody" class="library-file-preview-loading">' + i18n('library.preview.loading', 'Loading file content…') + '</div>',
    isMedia: false,
  };
}

function openLibraryArtifact(artifact: NonNullable<ReturnType<typeof getWorkspaceLibraryItem>>): void {
  openLibraryDetail(
    artifact.title || artifact.name || i18n('library.untitled', 'Untitled'),
    i18n('library.preview.artifactSource', 'Created item source'),
    `<pre class="library-file-preview-text library-artifact-source">${escapeHtml(artifact.source || '')}</pre>`,
    i18n('dialog.close', 'Close'),
  );
}

export function openProjectForm(projectId: string | null = null): void {
  const project = projectId ? getCachedProjects().find((entry) => entry.id === projectId) || null : null;
  const editing = Boolean(project);
  const title = i18n(editing ? 'dialog.project.editTitle' : 'dialog.project.newTitle', editing ? 'Edit project' : 'New project');
  const dialog = showWorkspaceDialogView(<ProjectFormView project={project} title={title} />);
  bindProjectForm(dialog, project);
}

export function openLibraryItem(id: string, _kind: string, collection?: string): void {
  const file = getWorkspaceLibraryItem(id, 'files');
  const artifact = getWorkspaceLibraryItem(id, 'artifacts');
  if (collection === 'artifacts' || (!collection && !file && artifact)) {
    if (!artifact) return;
    openLibraryArtifact(artifact);
    return;
  }
  if (!file) {
    toast(i18n('toast.fileOpenFailed', 'Could not open this file.'));
    return;
  }

  const name = file.name || i18n('library.untitled', 'Untitled');
  const mime = String(file.mimeType || '').toLowerCase();
  const rawUrl = '/api/v2/files/' + encodeURIComponent(file.id) + '/raw?inline=1';
  // Direct download for the original bytes: documents force-download via
  // Content-Disposition server-side; the `download` attribute covers the
  // inline-served kinds (images/PDF/media) so every preview can be saved.
  const downloadUrl = '/api/v2/files/' + encodeURIComponent(file.id) + '/raw';
  const { html: body, isMedia } = libraryFilePreviewBody(mime, name, rawUrl);

  const downloadRow = `<div class="library-file-download"><a class="workspace-row-action" href="${escapeHtml(downloadUrl)}" download="${escapeHtml(name)}">${escapeHtml(i18n('library.download', 'Download original'))}</a></div>`;
  openLibraryDetail(name, mime || i18n('library.preview.file', 'File'), downloadRow + body, i18n('dialog.close', 'Close'));
  if (!isMedia) void loadLibraryFileContent(file.id);
}

async function loadLibraryFileContent(id: string): Promise<void> {
  const body = byId('libraryFilePreviewBody');
  if (!body) return;
  try {
    const result = await api()('/api/files/' + encodeURIComponent(id) + '/content');
    if (byId('libraryFilePreviewBody') !== body) return;
    if (!result || result.ok === false) throw new Error(result?.error || i18n('library.preview.failed', 'Could not load this file.'));
    body.innerHTML = `<pre class="library-file-preview-text">${escapeHtml(result.text || '')}</pre>${result.truncated ? `<p class="workspace-note library-file-preview-note">${i18n('library.preview.truncated', 'Only the first part of this file is shown.')}</p>` : ''}`;
  } catch (error) {
    if (byId('libraryFilePreviewBody') !== body) return;
    body.innerHTML = `<div class="workspace-empty library-file-preview-error"><strong>${i18n('library.preview.failed', 'Could not load this file.')}</strong><span>${escapeHtml(error instanceof Error ? error.message : '')}</span></div>`;
  }
}

export async function openProjectWorkspace(projectId: string): Promise<void> {
  const project = getCachedProjects().find((entry) => entry.id === projectId);
  if (!project) return;
  const dialog = showWorkspaceDialogView(
    <ProjectWorkspaceView
      name={String(project.name)}
      description={String(project.description || i18n('dialog.project.defaultDesc', 'A focused place for related work.'))}
    />,
  );
  dialog.querySelector('[data-action="new-chat"]')?.addEventListener('click', async () => {
    setNextProjectId(projectId);
    setActiveProject(project);
    closeWorkspaceDialog();
    await getLegacyActions().navigation.resetApp();
  });
  dialog.querySelector('[data-action="move-chat"]')?.addEventListener('click', async () => {
    dispatchSession({ type: 'session/set', key: 'currentProjectId', value: projectId });
    setActiveProject(project);
    const sessionId = sessionStore.getState().currentSessionId;
    try {
      if (sessionId) await api()('/api/sessions/' + encodeURIComponent(sessionId), { method: 'PATCH', body: { projectId } });
      closeWorkspaceDialog();
      toast(i18n('toast.chatMoved', 'Current chat moved to project'));
      void getLegacyActions().sessions.flushRecentsReconcile();
    } catch { toast(i18n('toast.chatMoveFailed', 'Could not move the current chat')); }
  });
  void renderProjectRunHistory(projectId);
}

function timeLabel(value: unknown): string {
  if (!value) return '';
  const date = new Date(String(value));
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

function runStatusLabel(status: unknown): string {
  const labels: Record<string, string> = { completed: 'Completed', running: 'Running', starting: 'Starting', planning: 'Planning', awaiting_approval: 'Needs approval', disconnected: 'Ready to resume', failed: 'Failed', interrupted: 'Stopped' };
  return labels[String(status || '')] || String(status || 'Unknown');
}

async function renderProjectRunHistory(projectId: string): Promise<void> {
  const host = byId('projectRunHistory');
  if (!host) return;
  host.innerHTML = `<div class="workspace-loading">${escapeHtml(i18n('dialog.project.runsLoading', 'Loading agent runs…'))}</div>`;
  try {
    const result = await api()<{ runs?: ProjectRunSummary[] }>('/api/agent-runs?projectId=' + encodeURIComponent(projectId) + '&limit=8');
    const current = byId('projectRunHistory');
    if (!current) return;
    current.replaceChildren();
    const heading = document.createElement('div');
    heading.className = 'project-runtime-heading';
    heading.textContent = i18n('dialog.project.runsTitle', 'Workspace agent runs');
    current.appendChild(heading);
    const runs = Array.isArray(result?.runs) ? result.runs : [];
    if (!runs.length) {
      const empty = document.createElement('p');
      empty.className = 'workspace-note';
      empty.textContent = i18n('dialog.project.runsEmpty', 'Runs, approvals, and generated artifacts will appear here.');
      current.appendChild(empty);
      return;
    }
    runs.forEach((run) => {
      const row = document.createElement('div');
      row.className = 'project-run-row';
      const copy = document.createElement('div');
      copy.className = 'project-run-copy';
      const title = document.createElement('strong');
      title.textContent = run.task || i18n('dialog.project.untitledRun', 'Untitled agent task');
      const status = document.createElement('span');
      status.textContent = runStatusLabel(run.status) + (timeLabel(run.startedAt) ? ' · ' + timeLabel(run.startedAt) : '');
      copy.append(title, status);
      const open = document.createElement('button');
      open.type = 'button';
      open.className = 'workspace-row-action project-run-open';
      open.textContent = i18n('dialog.project.viewRun', 'View run');
      open.addEventListener('click', () => { void openAgentRunDetails(String(run.id)); });
      row.append(copy, open);
      current.appendChild(row);
    });
  } catch {
    const current = byId('projectRunHistory');
    if (current) current.textContent = i18n('dialog.project.runsFailed', 'Run history is unavailable right now.');
  }
}

function appendRunArtifacts(host: HTMLElement, artifacts: ProjectRunDetails['artifacts']): void {
  if (!Array.isArray(artifacts) || !artifacts.length) return;
  const title = document.createElement('strong');
  title.className = 'agent-run-details-section-title';
  title.textContent = i18n('dialog.project.artifacts', 'Created artifacts');
  const list = document.createElement('ul');
  list.className = 'agent-run-artifacts';
  artifacts.forEach((artifact) => {
    const item = document.createElement('li');
    item.textContent = artifact.name || artifact.id;
    list.appendChild(item);
  });
  host.append(title, list);
}

function appendRunEvents(host: HTMLElement, events: ProjectRunDetails['events']): void {
  if (!Array.isArray(events) || !events.length) return;
  const activity = document.createElement('details');
  activity.className = 'agent-run-details-activity';
  const title = document.createElement('summary');
  title.textContent = i18n('dialog.project.activity', 'Activity');
  const list = document.createElement('ol');
  events.slice(-40).forEach((event) => {
    const item = document.createElement('li');
    const payload = event.data || {};
    item.textContent = String(event.event || 'event') + (payload.command ? ': ' + payload.command : payload.delta ? ': ' + String(payload.delta).slice(0, 160) : '');
    list.appendChild(item);
  });
  activity.append(title, list);
  host.appendChild(activity);
}

function renderRunDetails(host: HTMLElement, result: ProjectRunDetails): void {
  host.replaceChildren();
  const run = result?.run;
  const summary = document.createElement('p');
  summary.className = 'agent-run-details-summary';
  summary.textContent = run?.summary || run?.error || i18n('dialog.project.noRunSummary', 'No summary was saved.');
  const status = document.createElement('div');
  status.className = 'agent-run-details-status';
  status.textContent = runStatusLabel(run?.status) + (timeLabel(run?.startedAt) ? ' · ' + timeLabel(run?.startedAt) : '');
  host.append(summary, status);
  appendRunArtifacts(host, result?.artifacts);
  appendRunEvents(host, result?.events);
}

async function openAgentRunDetails(runId: string): Promise<void> {
  const dialog = showWorkspaceDialogView(
    <AgentRunView
      title={i18n('dialog.project.runDetails', 'Agent run')}
      subtitle={i18n('dialog.project.runDetailsLoading', 'Loading the execution record…')}
    />,
  );
  try {
    const result = await api()<ProjectRunDetails>('/api/agent-runs/' + encodeURIComponent(runId));
    const host = dialog.querySelector<HTMLElement>('#agentRunDetails');
    if (!host) return;
    renderRunDetails(host, result);
  } catch (error) {
    const host = dialog.querySelector('#agentRunDetails');
    if (host) host.textContent = error instanceof Error ? error.message : i18n('dialog.project.runsFailed', 'Run history is unavailable right now.');
  }
}


type ScheduledTask = ReturnType<typeof useScheduledStore.getState>['tasks'][number];

function bindScheduledTaskForm(
  dialog: HTMLDivElement,
  task: ScheduledTask | null,
  editing: boolean,
  initialPrompt: string,
  activeProjectId: string,
): void {
  const form = dialog.querySelector<HTMLFormElement>('#taskForm');
  if (!form) return;
  const titleInput = form.elements.namedItem('title') as HTMLInputElement | null;
  const promptInput = form.elements.namedItem('prompt') as HTMLTextAreaElement | null;
  if (titleInput) titleInput.value = task?.title || initialPrompt.slice(0, 120);
  if (promptInput) promptInput.value = task?.prompt || initialPrompt;
  (form.elements.namedItem('frequency') as HTMLSelectElement).value = task?.frequency || 'once';
  const agentSelect = form.elements.namedItem('agentKind') as HTMLSelectElement;
  agentSelect.value = task?.agentKind || 'native';
  (form.elements.namedItem('projectId') as HTMLSelectElement).value = String(activeProjectId);
  void api()('/api/agent-runs/capabilities').then((capabilities) => {
    if (capabilities?.background === false) {
      const codex = agentSelect.querySelector<HTMLOptionElement>('option[value="codex"]');
      if (codex) codex.disabled = true;
      if (agentSelect.value === 'codex') agentSelect.value = 'native';
    }
  }).catch(() => undefined);
  dialog.querySelector('[data-action="delete-task"]')?.addEventListener('click', () => {
    if (task) void deleteScheduledTask(task.id, closeWorkspaceDialog);
  });
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const formData = new FormData(form);
    const body: Record<string, unknown> = Object.fromEntries(formData.entries());
    const nextRunAt = String(body.nextRunAt || '');
    if (nextRunAt) {
      const date = new Date(nextRunAt);
      body.nextRunAt = Number.isNaN(date.getTime()) ? null : date.toISOString();
    } else if (editing) body.nextRunAt = null;
    else delete body.nextRunAt;
    if (!body.projectId) body.projectId = null;
    try { await saveScheduledTask(task?.id || null, body); closeWorkspaceDialog(); }
    catch { /* service already reports the save failure */ }
  });
}

export async function openScheduledTaskForm(taskId?: string, initialPrompt = ''): Promise<void> {
  const task = taskId ? useScheduledStore.getState().tasks.find((item) => item.id === taskId) || null : null;
  const editing = Boolean(task);
  const projectOptions = getCachedProjects().map((project) => ({ id: String(project.id), name: String(project.name) }));
  const activeProjectId = task?.projectId || sessionStore.getState().currentProjectId || '';
  const dialog = showWorkspaceDialogView(
    <ScheduledTaskFormView task={task} editing={editing} projectOptions={projectOptions} />,
  );
  bindScheduledTaskForm(dialog, task, editing, initialPrompt, String(activeProjectId));
}

function connectorIcon(id: string): string {
  return getConnectorIconMarkupFn()?.(id) || `<span class="connector-logo-fallback" data-cicon="${escapeHtml(id)}" style="display:flex" aria-hidden="true">${escapeHtml(id.slice(0, 2).toUpperCase())}</span>`;
}

function credentialDialog(connector: NonNullable<ReturnType<typeof useWorkspaceStore.getState>['pluginsData'][number]>): void {
  const fields = connector.credentialInput?.fields || [];
  const dialog = showWorkspaceDialogView(
    <ConnectorCredentialsView
      name={connector.name}
      description={connector.description || ''}
      fields={fields.map((field) => ({
        key: String(field.key),
        label: String(field.label),
        type: field.type ? String(field.type) : undefined,
        required: Boolean(field.required),
        help: field.help ? String(field.help) : undefined,
      }))}
    />,
  );
  dialog.querySelector<HTMLFormElement>('#projectConnectorForm')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = event.currentTarget as HTMLFormElement;
    const submit = form.querySelector<HTMLButtonElement>('button[type="submit"]');
    if (submit) { submit.disabled = true; submit.textContent = 'Connecting…'; }
    const body: Record<string, unknown> = connector.authType === 'api_key'
      ? { apiKey: String(new FormData(form).get(fields[0]?.key || '') || '') }
      : { values: Object.fromEntries(new FormData(form).entries()) };
    try { await submitProjectPluginCredentials(connector.id, body); closeWorkspaceDialog(); }
    catch { if (submit) { submit.disabled = false; submit.textContent = 'Connect'; } }
  });
}

function manageConnectorDialog(connector: NonNullable<ReturnType<typeof useWorkspaceStore.getState>['pluginsData'][number]>): void {
  const connection = connector.connection;
  if (!connection) return;
  const status = connection.status || '';
  const account = connection.displayName || connection.connectionName || '';
  const updated = connection.updatedAt ? timeLabel(connection.updatedAt) : '';
  const error = connection.lastError ? String(connection.lastError) : '';
  const dialog = showWorkspaceDialogView(
    <ManageConnectorView
      name={connector.name}
      description={connector.description || ''}
      status={status}
      account={account}
      updated={updated}
      error={error}
    />,
  );
  dialog.querySelector('[data-action="refresh"]')?.addEventListener('click', async () => {
    closeWorkspaceDialog();
    try { await (await import('./workspace.service')).refreshProjectPlugin(connector.id); }
    finally { openProjectConnectorForm(connector.id); }
  });
  dialog.querySelector('[data-action="disconnect"]')?.addEventListener('click', () => { void disconnectProjectPlugin(connector.id, closeWorkspaceDialog); });
}

export function openProjectConnectorForm(id: string): void {
  const connector = useWorkspaceStore.getState().pluginsData.find((entry) => entry.id === id);
  if (!connector) { toast(i18n('toast.connectorNoForm', 'This connector is missing a credential form.')); return; }
  const connected = connector.connection?.status === 'connected' || connector.connection?.status === 'initiated';
  if (connector.credentialInput?.fields) { credentialDialog(connector); return; }
  if (connected) { manageConnectorDialog(connector); return; }
  toast(i18n('toast.connectorNoForm', 'This connector is missing a credential form.'));
}

export function openArxivSearch(): void {
  const dialog = showWorkspaceDialogView(<ArxivSearchView />);
  dialog.querySelector<HTMLFormElement>('#arxivSearchForm')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = event.currentTarget as HTMLFormElement;
    const list = dialog.querySelector<HTMLElement>('#arxivPapers');
    const query = String(new FormData(form).get('query') || '');
    if (list) list.innerHTML = `<div class="workspace-loading">${i18n('connectors.arxivSearching', 'Searching arXiv…')}</div>`;
    try {
      const result = await api()<{ papers?: PaperSummary[] }>('/api/connectors/arxiv/papers?query=' + encodeURIComponent(query));
      if (!list) return;
      const papers = Array.isArray(result?.papers) ? result.papers : [];
      list.innerHTML = papers.length ? papers.map((paper) => {
        const meta = [paper.authors?.join(', '), paper.publishedAt ? new Date(paper.publishedAt).getFullYear() : '', paper.categories?.slice(0, 2).join(', ')].filter(Boolean).join(' · ');
        const links = (paper.abstractUrl ? `<a class="workspace-row-action" href="${escapeHtml(paper.abstractUrl)}" target="_blank" rel="noopener noreferrer">Abstract</a>` : '') + (paper.pdfUrl ? `<a class="workspace-row-action" href="${escapeHtml(paper.pdfUrl)}" target="_blank" rel="noopener noreferrer">PDF</a>` : '');
        return `<div class="workspace-row arxiv-paper"><span class="workspace-row-icon connector-icon connector-arxiv">${connectorIcon('arxiv')}</span><div class="workspace-row-copy"><strong>${escapeHtml(paper.title || 'Untitled paper')}</strong><span>${escapeHtml(meta || 'arXiv preprint')}</span>${paper.summary ? `<p class="arxiv-summary">${escapeHtml(paper.summary)}</p>` : ''}</div><span class="connector-actions">${links}</span></div>`;
      }).join('') : `<div class="workspace-empty"><strong>${i18n('connectors.arxivNone', 'No matching papers')}</strong><span>${i18n('connectors.arxivNoneHint', 'Try another research topic or author.')}</span></div>`;
    } catch (error) {
      if (list) list.innerHTML = `<div class="workspace-empty"><strong>${i18n('connectors.arxivError', 'arXiv could not be searched')}</strong><span>${escapeHtml(error instanceof Error ? error.message : i18n('connectors.tryAgain', 'Try again shortly.'))}</span></div>`;
    }
  });
}

export function openZoteroLibrary(): void {
  const dialog = showWorkspaceDialogView(<ZoteroSearchView />);
  const load = async (query: string) => {
    const list = dialog.querySelector<HTMLElement>('#zoteroItems');
    if (list) list.innerHTML = `<div class="workspace-loading">${i18n('connectors.zoteroLoading', 'Loading references…')}</div>`;
    try {
      const result = await api()<{ items?: ReferenceSummary[] }>('/api/connectors/zotero/items?query=' + encodeURIComponent(query));
      if (!list) return;
      const items = Array.isArray(result?.items) ? result.items : [];
      list.innerHTML = items.length ? items.map((item) => {
        const details = [item.itemType, item.creators?.join(', '), item.date].filter(Boolean).join(' · ');
        return `<div class="workspace-row zotero-item"><span class="workspace-row-icon connector-icon connector-zotero">${connectorIcon('zotero')}</span><div class="workspace-row-copy"><strong>${escapeHtml(item.title || 'Untitled item')}</strong><span>${escapeHtml(details || 'Zotero item')}</span></div></div>`;
      }).join('') : `<div class="workspace-empty"><strong>${i18n('connectors.zoteroNone', 'No matching references')}</strong><span>${i18n('connectors.zoteroNoneHint', 'Try a title, author, or year.')}</span></div>`;
    } catch (error) {
      if (list) list.innerHTML = `<div class="workspace-empty"><strong>${i18n('connectors.zoteroError', 'References could not be loaded')}</strong><span>${escapeHtml(error instanceof Error ? error.message : i18n('connectors.zoteroRetryHint', 'Try reconnecting Zotero.'))}</span></div>`;
    }
  };
  dialog.querySelector<HTMLFormElement>('#zoteroSearchForm')?.addEventListener('submit', (event) => { event.preventDefault(); void load(String(new FormData(event.currentTarget as HTMLFormElement).get('query') || '')); });
  void load('');
}
