import { getLegacyActions } from '../../legacy/gateway.ts';
import { apiFetch } from '../../../util/api/index.ts';
import { patchScheduledState, replaceScheduledTasks, useScheduledStore } from './scheduled.store';
import type { ScheduledTask } from './types';
import { reportSwallow as reportEmptyCatch } from '../../../util/reportSwallow.ts';

function toast(message: string): void {
  getLegacyActions().messages.showToast?.(message);
}

export async function loadScheduledTasks(): Promise<void> {
  if (!useScheduledStore.getState().tasks.length)
    patchScheduledState({ loading: true, error: null });
  try {
    const result = (await apiFetch('/api/scheduled-tasks')) as { tasks?: ScheduledTask[] };
    replaceScheduledTasks(result?.tasks || []);
    patchScheduledState({ loading: false, error: null });
  } catch (error) {
    replaceScheduledTasks([]);
    const status =
      error && typeof error === 'object' ? (error as { status?: number }).status : undefined;
    patchScheduledState({
      loading: false,
      error:
        status === 401 ? 'Sign in to schedule tasks.' : 'Tasks could not be loaded. Try again.',
    });
  }
}

export async function saveScheduledTask(
  taskId: string | null,
  body: Record<string, unknown>,
): Promise<void> {
  try {
    await apiFetch(
      taskId ? '/api/scheduled-tasks/' + encodeURIComponent(taskId) : '/api/scheduled-tasks',
      {
        method: taskId ? 'PATCH' : 'POST',
        body,
      },
    );
    await loadScheduledTasks();
    toast(taskId ? 'Task updated' : 'Task scheduled');
  } catch {
    toast('Could not save task');
    throw new Error('scheduled-task-save-failed');
  }
}

export async function toggleScheduledTask(id: string, pause: boolean): Promise<void> {
  try {
    await apiFetch('/api/scheduled-tasks/' + encodeURIComponent(id), {
      method: 'PATCH',
      body: { status: pause ? 'paused' : 'active' },
    });
    await loadScheduledTasks();
    toast(pause ? 'Task paused' : 'Task resumed');
  } catch {
    toast('Could not update task');
  }
}

export async function runScheduledTask(id: string): Promise<void> {
  toast('Running task…');
  try {
    await apiFetch('/api/scheduled-tasks/' + encodeURIComponent(id) + '/run', { method: 'POST' });
    await loadScheduledTasks();
    try {
      void getLegacyActions().sessions.flushRecentsReconcile();
    } catch (error) {
      reportEmptyCatch(
        error,
        'empty catch: react/pages/scheduled/scheduled.service.ts',
        'expected',
      );
      /* recents refresh is best-effort */
    }
    toast('Task ran — see Recents for the result');
  } catch {
    await loadScheduledTasks();
    toast('Could not run task');
  }
}

export async function deleteScheduledTask(id: string, closeDialog?: () => void): Promise<void> {
  try {
    const confirmed = await getLegacyActions().confirm.showConfirm(
      'Delete this scheduled task?',
      'This cannot be undone.',
      true,
    );
    if (confirmed === false) return;
    await apiFetch('/api/scheduled-tasks/' + encodeURIComponent(id), { method: 'DELETE' });
    await loadScheduledTasks();
    closeDialog?.();
    toast('Task deleted');
  } catch {
    toast('Could not delete task');
  }
}
