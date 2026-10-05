import { getApiFetch, getConnectorIconMarkupFn, getLegacyActions, i18n, setActiveProject, setNextProjectId } from '../../legacy/gateway.ts';
import { getCachedProjects } from '../../../projects/projectCache.ts';
import { stateStore } from '../../../state/store.js';
import { openLibraryDetail } from '../../../ui/libraryDetail.js';
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

type Api = (path: string, options?: Record<string, unknown>) => Promise<any>;

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

export function showWorkspaceDialog(markup: string, cardClass = ''): HTMLDivElement {
  const dialog = dialogHost();
  const extraClass = cardClass === 'library-file-preview-card' ? ` ${cardClass}` : '';
  dialog.innerHTML = `<div class="workspace-dialog-card${extraClass}">${markup}</div>`;
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
  dialog.innerHTML = '';
}

function dialogHeader(title: string, subtitle: string): string {
  return `<div class="workspace-dialog-title"><div><h2>${escapeHtml(title)}</h2><p>${escapeHtml(subtitle)}</p></div><button type="button" data-dialog-close aria-label="${i18n('dialog.close', 'Close')}">×</button></div>`;
}

export function openProjectForm(projectId: string | null = null): void {
  const project = projectId ? getCachedProjects().find((entry) => entry.id === projectId) || null : null;
  const editing = Boolean(project);
  const title = i18n(editing ? 'dialog.project.editTitle' : 'dialog.project.newTitle', editing ? 'Edit project' : 'New project');
  const markup = `${dialogHeader(title, i18n('dialog.project.subtitle', 'Give this work a home and a clear instruction.'))}
    <form id="projectForm" class="workspace-form">
      <label class="workspace-field"><span>${i18n('dialog.field.name', 'Name')}</span><input name="name" maxlength="80" required value="${escapeHtml(project?.name)}" placeholder="${i18n('dialog.project.namePh', 'Research, writing, a course…')}"></label>
      <label class="workspace-field"><span>${i18n('dialog.field.description', 'Description')} <em>${i18n('dialog.optional', 'Optional')}</em></span><input name="description" maxlength="180" value="${escapeHtml(project?.description)}" placeholder="${i18n('dialog.project.descPh', 'What are you working toward?')}"></label>
      <label class="workspace-field"><span>${i18n('dialog.field.instructions', 'Instructions')} <em>${i18n('dialog.optional', 'Optional')}</em></span><textarea name="systemPrompt" rows="3" placeholder="${i18n('dialog.project.instrPh', 'How should Socrates approach work in this project?')}">${escapeHtml(project?.systemPrompt)}</textarea></label>
      <label class="workspace-field"><span>${i18n('dialog.field.color', 'Color')}</span><input name="color" type="color" value="${escapeHtml(project?.color || '#c69a2d')}"></label>
      <div class="workspace-dialog-actions">${editing ? `<button type="button" class="workspace-danger" data-action="delete-project">${i18n('common.delete', 'Delete')}</button>` : '<span></span>'}<span></span><button type="button" class="workspace-secondary" data-dialog-close>${i18n('common.cancel', 'Cancel')}</button><button class="workspace-primary" type="submit">${i18n(editing ? 'dialog.project.save' : 'projects.create', editing ? 'Save changes' : 'Create project')}</button></div>
    </form>`;
  const dialog = showWorkspaceDialog(markup);
  const form = dialog.querySelector<HTMLFormElement>('#projectForm');
  form?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(form).entries());
    try {
      await saveProjectRecord(project?.id || null, data);
      closeWorkspaceDialog();
    } catch { /* service already reports the save failure */ }
  });
  if (editing && project) {
    dialog.querySelector('[data-action="delete-project"]')?.addEventListener('click', async () => {
      const accepted = await confirmAction(i18n('confirm.deleteProject.title', 'Delete this project?'), i18n('confirm.deleteProject.msg', "This permanently deletes the project's chats, files, artifacts, and memories. This cannot be undone."));
      if (!accepted) return;
      await deleteProjectRecord(project.id);
      closeWorkspaceDialog();
      void getLegacyActions().sessions.flushRecentsReconcile();
    });
  }
}

export function openLibraryItem(id: string, _kind: string, collection?: string): void {
  const file = getWorkspaceLibraryItem(id, 'files');
  const artifact = getWorkspaceLibraryItem(id, 'artifacts');
  if (collection === 'artifacts' || (!collection && !file && artifact)) {
    if (!artifact) return;
    openLibraryDetail(
      artifact.title || artifact.name || i18n('library.untitled', 'Untitled'),
      i18n('library.preview.artifactSource', 'Created item source'),
      `<pre class="library-file-preview-text library-artifact-source">${escapeHtml(artifact.source || '')}</pre>`,
      i18n('dialog.close', 'Close'),
    );
    return;
  }
  if (!file) {
    toast(i18n('toast.fileOpenFailed', 'Could not open this file.'));
    return;
  }

  const name = file.name || i18n('library.untitled', 'Untitled');
  const mime = String(file.mimeType || '').toLowerCase();
  const rawUrl = '/api/v2/files/' + encodeURIComponent(file.id) + '/raw?inline=1';
  const isMedia = mime.startsWith('image/') || mime === 'application/pdf' || mime.startsWith('video/') || mime.startsWith('audio/');
  let body: string;
  if (mime.startsWith('image/')) {
    body = `<div class="library-file-preview-media"><img src="${escapeHtml(rawUrl)}" alt="${escapeHtml(name)}" /></div>`;
  } else if (mime === 'application/pdf') {
    body = `<iframe class="library-file-preview-frame" src="${escapeHtml(rawUrl)}" title="${escapeHtml(name)}"></iframe>`;
  } else if (mime.startsWith('video/')) {
    body = `<div class="library-file-preview-media"><video controls preload="metadata" src="${escapeHtml(rawUrl)}"></video></div>`;
  } else if (mime.startsWith('audio/')) {
    body = `<div class="library-file-preview-audio"><audio controls preload="metadata" src="${escapeHtml(rawUrl)}"></audio></div>`;
  } else {
    body = '<div id="libraryFilePreviewBody" class="library-file-preview-loading">' + i18n('library.preview.loading', 'Loading file content…') + '</div>';
  }

  openLibraryDetail(name, mime || i18n('library.preview.file', 'File'), body, i18n('dialog.close', 'Close'));
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
  const dialog = showWorkspaceDialog(`${dialogHeader(String(project.name), String(project.description || i18n('dialog.project.defaultDesc', 'A focused place for related work.')))}
    <div class="project-workspace-actions"><button type="button" class="workspace-primary" data-action="new-chat">${i18n('dialog.project.newChat', 'New chat in project')}</button><button type="button" class="workspace-secondary" data-action="move-chat">${i18n('dialog.project.moveCurrent', 'Move current chat here')}</button></div>
    <p class="workspace-note">${i18n('dialog.project.note', 'Project instructions are saved with this project. Files and chats remain available as shared context for future work.')}</p><div id="projectRunHistory" class="project-run-history"></div>`);
  dialog.querySelector('[data-action="new-chat"]')?.addEventListener('click', async () => {
    setNextProjectId(projectId);
    setActiveProject(project);
    closeWorkspaceDialog();
    await getLegacyActions().navigation.resetApp();
  });
  dialog.querySelector('[data-action="move-chat"]')?.addEventListener('click', async () => {
    stateStore.dispatch({ type: 'state/set', key: 'currentProjectId', value: projectId });
    setActiveProject(project);
    const sessionId = stateStore.read('currentSessionId') as string | null;
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
    const result = await api()('/api/agent-runs?projectId=' + encodeURIComponent(projectId) + '&limit=8');
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
    runs.forEach((run: any) => {
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

async function openAgentRunDetails(runId: string): Promise<void> {
  const dialog = showWorkspaceDialog(`${dialogHeader(i18n('dialog.project.runDetails', 'Agent run'), i18n('dialog.project.runDetailsLoading', 'Loading the execution record…'))}<div id="agentRunDetails" class="agent-run-details"><div class="workspace-loading">${escapeHtml(i18n('dialog.project.runsLoading', 'Loading agent runs…'))}</div></div>`);
  try {
    const result = await api()('/api/agent-runs/' + encodeURIComponent(runId));
    const host = dialog.querySelector<HTMLElement>('#agentRunDetails');
    if (!host) return;
    host.replaceChildren();
    const run = result?.run || {};
    const summary = document.createElement('p');
    summary.className = 'agent-run-details-summary';
    summary.textContent = run.summary || run.error || i18n('dialog.project.noRunSummary', 'No summary was saved.');
    const status = document.createElement('div');
    status.className = 'agent-run-details-status';
    status.textContent = runStatusLabel(run.status) + (timeLabel(run.startedAt) ? ' · ' + timeLabel(run.startedAt) : '');
    host.append(summary, status);
    if (Array.isArray(result?.artifacts) && result.artifacts.length) {
      const title = document.createElement('strong');
      title.className = 'agent-run-details-section-title';
      title.textContent = i18n('dialog.project.artifacts', 'Created artifacts');
      const list = document.createElement('ul');
      list.className = 'agent-run-artifacts';
      result.artifacts.forEach((artifact: any) => { const item = document.createElement('li'); item.textContent = artifact.name || artifact.id; list.appendChild(item); });
      host.append(title, list);
    }
    if (Array.isArray(result?.events) && result.events.length) {
      const activity = document.createElement('details');
      activity.className = 'agent-run-details-activity';
      const title = document.createElement('summary');
      title.textContent = i18n('dialog.project.activity', 'Activity');
      const list = document.createElement('ol');
      result.events.slice(-40).forEach((event: any) => {
        const item = document.createElement('li');
        const payload = event.data || {};
        item.textContent = String(event.event || 'event') + (payload.command ? ': ' + payload.command : payload.delta ? ': ' + String(payload.delta).slice(0, 160) : '');
        list.appendChild(item);
      });
      activity.append(title, list);
      host.appendChild(activity);
    }
  } catch (error) {
    const host = dialog.querySelector('#agentRunDetails');
    if (host) host.textContent = error instanceof Error ? error.message : i18n('dialog.project.runsFailed', 'Run history is unavailable right now.');
  }
}

export async function openScheduledTaskForm(taskId?: string, initialPrompt = ''): Promise<void> {
  const task = taskId ? useScheduledStore.getState().tasks.find((item) => item.id === taskId) || null : null;
  const editing = Boolean(task);
  const toLocalDateTime = (value: string | null): string => {
    if (!value) return '';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    const part = (value: number) => String(value).padStart(2, '0');
    return `${date.getFullYear()}-${part(date.getMonth() + 1)}-${part(date.getDate())}T${part(date.getHours())}:${part(date.getMinutes())}`;
  };
  const projectOptions = getCachedProjects().map((project) => `<option value="${escapeHtml(project.id)}">${escapeHtml(project.name)}</option>`).join('');
  const activeProjectId = task?.projectId || stateStore.read('currentProjectId') || '';
  const markup = `${dialogHeader(i18n(editing ? 'dialog.task.editTitle' : 'dialog.task.newTitle', editing ? 'Edit task' : 'Schedule a task'), i18n('dialog.task.subtitle', 'Choose what should run and when to check back.'))}
    <form id="taskForm" class="workspace-form">
      <label class="workspace-field"><span>${i18n('dialog.task.field', 'Task')}</span><input name="title" maxlength="120" required value="${escapeHtml(task?.title)}" placeholder="${i18n('dialog.task.titlePh', 'Send me a weekly study plan')}"></label>
      <label class="workspace-field"><span>${i18n('dialog.task.prompt', 'Prompt')}</span><textarea name="prompt" rows="3" placeholder="${i18n('dialog.task.promptPh', 'What should Socrates do when this task runs?')}">${escapeHtml(task?.prompt)}</textarea></label>
      <div class="workspace-form-grid"><label class="workspace-field"><span>${i18n('dialog.task.agent', 'Agent')}</span><select name="agentKind"><option value="native">${i18n('dialog.task.nativeAgent', 'Socrates · native tools')}</option><option value="codex">${i18n('dialog.task.codexAgent', 'Pi Agent · project workspace')}</option></select></label><label class="workspace-field"><span>${i18n('dialog.task.project', 'Project')}</span><select name="projectId"><option value="">${i18n('dialog.task.noProject', 'No project')}</option>${projectOptions}</select></label></div>
      <div class="workspace-form-grid"><label class="workspace-field"><span>${i18n('dialog.task.repeat', 'Repeat')}</span><select name="frequency"><option value="once">${i18n('scheduled.freq.once', 'Once')}</option><option value="daily">${i18n('scheduled.freq.daily', 'Daily')}</option><option value="weekly">${i18n('scheduled.freq.weekly', 'Weekly')}</option><option value="monthly">${i18n('scheduled.freq.monthly', 'Monthly')}</option></select></label><label class="workspace-field"><span>${i18n('dialog.task.firstRun', 'First run')}</span><input name="nextRunAt" type="datetime-local" value="${escapeHtml(toLocalDateTime(task?.nextRunAt || null))}"></label></div>
      <p class="workspace-note">${i18n('dialog.task.codexNote', 'Pi Agent scheduled runs work inside the selected project workspace with server-enforced disk limits.')}</p>
      <div class="workspace-dialog-actions">${editing ? `<button type="button" class="workspace-danger" data-action="delete-task">${i18n('common.delete', 'Delete')}</button>` : '<span></span>'}<span></span><button type="button" class="workspace-secondary" data-dialog-close>${i18n('common.cancel', 'Cancel')}</button><button class="workspace-primary" type="submit">${i18n(editing ? 'dialog.task.save' : 'scheduled.createTask', editing ? 'Save task' : 'Create task')}</button></div>
    </form>`;
  const dialog = showWorkspaceDialog(markup);
  const form = dialog.querySelector<HTMLFormElement>('#taskForm');
  if (!form) return;
  form.elements.namedItem('title') && ((form.elements.namedItem('title') as HTMLInputElement).value = task?.title || initialPrompt.slice(0, 120));
  form.elements.namedItem('prompt') && ((form.elements.namedItem('prompt') as HTMLTextAreaElement).value = task?.prompt || initialPrompt);
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

function connectorIcon(id: string): string {
  return getConnectorIconMarkupFn()?.(id) || `<span class="connector-logo-fallback" data-cicon="${escapeHtml(id)}" style="display:flex" aria-hidden="true">${escapeHtml(id.slice(0, 2).toUpperCase())}</span>`;
}

function credentialDialog(connector: NonNullable<ReturnType<typeof useWorkspaceStore.getState>['pluginsData'][number]>): void {
  const fields = connector.credentialInput?.fields || [];
  const fieldsHtml = fields.map((field) => `<label class="workspace-field"><span>${escapeHtml(field.label)}</span><input name="${escapeHtml(field.key)}" type="${escapeHtml(field.type || 'text')}"${field.required ? ' required' : ''} autocomplete="off" spellcheck="false"></label>${field.help ? `<p class="workspace-note">${escapeHtml(field.help)}</p>` : ''}`).join('');
  const dialog = showWorkspaceDialog(`${dialogHeader(`Connect ${connector.name}`, connector.description || '')}<form id="projectConnectorForm" class="workspace-form">${fieldsHtml}<div class="workspace-dialog-actions"><span></span><button type="button" class="workspace-secondary" data-dialog-close>${i18n('common.cancel', 'Cancel')}</button><button class="workspace-primary" type="submit">Connect</button></div></form>`);
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
  const error = connection.lastError
    ? `<p class="workspace-note">${escapeHtml(i18n('plugins.manageDialog.error', 'Last error'))}: ${escapeHtml(connection.lastError)}</p>`
    : '';
  const dialog = showWorkspaceDialog(`${dialogHeader(`${i18n('plugins.manage', 'Manage')} ${connector.name}`, connector.description || '')}<div class="workspace-form">
    <label class="workspace-field"><span>${i18n('plugins.manageDialog.status', 'Status')}</span><input readonly value="${escapeHtml(status + (account ? ' · ' + account : ''))}"></label>
    <label class="workspace-field"><span>${i18n('plugins.manageDialog.account', 'Account')}</span><input readonly value="${escapeHtml(account || '—')}"></label>
    ${updated ? `<label class="workspace-field"><span>${i18n('plugins.manageDialog.updated', 'Updated')}</span><input readonly value="${escapeHtml(updated)}"></label>` : ''}
    ${error}
    <div class="workspace-dialog-actions"><span></span><button type="button" class="workspace-secondary" data-action="refresh">${i18n('plugins.manageDialog.refresh', 'Refresh')}</button><button type="button" class="workspace-danger" data-action="disconnect">${i18n('plugins.manageDialog.disconnect', 'Disconnect')}</button><button type="button" class="workspace-secondary" data-dialog-close>${i18n('common.cancel', 'Cancel')}</button></div>
  </div>`);
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
  const dialog = showWorkspaceDialog(`${dialogHeader(i18n('connectors.arxivTitle', 'Search arXiv'), i18n('connectors.arxivSubtitle', 'Explore public research preprints. No account connection is needed.'))}<form id="arxivSearchForm" class="workspace-form"><div class="workspace-form-grid"><label class="workspace-field"><span>${i18n('connectors.researchTopic', 'Research topic')}</span><input name="query" maxlength="200" minlength="2" autocomplete="off" required placeholder="e.g. retrieval augmented generation"></label><div class="workspace-field"><span>&nbsp;</span><button class="workspace-primary" type="submit">${i18n('connectors.search', 'Search')}</button></div></div></form><div id="arxivPapers" class="marketplace-list"><div class="workspace-empty"><strong>${i18n('connectors.arxivEmptyTitle', 'Find a paper')}</strong><span>${i18n('connectors.arxivEmptyHint', 'Search by topic, method, author, or year.')}</span></div></div>`);
  dialog.querySelector<HTMLFormElement>('#arxivSearchForm')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = event.currentTarget as HTMLFormElement;
    const list = dialog.querySelector<HTMLElement>('#arxivPapers');
    const query = String(new FormData(form).get('query') || '');
    if (list) list.innerHTML = `<div class="workspace-loading">${i18n('connectors.arxivSearching', 'Searching arXiv…')}</div>`;
    try {
      const result = await api()('/api/connectors/arxiv/papers?query=' + encodeURIComponent(query));
      if (!list) return;
      const papers = Array.isArray(result?.papers) ? result.papers : [];
      list.innerHTML = papers.length ? papers.map((paper: any) => {
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
  const dialog = showWorkspaceDialog(`${dialogHeader(i18n('connectors.zoteroTitle', 'Zotero library'), i18n('connectors.zoteroSubtitle', 'Search the references connected to this account.'))}<form id="zoteroSearchForm" class="workspace-form"><div class="workspace-form-grid"><label class="workspace-field"><span>${i18n('connectors.search', 'Search')}</span><input name="query" maxlength="200" autocomplete="off" placeholder="${i18n('connectors.zoteroSearchPh', 'Title, author, or year')}"></label><div class="workspace-field"><span>&nbsp;</span><button class="workspace-primary" type="submit">${i18n('connectors.search', 'Search')}</button></div></div></form><div id="zoteroItems" class="marketplace-list"><div class="workspace-loading">${i18n('connectors.zoteroLoading', 'Loading references…')}</div></div>`);
  const load = async (query: string) => {
    const list = dialog.querySelector<HTMLElement>('#zoteroItems');
    if (list) list.innerHTML = `<div class="workspace-loading">${i18n('connectors.zoteroLoading', 'Loading references…')}</div>`;
    try {
      const result = await api()('/api/connectors/zotero/items?query=' + encodeURIComponent(query));
      if (!list) return;
      const items = Array.isArray(result?.items) ? result.items : [];
      list.innerHTML = items.length ? items.map((item: any) => {
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
