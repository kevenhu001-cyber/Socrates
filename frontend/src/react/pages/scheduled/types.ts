export interface ScheduledTask {
  id: string;
  title: string;
  prompt: string;
  frequency: string;
  nextRunAt: string | null;
  status: string;
  lastRunAt: string | null;
  runCount: number;
  projectId?: string | null;
  agentKind?: 'native' | 'codex' | string;
  lastRunId?: string | null;
  runPolicy?: Record<string, unknown>;
  notificationConfig?: Record<string, unknown>;
}

export interface ScheduledSnapshot {
  tasks: ReadonlyArray<ScheduledTask>;
  loading: boolean;
  error: string | null;
  revision: number;
}

export interface ScheduledBridge {
  getSnapshot: () => ScheduledSnapshot;
  publish: (snapshot: Omit<ScheduledSnapshot, 'revision'>) => void;
  subscribe: (listener: () => void) => () => void;
}

declare global {
  interface Window {
    __socratesScheduledBridge?: ScheduledBridge;
    __socratesMountScheduled?: () => void;
    __socratesNavRenderScheduled?: () => void;
    openCreateScheduledTask?: () => void;
    openEditScheduledTask?: (id: string) => void;
    toggleScheduledTask?: (id: string, pause: boolean) => void;
    runScheduledTask?: (id: string) => void;
    deleteScheduledTask?: (id: string) => void;
  }
}
