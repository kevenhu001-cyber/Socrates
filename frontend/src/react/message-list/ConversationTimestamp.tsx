import { useState } from 'react';
import { i18n } from '../../ui/legacyI18n.ts';
import type { ChatMessage } from '../types/domain';

/* The 2026-11-26 phone reference opens a transcript with one quiet, centred
 * timestamp ("昨天 12:22"). It marks when the conversation started; it is not
 * a per-message stamp. Restored rows carry the server `createdAt`; a turn that
 * is being written right now has none yet, so the row's first render time
 * stands in for it. */

const DAY_MS = 86_400_000;

function startOfDay(time: number): number {
  const date = new Date(time);
  date.setHours(0, 0, 0, 0);
  return date.getTime();
}

function currentLocale(): string {
  const lang = document.documentElement.lang || 'en';
  return lang.toLowerCase().startsWith('zh') ? 'zh-CN' : lang;
}

export function formatConversationTime(time: number, now: number = Date.now()): string {
  const locale = currentLocale();
  const clock = new Intl.DateTimeFormat(locale, {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(time);
  const days = Math.round((startOfDay(now) - startOfDay(time)) / DAY_MS);
  if (days === 0) return `${i18n('chat.time.today', 'Today')} ${clock}`;
  if (days === 1) return `${i18n('chat.time.yesterday', 'Yesterday')} ${clock}`;
  const sameYear = new Date(time).getFullYear() === new Date(now).getFullYear();
  const day = new Intl.DateTimeFormat(locale, {
    month: 'short',
    day: 'numeric',
    ...(sameYear ? {} : { year: 'numeric' }),
  }).format(time);
  return `${day} ${clock}`;
}

function messageTime(message: ChatMessage | undefined): number | null {
  const raw = message?.createdAt;
  if (!raw) return null;
  const parsed = Date.parse(raw);
  return Number.isFinite(parsed) ? parsed : null;
}

export function ConversationTimestamp({ first }: Readonly<{ first: ChatMessage | undefined }>) {
  const [mountedAt] = useState(() => Date.now());
  const time = messageTime(first) ?? mountedAt;
  return (
    <div className="msg-time-divider" data-react-owned="1">
      <time dateTime={new Date(time).toISOString()}>{formatConversationTime(time)}</time>
    </div>
  );
}
