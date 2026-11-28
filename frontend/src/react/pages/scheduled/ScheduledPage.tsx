import { Plus } from 'lucide-react';
import { Tabs, TabsList, TabsTrigger } from '../../ui/shadcn/tabs';
import { Alert, AlertDescription } from '../../ui/shadcn/alert';
import { Button } from '../../ui/shadcn/button';
import { cn } from 'cn';
import { createRootSlot } from '../../lib/boot/ownedRoot';
import { useMemo, useState } from 'react';

import { useScheduledStore } from './scheduled.store';
import { openScheduledTaskForm } from '../workspace/workspace.dialogs';
import { deleteScheduledTask, runScheduledTask, toggleScheduledTask } from './scheduled.service';
import { ScheduledEmptyState } from './ScheduledEmptyState';
import { ScheduledRecommendations } from './ScheduledRecommendations';
import { ScheduledTaskList } from './ScheduledTaskList';
import { scheduledText } from './scheduled.copy';
import { WorkspaceLoadingView } from '../workspace/WorkspaceLoadingView';
import { PageSearchField } from '../../ui/page/PageSearchField';
import { PageShell } from '../../layout/PageShell';

const PANEL_ID = 'scheduledPanel';

export function ScheduledPage() {
  const snap = useScheduledStore();
  const [query, setQuery] = useState('');
  const [scope, setScope] = useState<'all' | 'active'>('all');
  const visibleTasks = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return snap.tasks.filter((task) => {
      if (scope === 'active' && task.status !== 'pending' && task.status !== 'active') return false;
      if (!needle) return true;
      return [task.title, task.prompt].filter(Boolean).join(' ').toLowerCase().includes(needle);
    });
  }, [snap.tasks, query, scope]);

  if (snap.loading) {
    return <WorkspaceLoadingView page="scheduled" />;
  }

  const title = scheduledText('scheduled.title', 'Scheduled');
  const description = scheduledText(
    'scheduled.subtitle',
    'Let Socrates plan follow-ups, reminders, and recurring updates for you.',
  );

  if (snap.error) {
    return (
      <PageShell
        titleId="scheduled-directory-title"
        title={title}
        description={description}
        className="scheduled-directory"
      >
        <Alert variant="destructive" className="scheduled-empty">
          <AlertDescription>{snap.error}</AlertDescription>
        </Alert>
      </PageShell>
    );
  }

  const searching = query.trim().length > 0;
  const createTask = (initialPrompt?: string) => openScheduledTaskForm(undefined, initialPrompt);

  return (
    <PageShell
      titleId="scheduled-directory-title"
      title={title}
      description={description}
      className="scheduled-directory"
      actions={
        <Button type="button" onClick={() => createTask()}>
          <Plus aria-hidden="true" />
          {scheduledText('scheduled.new', 'New')}
        </Button>
      }
      toolbar={
        <>
          <PageSearchField
            label={scheduledText('scheduled.search', 'Search tasks')}
            query={query}
            onQuery={setQuery}
          />
          <div className="ui-page-toolbar-end">
            <Tabs value={scope} onValueChange={(value) => setScope(value as typeof scope)}>
              <TabsList
                className="ui-page-tabs scheduled-filter-tabs"
                aria-label={scheduledText('scheduled.filter', 'Task filter')}
              >
                <TabsTrigger
                  type="button"
                  value="all"
                  className={cn('ui-page-tab', scope === 'all' && 'active')}
                >
                  {scheduledText('scheduled.all', 'All')}
                </TabsTrigger>
                <TabsTrigger
                  type="button"
                  value="active"
                  className={cn('ui-page-tab', scope === 'active' && 'active')}
                >
                  {scheduledText('scheduled.activeOnly', 'Active')}
                </TabsTrigger>
              </TabsList>
            </Tabs>
          </div>
        </>
      }
    >
      {!searching && scope === 'all' ? (
        <ScheduledRecommendations onSelect={(prompt) => createTask(prompt)} />
      ) : null}

      {visibleTasks.length === 0 ? (
        <ScheduledEmptyState searching={searching} scope={scope} onCreate={() => createTask()} />
      ) : (
        <ScheduledTaskList
          tasks={visibleTasks}
          onEdit={(id) => openScheduledTaskForm(id)}
          onRun={(id) => {
            void runScheduledTask(id);
          }}
          onToggle={(id, active) => {
            void toggleScheduledTask(id, active);
          }}
          onRemove={(id) => {
            void deleteScheduledTask(id);
          }}
        />
      )}
    </PageShell>
  );
}

const rootSlot = createRootSlot('scheduled-page');

export function mountScheduledPage(): void {
  const panel = document.getElementById(PANEL_ID);
  if (!panel) {
    rootSlot.destroy();
    return;
  }

  rootSlot.mount(panel, <ScheduledPage />);
}

export function unmountScheduledPage(): void {
  rootSlot.destroy();
}
