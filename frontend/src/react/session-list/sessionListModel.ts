import type { SessionItem } from './types';
import { formatRelativeTime } from './sessionList.bridge';

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

export function safeId(sessionId: string): string {
  let hash = 0;
  for (let i = 0; i < sessionId.length; i++) {
    hash = ((hash << 5) - hash + sessionId.charCodeAt(i)) | 0;
  }
  return 'r-' + Math.abs(hash);
}

/* Pinned rows sit first; other sessions use stable calendar buckets. */
export function timeGroupLabel(session: SessionItem, now: Date): string {
  if (session.pinned) return 'Pinned';
  const raw = session.updatedAt || session.createdAt || Date.now();
  const date = new Date(raw);
  const timestamp = date.getTime();
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  if (timestamp >= startOfDay) return 'Today';
  if (timestamp >= startOfDay - 86400000) return 'Yesterday';
  if (timestamp >= startOfDay - 7 * 86400000) return 'Previous 7 days';
  if (timestamp >= startOfDay - 30 * 86400000) return 'Previous 30 days';
  if (date.getFullYear() === now.getFullYear()) return MONTH_NAMES[date.getMonth()];
  return String(date.getFullYear());
}

export function modeLabel(session: SessionItem): { key: string; cls: string } {
  if (session.kind === 'exam') return { key: 'session.badgeExam', cls: 'mode-exam' };
  if (session.mode === 'chat') return { key: 'tutor.modeChat', cls: 'mode-chat' };
  if (session.mode === 'tutor') return { key: 'tutor.modeTutor', cls: 'mode-tutor' };
  if (session.phase === 'chat') return { key: 'tutor.modeChat', cls: 'mode-chat' };
  return { key: 'tutor.modeTutor', cls: 'mode-tutor' };
}

export function buildMeta(session: SessionItem): string[] {
  const meta = [
    formatRelativeTime(session.updatedAt || session.createdAt || Date.now()),
  ];
  if (session.totalQ) meta.push(String(session.totalQ) + ' Qs');
  if (session.branchedFrom) {
    meta.push(session.branchedFrom.reExplain ? 'Re-explained' : 'Branched');
  }
  return meta;
}
