import { Button as UiButton } from '../../ui/Button';
import { scheduledText } from './scheduled.copy';
import { Empty, EmptyHeader, EmptyTitle, EmptyDescription, EmptyContent } from '../../ui/shadcn/empty';

interface ScheduledEmptyStateProps {
  searching: boolean;
  scope: 'all' | 'active';
  onCreate: () => void;
}

export function ScheduledEmptyState({ searching, scope, onCreate }: ScheduledEmptyStateProps) {
  return (
    <Empty className="workspace-empty"><EmptyHeader>
      {searching ? (
        <><EmptyTitle>{scheduledText('scheduled.noMatch', 'No matching tasks')}</EmptyTitle><EmptyDescription>{scheduledText('scheduled.noMatchDesc', 'Try a different search.')}</EmptyDescription></>
      ) : scope === 'active' ? (
        <><EmptyTitle>{scheduledText('scheduled.noActive', 'No active tasks')}</EmptyTitle><EmptyDescription>{scheduledText('scheduled.noActiveDesc', 'Paused and completed tasks are hidden.')}</EmptyDescription></>
      ) : (
        <>
          <EmptyTitle>{scheduledText('scheduled.empty', 'Let Socrates follow up')}</EmptyTitle>
          <EmptyDescription>{scheduledText('scheduled.emptyDesc', 'Create a reminder, recurring briefing, or monitoring task.')}</EmptyDescription>
        </>
      )}
    </EmptyHeader>
      {!searching && scope === 'all' ? <EmptyContent><UiButton variant="default" size="desktop" type="button" className="workspace-primary" onClick={onCreate}>{scheduledText('scheduled.createTask', 'Create task')}</UiButton></EmptyContent> : null}
    </Empty>
  );
}
