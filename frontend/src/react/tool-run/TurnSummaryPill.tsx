import type React from 'react';
import { getLegacyActions, i18n } from '../legacy/gateway.ts';
import type { LegacyChatMessage } from '../types/domain';

export interface TurnSummaryPillProps {
  message: LegacyChatMessage;
  live?: boolean;
  messageId: string;
}

function openThinkingPanel(messageId: string): void {
  try {
    getLegacyActions().thinking?.openPanel(messageId);
  } catch (_) {
    /* panel unavailable */
  }
}

function panelKeyHandler(messageId: string) {
  return (event: React.KeyboardEvent<HTMLElement>) => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    openThinkingPanel(messageId);
  };
}

function TimerIcon() {
  return (
    <svg
      className="turn-summary-icon"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="13" r="7.8" />
      <path d="M12 9.2v3.8l2.4 2.4" />
      <path d="M10 2.2h4" />
      <path d="M12 2.2v2.6" />
      <path d="M17.6 5.4l1.2-1.2" />
    </svg>
  );
}

function ChevronRightIcon() {
  return (
    <svg
      className="turn-summary-chevron"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="m9.5 17 5-5-5-5" />
    </svg>
  );
}

export function TurnSummaryPill({ message, live, messageId }: TurnSummaryPillProps) {
  const isLive = Boolean(live);
  const reasoningContent = typeof message.reasoningContent === 'string' ? message.reasoningContent : '';
  const toolCalls = Array.isArray(message.toolCalls) ? message.toolCalls : [];
  const modelSummary = typeof message.summary === 'string' ? message.summary.trim() : '';

  // Only render when the turn has substantial work or upfront summary
  const hasWork = Boolean(modelSummary)
    || Boolean(reasoningContent.trim())
    || toolCalls.length > 0;

  if (!hasWork) return null;

  const label = modelSummary || (isLive ? i18n('think.thinking', '正在深度思考…') : i18n('think.summaryComplete', '回答已整理完成。'));

  const handleClick = (e: React.MouseEvent) => {
    e.preventDefault();
    openThinkingPanel(messageId);
  };

  return (
    <button
      type="button"
      className={`turn-summary-pill${isLive ? ' is-live' : ''}`}
      aria-label={i18n('think.openPanel', '查看思考过程')}
      onClick={handleClick}
      onKeyDown={panelKeyHandler(messageId)}
    >
      <TimerIcon />
      <span className="turn-summary-label">
        {label}
      </span>
      <ChevronRightIcon />
    </button>
  );
}

export default TurnSummaryPill;
