import type { ScheduledTask } from './types';
import { formatScheduledTime, scheduledStatusLabel, scheduledText } from './scheduled.copy';

interface ScheduledTaskRowProps {
  task: ScheduledTask;
  onEdit: (id: string) => void;
  onRun: (id: string) => void;
  onToggle: (id: string, pause: boolean) => void;
  onRemove: (id: string) => void;
}

export function ScheduledTaskRow({ task, onEdit, onRun, onToggle, onRemove }: ScheduledTaskRowProps) {
  const active = task.status === 'pending' || task.status === 'active';
  const detailParts = [
    task.agentKind === 'codex' ? 'Agent' : null,
    scheduledStatusLabel(task.status, active) + ' · ' + scheduledText('scheduled.freq.' + (task.frequency || 'once'), task.frequency || 'once'),
    active ? formatScheduledTime(task.nextRunAt) : null,
    task.lastRunAt ? scheduledText('scheduled.lastRun', 'Last run') + ' ' + formatScheduledTime(task.lastRunAt) : null,
  ].filter(Boolean);

  return (
    <div className="workspace-row task-row">
      <span className="workspace-row-icon">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
          <rect x="3" y="4" width="18" height="18" rx="3" />
          <path d="M8 2v4m8-4v4M3 10h18" />
        </svg>
      </span>
      <button type="button" className="task-main" onClick={() => onEdit(task.id)}>
        <span className="workspace-row-copy">
          <strong>{task.title}</strong>
          <span>
            <i className={'task-status' + (active ? ' on' : '') + (task.status === 'failed' ? ' failed' : '')} />
            {detailParts.join(' · ')}
          </span>
        </span>
      </button>
      <button type="button" className="workspace-row-action" onClick={() => onRun(task.id)} aria-label={scheduledText('scheduled.runNowAria', 'Run task now')}>
        {scheduledText('scheduled.runNow', 'Run now')}
      </button>
      <button type="button" className="workspace-row-action" onClick={() => onToggle(task.id, active)} aria-label={active ? scheduledText('scheduled.pause', 'Pause task') : scheduledText('scheduled.resume', 'Resume task')}>
        {active ? scheduledText('scheduled.pause', 'Pause') : scheduledText('scheduled.resume', 'Resume')}
      </button>
      <button type="button" className="workspace-row-action" onClick={() => onRemove(task.id)} aria-label={scheduledText('scheduled.deleteAria', 'Delete task')}>
        {scheduledText('scheduled.delete', 'Delete')}
      </button>
    </div>
  );
}
