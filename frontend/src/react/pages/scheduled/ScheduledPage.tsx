import { createRoot, type Root } from 'react-dom/client';
import { useMemo, useState, type ReactNode } from 'react';

import { t as _t } from '../../legacy/gateway';
import {
  installScheduledBridge,
  useScheduledDispatch,
  useScheduledSnapshot,
} from './scheduled.bridge';

const LIST_ID = 'scheduledList';

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

const RECOMMENDATIONS: ReadonlyArray<{ icon: ReactNode; title: string; description: string; prompt: string }> = [
  { icon: <SunIcon />, title: 'Daily briefing', description: 'Summarize the updates I care about each morning.', prompt: 'Send me a concise daily briefing with the latest updates on my saved topics.' },
  { icon: <InboxIcon />, title: 'Inbox check', description: 'Surface messages that need my attention.', prompt: 'Check my inbox and tell me which messages need a reply or follow-up.' },
  { icon: <SearchIcon />, title: 'Weekly research pulse', description: 'Compare the latest work in a topic I follow.', prompt: 'Give me a weekly research briefing comparing the latest work on my chosen topic.' },
  { icon: <RobotIcon />, title: 'AI research digest', description: 'Send the best new work every Friday.', prompt: 'Give me the best new AI research every Friday with a short explanation of why it matters.' },
  { icon: <LaptopIcon />, title: 'Project status', description: 'Keep me posted on progress and blockers.', prompt: 'Give me a weekly progress brief on my active project and its next milestone.' },
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

function ScheduledPage() {
  const snap = useScheduledSnapshot();
  const dispatch = useScheduledDispatch();
  const tasks = snap.tasks;
  const [draft, setDraft] = useState('');
  const [activeOnly, setActiveOnly] = useState(false);

  const visibleTasks = useMemo(() => {
    if (!activeOnly) return tasks;
    return tasks.filter((task) => task.status === 'pending' || task.status === 'active');
  }, [activeOnly, tasks]);

  const createFromDraft = () => {
    const value = draft.trim();
    dispatch.create(value || undefined);
    if (value) setDraft('');
  };

  if (snap.loading) {
    return <div className="workspace-loading">{i18n('scheduled.loading', 'Loading tasks…')}</div>;
  }

  if (snap.error) {
    return <div className="scheduled-empty">{snap.error}</div>;
  }

  return (
    <div className="scheduled-directory">
      <div className="scheduled-directory-head">
        <div>
          <span className="workspace-eyebrow">{i18n('scheduled.workspaceEyebrow', 'Workspace')}</span>
          <h1>{i18n('scheduled.title', 'Scheduled')}</h1>
          <p>{i18n('scheduled.subtitle', 'Let Socrates plan follow-ups, reminders, and recurring updates for you.')}</p>
        </div>
        <button type="button" className={'scheduled-filter-button' + (activeOnly ? ' active' : '')} onClick={() => setActiveOnly((value) => !value)} aria-pressed={activeOnly}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 5h16l-6.5 8v5l-3 1v-6z" /></svg>
          {activeOnly ? i18n('scheduled.activeOnly', 'Active') : i18n('scheduled.allTasks', 'All tasks')}
        </button>
      </div>

      <div className="scheduled-task-composer">
        <button type="button" className="scheduled-composer-plus" onClick={() => dispatch.create()} aria-label={i18n('scheduled.createTask', 'Create task')}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>
        </button>
        <input value={draft} onChange={(event) => setDraft(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); createFromDraft(); } }} placeholder={i18n('scheduled.inputPlaceholder', 'What should Socrates do, and when?')} aria-label={i18n('scheduled.inputPlaceholder', 'What should Socrates do, and when?')} />
        <button type="button" className="scheduled-composer-submit" onClick={createFromDraft} aria-label={i18n('scheduled.createTask', 'Create task')}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m5 12 14-7-4 14-3-6z" /><path d="m12 13 7-8" /></svg>
        </button>
      </div>

      <div className="scheduled-section-heading">
        <span>{i18n('scheduled.recommendations', 'Suggestions')}</span>
        <span>{i18n('scheduled.pickOne', 'Start with a template')}</span>
      </div>
      <div className="scheduled-recommendations">
        {RECOMMENDATIONS.map((recommendation) => (
          <button type="button" className="scheduled-recommendation" key={recommendation.title} onClick={() => dispatch.create(recommendation.prompt)}>
            <span className="scheduled-recommendation-icon" aria-hidden="true">{recommendation.icon}</span>
            <span className="scheduled-recommendation-copy"><strong>{recommendation.title}</strong><small>{recommendation.description}</small></span>
            <span className="scheduled-recommendation-add" aria-hidden="true">+</span>
          </button>
        ))}
      </div>

      {visibleTasks.length === 0 ? (
        <div className="scheduled-empty-state">
          <strong>{activeOnly ? i18n('scheduled.noActive', 'No active tasks') : i18n('scheduled.empty', 'Let Socrates follow up')}</strong>
          <span>{activeOnly ? i18n('scheduled.noActiveDesc', 'Paused and completed tasks are hidden.') : i18n('scheduled.emptyDesc', 'Create a reminder, recurring briefing, or monitoring task.')}</span>
        </div>
      ) : (
        <div className="scheduled-task-list">
          <div className="scheduled-section-heading scheduled-task-heading"><span>{i18n('scheduled.yourTasks', 'Your tasks')}</span><span>{visibleTasks.length}</span></div>
          {visibleTasks.map((task) => {
              const active = task.status === 'pending' || task.status === 'active';
              const detailParts = [
                task.agentKind === 'codex' ? 'Codex' : null,
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
    </div>
  );
}

let root: Root | null = null;

export function mountScheduledPage(): void {
  const container = document.getElementById(LIST_ID);
  if (!container) return;

  installScheduledBridge();

  if (!root) {
    root = createRoot(container);
  }
  root.render(<ScheduledPage />);
}

export function unmountScheduledPage(): void {
  if (root) {
    root.unmount();
    root = null;
  }
}
