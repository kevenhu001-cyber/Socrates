import { createRoot, type Root } from 'react-dom/client';

import { t as _t } from '../../legacy/gateway';
import {
  installScheduledBridge,
} from './scheduledStore';
import {
  useScheduledDispatch,
  useScheduledSnapshot,
} from './legacyAdapter';

const LIST_ID = 'scheduledList';

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

function ScheduledPage() {
  const snap = useScheduledSnapshot();
  const dispatch = useScheduledDispatch();
  const tasks = snap.tasks;

  if (snap.loading) {
    return <div className="workspace-loading">{i18n('scheduled.loading', 'Loading tasks…')}</div>;
  }

  if (snap.error) {
    return <div className="scheduled-empty">{snap.error}</div>;
  }

  return (
    <>
      {tasks.length === 0 ? (
          <div className="workspace-empty">
            <strong>{i18n('scheduled.empty', 'Let Socrates follow up')}</strong>
            <span>{i18n('scheduled.emptyDesc', 'Create a reminder, recurring briefing, or monitoring task.')}</span>
            <button
              type="button"
              className="workspace-primary"
              onClick={() => dispatch.create()}
            >
              {i18n('scheduled.createTask', 'Create task')}
            </button>
          </div>
        ) : (
          <>
            <div className="workspace-primary-action">
              <button
                type="button"
                className="workspace-primary"
                onClick={() => dispatch.create()}
                style={{ marginBottom: 12 }}
              >
                + {i18n('scheduled.createTask', 'Create task')}
              </button>
            </div>
            {tasks.map((task) => {
              const active = task.status !== 'paused' && task.status !== 'completed';
              const stateLabel = active
                ? i18n('scheduled.active', 'Active')
                : task.status === 'paused'
                  ? i18n('scheduled.paused', 'Paused')
                  : i18n('scheduled.completed', 'Complete');
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
                        <i className={'task-status' + (active ? ' on' : '')} />
                        {stateLabel + ' · ' + i18n('scheduled.freq.' + (task.frequency || 'once'), task.frequency || 'once') + ' · ' + formatTime(task.nextRunAt)}
                      </span>
                    </span>
                  </button>
                  <button
                    type="button"
                    className="workspace-row-action"
                    onClick={() => dispatch.toggle(task.id, active)}
                    aria-label={active ? i18n('scheduled.pause', 'Pause task') : i18n('scheduled.resume', 'Resume task')}
                  >
                    {active ? i18n('scheduled.pause', 'Pause') : i18n('scheduled.resume', 'Resume')}
                  </button>
                </div>
              );
            })}
          </>
        )}
    </>
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
