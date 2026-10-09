import { t as translate } from '../../legacy/gateway.ts';

export function scheduledText(key: string, fallback: string): string {
  const value = translate(key);
  return value !== key ? value : fallback;
}

export function formatScheduledTime(value: string | null): string {
  if (!value) return scheduledText('scheduled.noNextRun', 'No next run');
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  const diff = date.getTime() - Date.now();
  if (diff > 0 && diff < 86400000) {
    return scheduledText('scheduled.today', 'Today') + ' ' + date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  }
  if (diff > 0 && diff < 172800000) {
    return scheduledText('scheduled.tomorrow', 'Tomorrow') + ' ' + date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  }
  return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

export function scheduledStatusLabel(status: string, active: boolean): string {
  if (status === 'failed') return scheduledText('scheduled.failed', 'Failed');
  if (status === 'completed') return scheduledText('scheduled.completed', 'Complete');
  if (status === 'paused') return scheduledText('scheduled.paused', 'Paused');
  if (status === 'awaiting_approval') return scheduledText('scheduled.awaitingApproval', 'Needs approval');
  return active ? scheduledText('scheduled.active', 'Active') : status;
}
