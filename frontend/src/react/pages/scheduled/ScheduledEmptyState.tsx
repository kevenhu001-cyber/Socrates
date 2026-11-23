import { Button } from '../../ui/shadcn/button';
import { scheduledText } from './scheduled.copy';
import { PageEmptyState } from '../../ui/page/PageEmptyState';

interface ScheduledEmptyStateProps {
  searching: boolean;
  scope: 'all' | 'active';
  onCreate: () => void;
}

export function ScheduledEmptyState({ searching, scope, onCreate }: ScheduledEmptyStateProps) {
  if (searching) {
    return (
      <PageEmptyState
        title={scheduledText('scheduled.noMatch', 'No matching tasks')}
        description={scheduledText('scheduled.noMatchDesc', 'Try a different search.')}
      />
    );
  }
  if (scope === 'active') {
    return (
      <PageEmptyState
        title={scheduledText('scheduled.noActive', 'No active tasks')}
        description={scheduledText(
          'scheduled.noActiveDesc',
          'Paused and completed tasks are hidden.',
        )}
      />
    );
  }
  return (
    <PageEmptyState
      title={scheduledText('scheduled.empty', 'Let Socrates follow up')}
      description={scheduledText(
        'scheduled.emptyDesc',
        'Create a reminder, recurring briefing, or monitoring task.',
      )}
      action={
        <Button type="button" onClick={onCreate}>
          {scheduledText('scheduled.createTask', 'Create task')}
        </Button>
      }
    />
  );
}
