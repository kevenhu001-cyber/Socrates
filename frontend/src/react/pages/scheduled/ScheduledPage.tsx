import { createRoot, type Root } from 'react-dom/client';
import { useMemo, useState, type ReactNode } from 'react';

import { t as _t } from '../../legacy/gateway.ts';
import { useScheduledStore } from './scheduled.store';
import { openScheduledTaskForm } from '../workspace/workspace.dialogs';
import { deleteScheduledTask, runScheduledTask, toggleScheduledTask } from './scheduled.service';

const PANEL_ID = 'scheduledPanel';

/* Hand-drawn stroke icons for the suggestion templates — same 24px grid,
   1.8 stroke, round caps as the other scheduled-page glyphs. No emoji:
   color glyphs render inconsistently across platforms and break the
   monochrome icon language. */
function TemplateIcon({ children }: { children: ReactNode }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {children}
    </svg>
  );
}

function SunIcon() {
  return (
    <TemplateIcon>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2.5v2.5M12 19v2.5M2.5 12H5M19 12h2.5M5.2 5.2l1.7 1.7M17.1 17.1l1.7 1.7M18.8 5.2l-1.7 1.7M6.9 17.1l-1.7 1.7" />
    </TemplateIcon>
  );
}

function InboxIcon() {
  return (
    <TemplateIcon>
      <path d="M22 12h-6l-2 3h-4l-2-3H2" />
      <path d="M5.5 5.1 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.5-6.9A2 2 0 0 0 16.7 4H7.3a2 2 0 0 0-1.8 1.1z" />
    </TemplateIcon>
  );
}

function SearchIcon() {
  return (
    <TemplateIcon>
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
    </TemplateIcon>
  );
}

function RobotIcon() {
  return (
    <TemplateIcon>
      <path d="M12 2.5V5" />
      <rect x="5" y="7" width="14" height="11" rx="3.5" />
      <path d="M9.5 11.5v2M14.5 11.5v2M10 15.5h4" />
      <path d="M2.8 10.5v3M21.2 10.5v3" />
    </TemplateIcon>
  );
}

function LaptopIcon() {
  return (
    <TemplateIcon>
      <rect x="4" y="4" width="16" height="11" rx="2" />
      <path d="M7.5 8h5M7.5 11h8" />
      <path d="M2.5 19h19" />
    </TemplateIcon>
  );
}

const RECOMMENDATIONS: ReadonlyArray<{
  icon: ReactNode;
  titleKey: string;
  titleFallback: string;
  descriptionKey: string;
  descriptionFallback: string;
  prompt: string;
}> = [
  { icon: <SunIcon />, titleKey: 'scheduled.template.daily', titleFallback: 'Daily briefing', descriptionKey: 'scheduled.template.dailyDesc', descriptionFallback: 'Summarize the updates I care about each morning.', prompt: 'Send me a concise daily briefing with the latest updates on my saved topics.' },
  { icon: <InboxIcon />, titleKey: 'scheduled.template.inbox', titleFallback: 'Inbox check', descriptionKey: 'scheduled.template.inboxDesc', descriptionFallback: 'Surface messages that need my attention.', prompt: 'Check my inbox and tell me which messages need a reply or follow-up.' },
  { icon: <SearchIcon />, titleKey: 'scheduled.template.research', titleFallback: 'Weekly research pulse', descriptionKey: 'scheduled.template.researchDesc', descriptionFallback: 'Compare the latest work in a topic I follow.', prompt: 'Give me a weekly research briefing comparing the latest work on my chosen topic.' },
  { icon: <RobotIcon />, titleKey: 'scheduled.template.digest', titleFallback: 'AI research digest', descriptionKey: 'scheduled.template.digestDesc', descriptionFallback: 'Send the best new work every Friday.', prompt: 'Give me the best new AI research every Friday with a short explanation of why it matters.' },
  { icon: <LaptopIcon />, titleKey: 'scheduled.template.project', titleFallback: 'Project status', descriptionKey: 'scheduled.template.projectDesc', descriptionFallback: 'Keep me posted on progress and blockers.', prompt: 'Give me a weekly progress brief on my active project and its next milestone.' },
];

function i18n(key: string, fallback: string): string {
  const v = _t(key);
  return v !== key ? v : fallback;
}

function formatTime(value: string | null): string {
  if (!value) return i18n('scheduled.noNextRun', 'No next run');
  const date = new Date(value);
  if (isNaN(date.getTime())) return value;
  const diff = date.getTime() - Date.now();
  if (diff > 0 && diff < 86400000) {
    return i18n('scheduled.today', 'Today') + ' ' + date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  }
  if (diff > 0 && diff < 172800000) {
    return i18n('scheduled.tomorrow', 'Tomorrow') + ' ' + date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  }
  return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

function statusLabel(status: string, active: boolean): string {
  if (status === 'failed') return i18n('scheduled.failed', 'Failed');
  if (status === 'completed') return i18n('scheduled.completed', 'Complete');
  if (status === 'paused') return i18n('scheduled.paused', 'Paused');
  if (status === 'awaiting_approval') return i18n('scheduled.awaitingApproval', 'Needs approval');
  return active ? i18n('scheduled.active', 'Active') : status;
}

function SearchGlyph() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="m20 20-4-4" /></svg>;
}

function PlusGlyph() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>;
}

function ScheduledPage() {
  const snap = useScheduledStore();
  const dispatch = {
    create: (initialPrompt?: string) => openScheduledTaskForm(undefined, initialPrompt),
    edit: (id: string) => openScheduledTaskForm(id),
    toggle: toggleScheduledTask,
    run: runScheduledTask,
    remove: deleteScheduledTask,
  };
  const tasks = snap.tasks;
  const [query, setQuery] = useState('');
  const [scope, setScope] = useState<'all' | 'active'>('all');

  const visibleTasks = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return tasks.filter((task) => {
      if (scope === 'active' && task.status !== 'pending' && task.status !== 'active') return false;
      if (!needle) return true;
      return [task.title, task.prompt].filter(Boolean).join(' ').toLowerCase().includes(needle);
    });
  }, [tasks, query, scope]);

  if (snap.loading) {
    return <div className="workspace-loading">{i18n('scheduled.loading', 'Loading tasks…')}</div>;
  }

  if (snap.error) {
    return <div className="scheduled-empty">{snap.error}</div>;
  }

  const searching = query.trim().length > 0;

  return (
    <section className="workspace-surface scheduled-directory" aria-labelledby="scheduled-directory-title">
      <div className="workspace-page-head">
        <div>
          <h1 id="scheduled-directory-title">{i18n('scheduled.title', 'Scheduled')}</h1>
          <p>{i18n('scheduled.subtitle', 'Let Socrates plan follow-ups, reminders, and recurring updates for you.')}</p>
        </div>
        <div className="workspace-head-actions">
          <label className="workspace-search-field">
            <SearchGlyph />
            <input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder={i18n('scheduled.search', 'Search tasks')} aria-label={i18n('scheduled.search', 'Search tasks')} />
          </label>
          <button type="button" className="workspace-create-button" onClick={() => dispatch.create()}>
            <PlusGlyph />
            <span>{i18n('scheduled.new', 'New')}</span>
          </button>
        </div>
      </div>

      <div className="scheduled-filter-tabs" role="tablist" aria-label={i18n('scheduled.filter', 'Task filter')}>
        <button type="button" role="tab" aria-selected={scope === 'all'} className={scope === 'all' ? 'active' : ''} onClick={() => setScope('all')}>{i18n('scheduled.all', 'All')}</button>
        <button type="button" role="tab" aria-selected={scope === 'active'} className={scope === 'active' ? 'active' : ''} onClick={() => setScope('active')}>{i18n('scheduled.activeOnly', 'Active')}</button>
      </div>

      {!searching && (
        <>
          <div className="scheduled-section-heading">
            <span className="scheduled-heading-label">{i18n('scheduled.recommendations', 'Suggestions')}</span>
            <span>{i18n('scheduled.pickOne', 'Start with a template')}</span>
          </div>
          <div className="scheduled-recommendations">
            {RECOMMENDATIONS.map((recommendation) => {
              const title = i18n(recommendation.titleKey, recommendation.titleFallback);
              const description = i18n(recommendation.descriptionKey, recommendation.descriptionFallback);
              return (
              <button type="button" className="scheduled-recommendation" key={recommendation.titleKey} onClick={() => dispatch.create(recommendation.prompt)}>
                <span className="scheduled-recommendation-icon" aria-hidden="true">{recommendation.icon}</span>
                <span className="scheduled-recommendation-copy"><strong>{title}</strong><small>{description}</small></span>
                <span className="scheduled-recommendation-add" aria-hidden="true">+</span>
              </button>
              );
            })}
          </div>
        </>
      )}

      {visibleTasks.length === 0 ? (
        <div className="workspace-empty">
          {searching ? (
            <><strong>{i18n('scheduled.noMatch', 'No matching tasks')}</strong><span>{i18n('scheduled.noMatchDesc', 'Try a different search.')}</span></>
          ) : scope === 'active' ? (
            <><strong>{i18n('scheduled.noActive', 'No active tasks')}</strong><span>{i18n('scheduled.noActiveDesc', 'Paused and completed tasks are hidden.')}</span></>
          ) : (
            <>
              <strong>{i18n('scheduled.empty', 'Let Socrates follow up')}</strong>
              <span>{i18n('scheduled.emptyDesc', 'Create a reminder, recurring briefing, or monitoring task.')}</span>
              <button type="button" className="workspace-primary" onClick={() => dispatch.create()}>{i18n('scheduled.createTask', 'Create task')}</button>
            </>
          )}
        </div>
      ) : (
        <div className="scheduled-task-list">
          <div className="scheduled-section-heading scheduled-task-heading"><span>{i18n('scheduled.yourTasks', 'Your tasks')}</span><span>{visibleTasks.length}</span></div>
          {visibleTasks.map((task) => {
              const active = task.status === 'pending' || task.status === 'active';
              const detailParts = [
                task.agentKind === 'codex' ? 'Agent' : null,
                statusLabel(task.status, active) + ' · ' + i18n('scheduled.freq.' + (task.frequency || 'once'), task.frequency || 'once'),
                active ? formatTime(task.nextRunAt) : null,
                task.lastRunAt
                  ? i18n('scheduled.lastRun', 'Last run') + ' ' + formatTime(task.lastRunAt)
                  : null,
              ].filter(Boolean);
              return (
                <div className="workspace-row task-row" key={task.id}>
                  <span className="workspace-row-icon">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
                      <rect x="3" y="4" width="18" height="18" rx="3" />
                      <path d="M8 2v4m8-4v4M3 10h18" />
                    </svg>
                  </span>
                  <button
                    type="button"
                    className="task-main"
                    onClick={() => dispatch.edit(task.id)}
                  >
                    <span className="workspace-row-copy">
                      <strong>{task.title}</strong>
                      <span>
                        <i className={'task-status' + (active ? ' on' : '') + (task.status === 'failed' ? ' failed' : '')} />
                        {detailParts.join(' · ')}
                      </span>
                    </span>
                  </button>
                  <button
                    type="button"
                    className="workspace-row-action"
                    onClick={() => dispatch.run(task.id)}
                    aria-label={i18n('scheduled.runNowAria', 'Run task now')}
                  >
                    {i18n('scheduled.runNow', 'Run now')}
                  </button>
                  <button
                    type="button"
                    className="workspace-row-action"
                    onClick={() => dispatch.toggle(task.id, active)}
                    aria-label={active ? i18n('scheduled.pause', 'Pause task') : i18n('scheduled.resume', 'Resume task')}
                  >
                    {active ? i18n('scheduled.pause', 'Pause') : i18n('scheduled.resume', 'Resume')}
                  </button>
                  <button
                    type="button"
                    className="workspace-row-action"
                    onClick={() => dispatch.remove(task.id)}
                    aria-label={i18n('scheduled.deleteAria', 'Delete task')}
                  >
                    {i18n('scheduled.delete', 'Delete')}
                  </button>
                </div>
              );
            })}
        </div>
      )}
    </section>
  );
}

let root: Root | null = null;

export function mountScheduledPage(): void {
  const panel = document.getElementById(PANEL_ID);
  if (!panel) return;

  if (!root) {
    root = createRoot(panel);
  }
  root.render(<ScheduledPage />);
}

export function unmountScheduledPage(): void {
  if (root) {
    root.unmount();
    root = null;
  }
}
