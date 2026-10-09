import { scheduledText } from './scheduled.copy';

interface ScheduledEmptyStateProps {
  searching: boolean;
  scope: 'all' | 'active';
  onCreate: () => void;
}

export function ScheduledEmptyState({ searching, scope, onCreate }: ScheduledEmptyStateProps) {
  return (
    <div className="workspace-empty">
      {searching ? (
        <><strong>{scheduledText('scheduled.noMatch', 'No matching tasks')}</strong><span>{scheduledText('scheduled.noMatchDesc', 'Try a different search.')}</span></>
      ) : scope === 'active' ? (
        <><strong>{scheduledText('scheduled.noActive', 'No active tasks')}</strong><span>{scheduledText('scheduled.noActiveDesc', 'Paused and completed tasks are hidden.')}</span></>
      ) : (
        <>
          <strong>{scheduledText('scheduled.empty', 'Let Socrates follow up')}</strong>
          <span>{scheduledText('scheduled.emptyDesc', 'Create a reminder, recurring briefing, or monitoring task.')}</span>
          <button type="button" className="workspace-primary" onClick={onCreate}>{scheduledText('scheduled.createTask', 'Create task')}</button>
        </>
      )}
    </div>
  );
}
