import { Button as UiButton } from '../../ui/Button';
import { Ellipsis, Pause, Play, Trash2 } from 'lucide-react';
import { Menu } from '../../ui/v3';
import type { ScheduledTask } from './types';
import { formatScheduledTime, scheduledStatusLabel, scheduledText } from './scheduled.copy';

interface ScheduledTaskRowProps {
  task: ScheduledTask;
  onEdit: (id: string) => void;
  onRun: (id: string) => void;
  onToggle: (id: string, pause: boolean) => void;
  onRemove: (id: string) => void;
}

export function ScheduledTaskRow({
  task,
  onEdit,
  onRun,
  onToggle,
  onRemove,
}: ScheduledTaskRowProps) {
  const active = task.status === 'pending' || task.status === 'active';
  const detailParts = [
    task.agentKind === 'codex' ? 'Agent' : null,
    scheduledStatusLabel(task.status, active) +
      ' · ' +
      scheduledText('scheduled.freq.' + (task.frequency || 'once'), task.frequency || 'once'),
    active ? formatScheduledTime(task.nextRunAt) : null,
    task.lastRunAt
      ? scheduledText('scheduled.lastRun', 'Last run') + ' ' + formatScheduledTime(task.lastRunAt)
      : null,
  ].filter(Boolean);

  return (
    <div className="workspace-row task-row">
      <span className="workspace-row-icon">
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          aria-hidden="true"
        >
          <rect x="3" y="4" width="18" height="18" rx="3" />
          <path d="M8 2v4m8-4v4M3 10h18" />
        </svg>
      </span>
      <UiButton type="button" className="task-main" onClick={() => onEdit(task.id)}>
        <span className="workspace-row-copy">
          <strong>{task.title}</strong>
          <span>
            <i
              className={
                'task-status' + (active ? ' on' : '') + (task.status === 'failed' ? ' failed' : '')
              }
            />
            {detailParts.join(' · ')}
          </span>
        </span>
      </UiButton>
      <UiButton
        type="button"
        className="workspace-row-action task-inline-action"
        onClick={() => onRun(task.id)}
        aria-label={scheduledText('scheduled.runNowAria', 'Run task now')}
      >
        {scheduledText('scheduled.runNow', 'Run now')}
      </UiButton>
      <UiButton
        type="button"
        className="workspace-row-action task-inline-action"
        onClick={() => onToggle(task.id, active)}
        aria-label={
          active
            ? scheduledText('scheduled.pause', 'Pause task')
            : scheduledText('scheduled.resume', 'Resume task')
        }
      >
        {active
          ? scheduledText('scheduled.pause', 'Pause')
          : scheduledText('scheduled.resume', 'Resume')}
      </UiButton>
      <UiButton
        type="button"
        className="workspace-row-action task-inline-action"
        onClick={() => onRemove(task.id)}
        aria-label={scheduledText('scheduled.deleteAria', 'Delete task')}
      >
        {scheduledText('scheduled.delete', 'Delete')}
      </UiButton>
      <div className="task-mobile-actions">
        <Menu modal={false}>
          <Menu.Trigger>
            <UiButton
              type="button"
              className="task-more-btn"
              aria-label={task.title + ' · ' + scheduledText('sidebar.nav.more', 'More')}
            >
              <Ellipsis aria-hidden="true" />
            </UiButton>
          </Menu.Trigger>
          <Menu.Content align="end" minWidth={176}>
            <Menu.Item className="flex items-center gap-2" onSelect={() => onRun(task.id)}>
              <Play size={15} aria-hidden="true" />
              {scheduledText('scheduled.runNow', 'Run now')}
            </Menu.Item>
            <Menu.Item className="flex items-center gap-2" onSelect={() => onToggle(task.id, active)}>
              {active ? <Pause size={15} aria-hidden="true" /> : <Play size={15} aria-hidden="true" />}
              {active
                ? scheduledText('scheduled.pause', 'Pause')
                : scheduledText('scheduled.resume', 'Resume')}
            </Menu.Item>
            <Menu.Item
              className="flex items-center gap-2 text-destructive"
              onSelect={() => onRemove(task.id)}
            >
              <Trash2 size={15} aria-hidden="true" />
              {scheduledText('scheduled.delete', 'Delete')}
            </Menu.Item>
          </Menu.Content>
        </Menu>
      </div>
    </div>
  );
}
