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
