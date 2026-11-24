import type { ScheduledTask } from './types';
import { scheduledText } from './scheduled.copy';
import { ScheduledTaskRow } from './ScheduledTaskRow';

interface ScheduledTaskListProps {
  readonly tasks: ReadonlyArray<ScheduledTask>;
  readonly onEdit: (id: string) => void;
  readonly onRun: (id: string) => void;
  readonly onToggle: (id: string, pause: boolean) => void;
  readonly onRemove: (id: string) => void;
}

export function ScheduledTaskList({
  tasks,
  onEdit,
  onRun,
  onToggle,
  onRemove,
}: ScheduledTaskListProps) {
  return (
    <div className="ui-collection scheduled-task-list">
      <div className="ui-collection-head scheduled-task-heading">
        <span>{scheduledText('scheduled.yourTasks', 'Your tasks')}</span>
        <span>{tasks.length}</span>
      </div>
      <div className="ui-collection-body">
        {tasks.map((task) => (
          <ScheduledTaskRow
            key={task.id}
            task={task}
            onEdit={onEdit}
            onRun={onRun}
            onToggle={onToggle}
            onRemove={onRemove}
          />
        ))}
      </div>
    </div>
  );
}
