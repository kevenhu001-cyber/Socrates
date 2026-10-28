import { Fragment, type ReactNode } from 'react';
import { i18n } from '../../legacy/gateway.ts';
import { getCachedProjects } from '../../../projects/projectCache.ts';
import { Button } from '../../ui/shadcn/button';
import { Input } from '../../ui/shadcn/input';
import { Label } from '../../ui/shadcn/label';
import { NativeSelect, NativeSelectOption } from '../../ui/shadcn/native-select';
import { Textarea } from '../../ui/shadcn/textarea';

/**
 * The workspace dialogs' form surface. The binders in `workspace.dialogs.ts`
 * read `#projectForm` / `#taskForm` and submit real `FormData`, so these views
 * keep the ids, names and native form semantics; only the controls are React
 * and shadcn. Geometry still comes from the `.workspace-*` rules so the phone
 * overrides keep working.
 */

type CachedProject = ReturnType<typeof getCachedProjects>[number];

function DialogHeader({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div className="workspace-dialog-title">
      <div><h2>{title}</h2><p>{subtitle}</p></div>
      <Button type="button" variant="ghost" size="icon-xs" data-dialog-close aria-label={i18n('dialog.close', 'Close')}>×</Button>
    </div>
  );
}

function Field({ label, hint, wide = false, children }: { label: ReactNode; hint?: ReactNode; wide?: boolean; children: ReactNode }) {
  return (
    <Label
      className={`workspace-field flex flex-col items-stretch gap-1.5 text-sm font-medium${wide ? ' [&_[data-slot=native-select-wrapper]]:w-full' : ''}`}
    >
      <span>{label}{hint ? <em>{hint}</em> : null}</span>
      {children}
    </Label>
  );
}

function DialogActions({ children }: { children: ReactNode }) {
  return <div className="workspace-dialog-actions">{children}</div>;
}

export function ProjectFormView({ project, title }: { project: CachedProject | null; title: string }) {
  const editing = Boolean(project);
  return (
    <>
      <DialogHeader title={title} subtitle={i18n('dialog.project.subtitle', 'Give this work a home and a clear instruction.')} />
      <form id="projectForm" className="workspace-form">
        <Field label={i18n('dialog.field.name', 'Name')}>
          <Input name="name" maxLength={80} required defaultValue={String(project?.name ?? '')} placeholder={i18n('dialog.project.namePh', 'Research, writing, a course…')} />
        </Field>
        <Field label={i18n('dialog.field.description', 'Description')} hint={i18n('dialog.optional', 'Optional')}>
          <Input name="description" maxLength={180} defaultValue={String(project?.description ?? '')} placeholder={i18n('dialog.project.descPh', 'What are you working toward?')} />
        </Field>
        <Field label={i18n('dialog.field.instructions', 'Instructions')} hint={i18n('dialog.optional', 'Optional')}>
          <Textarea name="systemPrompt" rows={3} defaultValue={String(project?.systemPrompt ?? '')} placeholder={i18n('dialog.project.instrPh', 'How should Socrates approach work in this project?')} />
        </Field>
        <Field label={i18n('dialog.field.color', 'Color')}>
          <Input name="color" type="color" defaultValue={String(project?.color || '#c69a2d')} />
        </Field>
        <DialogActions>
          {editing ? (
            <Button type="button" variant="destructive" className="workspace-danger" data-action="delete-project">
              {i18n('common.delete', 'Delete')}
            </Button>
          ) : <span />}
          <span />
          <Button type="button" variant="outline" className="workspace-secondary" data-dialog-close>
            {i18n('common.cancel', 'Cancel')}
          </Button>
          <Button type="submit" className="workspace-primary">
            {i18n(editing ? 'dialog.project.save' : 'projects.create', editing ? 'Save changes' : 'Create project')}
          </Button>
        </DialogActions>
      </form>
    </>
  );
}

function TaskFormActions({ editing }: { editing: boolean }) {
  return (
    <DialogActions>
      {editing ? (
        <Button type="button" variant="destructive" className="workspace-danger" data-action="delete-task">
          {i18n('common.delete', 'Delete')}
        </Button>
      ) : <span />}
      <span />
      <Button type="button" variant="outline" className="workspace-secondary" data-dialog-close>
        {i18n('common.cancel', 'Cancel')}
      </Button>
      <Button type="submit" className="workspace-primary">
        {i18n(editing ? 'dialog.task.save' : 'scheduled.createTask', editing ? 'Save task' : 'Create task')}
      </Button>
    </DialogActions>
  );
}

export function ScheduledTaskFormView({
  task,
  editing,
  projectOptions,
}: {
  task: { title?: string | null; prompt?: string | null; agentKind?: string | null; projectId?: string | null; frequency?: string | null; nextRunAt?: string | number | null } | null;
  editing: boolean;
  projectOptions: Array<{ id: string; name: string }>;
}) {
  return (
    <>
      <DialogHeader
        title={i18n(editing ? 'dialog.task.editTitle' : 'dialog.task.newTitle', editing ? 'Edit task' : 'Schedule a task')}
        subtitle={i18n('dialog.task.subtitle', 'Choose what should run and when to check back.')}
      />
      <form id="taskForm" className="workspace-form">
        <Field label={i18n('dialog.task.field', 'Task')}>
          <Input name="title" maxLength={120} required defaultValue={task?.title ?? ''} placeholder={i18n('dialog.task.titlePh', 'Send me a weekly study plan')} />
        </Field>
        <Field label={i18n('dialog.task.prompt', 'Prompt')}>
          <Textarea name="prompt" rows={3} defaultValue={task?.prompt ?? ''} placeholder={i18n('dialog.task.promptPh', 'What should Socrates do when this task runs?')} />
        </Field>
        <div className="workspace-form-grid">
          <Field label={i18n('dialog.task.agent', 'Agent')} wide>
            <NativeSelect name="agentKind" defaultValue={task?.agentKind || 'native'}>
              <NativeSelectOption value="native">{i18n('dialog.task.nativeAgent', 'Socrates · native tools')}</NativeSelectOption>
              <NativeSelectOption value="codex">{i18n('dialog.task.codexAgent', 'Pi Agent · project workspace')}</NativeSelectOption>
            </NativeSelect>
          </Field>
          <Field label={i18n('dialog.task.project', 'Project')} wide>
            <NativeSelect name="projectId" defaultValue={task?.projectId || ''}>
              <NativeSelectOption value="">{i18n('dialog.task.noProject', 'No project')}</NativeSelectOption>
              {projectOptions.map((project) => (
                <NativeSelectOption key={project.id} value={project.id}>{project.name}</NativeSelectOption>
              ))}
            </NativeSelect>
          </Field>
        </div>
        <div className="workspace-form-grid">
          <Field label={i18n('dialog.task.repeat', 'Repeat')} wide>
            <NativeSelect name="frequency" defaultValue={task?.frequency || 'once'}>
              <NativeSelectOption value="once">{i18n('scheduled.freq.once', 'Once')}</NativeSelectOption>
              <NativeSelectOption value="daily">{i18n('scheduled.freq.daily', 'Daily')}</NativeSelectOption>
              <NativeSelectOption value="weekly">{i18n('scheduled.freq.weekly', 'Weekly')}</NativeSelectOption>
              <NativeSelectOption value="monthly">{i18n('scheduled.freq.monthly', 'Monthly')}</NativeSelectOption>
            </NativeSelect>
          </Field>
          <Field label={i18n('dialog.task.firstRun', 'First run')}>
            <Input name="nextRunAt" type="datetime-local" defaultValue={dateTimeLocalValue(task?.nextRunAt || null)} />
          </Field>
        </div>
        <p className="workspace-note">{i18n('dialog.task.codexNote', 'Pi Agent scheduled runs work inside the selected project workspace with server-enforced disk limits.')}</p>
        <TaskFormActions editing={editing} />
      </form>
    </>
  );
}

function dateTimeLocalValue(value: string | number | null): string {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const part = (number: number) => String(number).padStart(2, '0');
  return `${date.getFullYear()}-${part(date.getMonth() + 1)}-${part(date.getDate())}T${part(date.getHours())}:${part(date.getMinutes())}`;
}

export function ProjectWorkspaceView({ name, description }: { name: string; description: string }) {
  return (
    <>
      <DialogHeader title={name} subtitle={description} />
      <div className="project-workspace-actions">
        <Button type="button" className="workspace-primary" data-action="new-chat">
          {i18n('dialog.project.newChat', 'New chat in project')}
        </Button>
        <Button type="button" variant="outline" className="workspace-secondary" data-action="move-chat">
          {i18n('dialog.project.moveCurrent', 'Move current chat here')}
        </Button>
      </div>
      <p className="workspace-note">{i18n('dialog.project.note', 'Project instructions are saved with this project. Files and chats remain available as shared context for future work.')}</p>
      <div id="projectRunHistory" className="project-run-history" />
    </>
  );
}

export function AgentRunView({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <>
      <DialogHeader title={title} subtitle={subtitle} />
      <div id="agentRunDetails" className="agent-run-details">
        <div className="workspace-loading">{i18n('dialog.project.runsLoading', 'Loading agent runs…')}</div>
      </div>
    </>
  );
}

export function ConnectorCredentialsView({
  name,
  description,
  fields,
}: {
  name: string;
  description: string;
  fields: Array<{ key: string; label: string; type?: string; required?: boolean; help?: string }>;
}) {
  return (
    <>
      <DialogHeader title={`Connect ${name}`} subtitle={description} />
      <form id="projectConnectorForm" className="workspace-form">
        {fields.map((field) => (
          <Fragment key={field.key}>
            <Field label={field.label}>
              <Input
                name={field.key}
                type={field.type || 'text'}
                required={field.required}
                autoComplete="off"
                spellCheck={false}
              />
            </Field>
            {field.help ? <p className="workspace-note">{field.help}</p> : null}
          </Fragment>
        ))}
        <DialogActions>
          <span />
          <Button type="button" variant="outline" className="workspace-secondary" data-dialog-close>
            {i18n('common.cancel', 'Cancel')}
          </Button>
          <Button type="submit" className="workspace-primary">Connect</Button>
        </DialogActions>
      </form>
    </>
  );
}

export function ManageConnectorView({
  name,
  description,
  status,
  account,
  updated,
  error,
}: {
  name: string;
  description: string;
  status: string;
  account: string;
  updated: string;
  error: string;
}) {
  return (
    <>
      <DialogHeader title={`${i18n('plugins.manage', 'Manage')} ${name}`} subtitle={description} />
      <div className="workspace-form">
        <Field label={i18n('plugins.manageDialog.status', 'Status')}>
          <Input readOnly defaultValue={status + (account ? ' · ' + account : '')} />
        </Field>
        <Field label={i18n('plugins.manageDialog.account', 'Account')}>
          <Input readOnly defaultValue={account || '—'} />
        </Field>
        {updated ? (
          <Field label={i18n('plugins.manageDialog.updated', 'Updated')}>
            <Input readOnly defaultValue={updated} />
          </Field>
        ) : null}
        {error ? <p className="workspace-note">{`${i18n('plugins.manageDialog.error', 'Last error')}: ${error}`}</p> : null}
        <DialogActions>
          <span />
          <Button type="button" variant="outline" className="workspace-secondary" data-action="refresh">
            {i18n('plugins.manageDialog.refresh', 'Refresh')}
          </Button>
          <Button type="button" variant="destructive" className="workspace-danger" data-action="disconnect">
            {i18n('plugins.manageDialog.disconnect', 'Disconnect')}
          </Button>
          <Button type="button" variant="outline" className="workspace-secondary" data-dialog-close>
            {i18n('common.cancel', 'Cancel')}
          </Button>
        </DialogActions>
      </div>
    </>
  );
}

export function ArxivSearchView() {
  return (
    <>
      <DialogHeader
        title={i18n('connectors.arxivTitle', 'Search arXiv')}
        subtitle={i18n('connectors.arxivSubtitle', 'Explore public research preprints. No account connection is needed.')}
      />
      <form id="arxivSearchForm" className="workspace-form">
        <div className="workspace-form-grid">
          <Field label={i18n('connectors.researchTopic', 'Research topic')}>
            <Input name="query" maxLength={200} minLength={2} autoComplete="off" required placeholder="e.g. retrieval augmented generation" />
          </Field>
          <div className="workspace-field">
            <span>&nbsp;</span>
            <Button type="submit" className="workspace-primary">{i18n('connectors.search', 'Search')}</Button>
          </div>
        </div>
      </form>
      <div id="arxivPapers" className="marketplace-list">
        <div className="workspace-empty">
          <strong>{i18n('connectors.arxivEmptyTitle', 'Find a paper')}</strong>
          <span>{i18n('connectors.arxivEmptyHint', 'Search by topic, method, author, or year.')}</span>
        </div>
      </div>
    </>
  );
}

export function ZoteroSearchView() {
  return (
    <>
      <DialogHeader
        title={i18n('connectors.zoteroTitle', 'Zotero library')}
        subtitle={i18n('connectors.zoteroSubtitle', 'Search the references connected to this account.')}
      />
      <form id="zoteroSearchForm" className="workspace-form">
        <div className="workspace-form-grid">
          <Field label={i18n('connectors.search', 'Search')}>
            <Input name="query" maxLength={200} autoComplete="off" placeholder={i18n('connectors.zoteroSearchPh', 'Title, author, or year')} />
          </Field>
          <div className="workspace-field">
            <span>&nbsp;</span>
            <Button type="submit" className="workspace-primary">{i18n('connectors.search', 'Search')}</Button>
          </div>
        </div>
      </form>
      <div id="zoteroItems" className="marketplace-list">
        <div className="workspace-loading">{i18n('connectors.zoteroLoading', 'Loading references…')}</div>
      </div>
    </>
  );
}
