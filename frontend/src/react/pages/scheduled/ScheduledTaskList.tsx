import type { ScheduledTask } from './types';
import { scheduledText } from './scheduled.copy';
import { ScheduledTaskRow } from './ScheduledTaskRow';

interface ScheduledTaskListProps {
  tasks: ReadonlyArray<ScheduledTask>;
  onEdit: (id: string) => void;
  onRun: (id: string) => void;
  onToggle: (id: string, pause: boolean) => void;
  onRemove: (id: string) => void;
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
