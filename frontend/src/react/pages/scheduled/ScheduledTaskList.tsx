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

export function ScheduledTaskList({ tasks, onEdit, onRun, onToggle, onRemove }: ScheduledTaskListProps) {
  return (
    <div className="scheduled-task-list">
      <div className="scheduled-section-heading scheduled-task-heading">
        <span>{scheduledText('scheduled.yourTasks', 'Your tasks')}</span>
        <span>{tasks.length}</span>
      </div>
      {tasks.map((task) => (
        <ScheduledTaskRow key={task.id} task={task} onEdit={onEdit} onRun={onRun} onToggle={onToggle} onRemove={onRemove} />
      ))}
    </div>
  );
}
