import { create } from 'zustand';
import type { ScheduledTask } from './types';

interface ScheduledState {
  tasks: ReadonlyArray<ScheduledTask>;
  loading: boolean;
  error: string | null;
}

export const useScheduledStore = create<ScheduledState>(() => ({ tasks: [], loading: false, error: null }));

export function patchScheduledState(patch: Partial<ScheduledState>): void {
  useScheduledStore.setState(patch);
}

export function replaceScheduledTasks(tasks: ReadonlyArray<ScheduledTask>): void {
  useScheduledStore.setState({ tasks: [...tasks] });
}
