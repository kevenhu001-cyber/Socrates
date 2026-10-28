import { Tabs, TabsList, TabsTrigger } from '../../ui/shadcn/tabs';
import { Alert, AlertDescription } from '../../ui/shadcn/alert';
import { cn } from 'cn';
import { createRootSlot } from '../../lib/boot/ownedRoot';
import { useMemo, useState } from 'react';

import { useScheduledStore } from './scheduled.store';
import { openScheduledTaskForm } from '../workspace/workspace.dialogs';
import { deleteScheduledTask, runScheduledTask, toggleScheduledTask } from './scheduled.service';
import { ScheduledEmptyState } from './ScheduledEmptyState';
import { ScheduledPageHeader } from './ScheduledPageHeader';
import { ScheduledRecommendations } from './ScheduledRecommendations';
import { ScheduledTaskList } from './ScheduledTaskList';
import { scheduledText } from './scheduled.copy';
import { WorkspaceLoadingView } from '../workspace/WorkspaceLoadingView';

const PANEL_ID = 'scheduledPanel';

function ScheduledPage() {
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

  if (snap.error) {
    return <Alert variant="destructive" className="scheduled-empty"><AlertDescription>{snap.error}</AlertDescription></Alert>;
  }

  const searching = query.trim().length > 0;
  const createTask = (initialPrompt?: string) => openScheduledTaskForm(undefined, initialPrompt);

  return (
    <section className="workspace-surface scheduled-directory" aria-labelledby="scheduled-directory-title">
      <ScheduledPageHeader query={query} onQueryChange={setQuery} onCreate={() => createTask()} />

      <Tabs value={scope} onValueChange={(value) => setScope(value as typeof scope)}>
      <TabsList className="scheduled-filter-tabs" aria-label={scheduledText('scheduled.filter', 'Task filter')}>
        <TabsTrigger type="button" value="all" className={cn(scope === 'all' && 'active')}>
          {scheduledText('scheduled.all', 'All')}
        </TabsTrigger>
        <TabsTrigger type="button" value="active" className={cn(scope === 'active' && 'active')}>
          {scheduledText('scheduled.activeOnly', 'Active')}
        </TabsTrigger>
      </TabsList>
      </Tabs>

      {!searching ? <ScheduledRecommendations onSelect={(prompt) => createTask(prompt)} /> : null}

      {visibleTasks.length === 0 ? (
        <ScheduledEmptyState searching={searching} scope={scope} onCreate={() => createTask()} />
      ) : (
        <ScheduledTaskList
          tasks={visibleTasks}
          onEdit={(id) => openScheduledTaskForm(id)}
          onRun={(id) => { void runScheduledTask(id); }}
          onToggle={(id, active) => { void toggleScheduledTask(id, active); }}
          onRemove={(id) => { void deleteScheduledTask(id); }}
        />
      )}
    </section>
  );
}

const rootSlot = createRootSlot('scheduled-page');

export function mountScheduledPage(): void {
  const panel = document.getElementById(PANEL_ID);
  if (!panel) { rootSlot.destroy(); return; }

  rootSlot.mount(panel, <ScheduledPage />);
}

export function unmountScheduledPage(): void {
  rootSlot.destroy();
}
