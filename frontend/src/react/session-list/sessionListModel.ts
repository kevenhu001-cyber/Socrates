import type { SessionItem } from '../../legacy/sessionListState.ts';
import { i18n } from '../legacy/gateway';

const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
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

/* The row carries its own relative time now (the meta line under the title),
   so the label has to speak the user's language. The legacy formatter is
   English-only and stays where the legacy surfaces use it. */
export function formatRelativeTimeLabel(value: string | number | null | undefined): string {
  if (!value) return '';
  const date = new Date(value);
  if (isNaN(date.getTime())) return '';
  const diff = Date.now() - date.getTime();
  const mins = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);
  const weeks = Math.floor(days / 7);
  const months = Math.floor(days / 30);
  if (mins < 1) return i18n('recents.time.justNow', 'Just now');
  if (mins < 60) return i18n('recents.time.minutes', '{n}m ago').replace('{n}', String(mins));
  if (hours < 24) return i18n('recents.time.hours', '{n}h ago').replace('{n}', String(hours));
  if (days < 7) return i18n('recents.time.days', '{n}d ago').replace('{n}', String(days));
  if (weeks < 5) return i18n('recents.time.weeks', '{n}w ago').replace('{n}', String(weeks));
  return i18n('recents.time.months', '{n}mo ago').replace('{n}', String(months));
}

export function buildMeta(session: SessionItem, timeLabel?: string): string[] {
  const meta = [
    timeLabel ?? formatRelativeTimeLabel(session.updatedAt || session.createdAt || Date.now()),
  ];
  if (session.totalQ) {
    meta.push(i18n('recents.meta.qCount', '{n} Qs').replace('{n}', String(session.totalQ)));
  }
  if (session.branchedFrom) {
    meta.push(
      session.branchedFrom.reExplain
        ? i18n('recents.meta.reExplained', 'Re-explained')
        : i18n('recents.meta.branched', 'Branched'),
    );
  }
  return meta;
}
