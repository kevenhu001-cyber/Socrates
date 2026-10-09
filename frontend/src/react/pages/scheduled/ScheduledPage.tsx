import { createRoot, type Root } from 'react-dom/client';
import { useMemo, useState } from 'react';

import { useScheduledStore } from './scheduled.store';
import { openScheduledTaskForm } from '../workspace/workspace.dialogs';
import { deleteScheduledTask, runScheduledTask, toggleScheduledTask } from './scheduled.service';
import { ScheduledEmptyState } from './ScheduledEmptyState';
import { ScheduledPageHeader } from './ScheduledPageHeader';
import { ScheduledRecommendations } from './ScheduledRecommendations';
import { ScheduledTaskList } from './ScheduledTaskList';
import { scheduledText } from './scheduled.copy';

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
    return <div className="workspace-loading">{scheduledText('scheduled.loading', 'Loading tasks…')}</div>;
  }

  if (snap.error) {
    return <div className="scheduled-empty">{snap.error}</div>;
  }

  const searching = query.trim().length > 0;
  const createTask = (initialPrompt?: string) => openScheduledTaskForm(undefined, initialPrompt);

  return (
    <section className="workspace-surface scheduled-directory" aria-labelledby="scheduled-directory-title">
      <ScheduledPageHeader query={query} onQueryChange={setQuery} onCreate={() => createTask()} />

      <div className="scheduled-filter-tabs" role="tablist" aria-label={scheduledText('scheduled.filter', 'Task filter')}>
        <button type="button" role="tab" aria-selected={scope === 'all'} className={scope === 'all' ? 'active' : ''} onClick={() => setScope('all')}>
          {scheduledText('scheduled.all', 'All')}
        </button>
        <button type="button" role="tab" aria-selected={scope === 'active'} className={scope === 'active' ? 'active' : ''} onClick={() => setScope('active')}>
          {scheduledText('scheduled.activeOnly', 'Active')}
        </button>
      </div>

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

let root: Root | null = null;

export function mountScheduledPage(): void {
  const panel = document.getElementById(PANEL_ID);
  if (!panel) return;

  if (!root) {
    root = createRoot(panel);
  }
  root.render(<ScheduledPage />);
}

export function unmountScheduledPage(): void {
  if (root) {
    root.unmount();
    root = null;
  }
}
