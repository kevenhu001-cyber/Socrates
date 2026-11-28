import { CircleAlertIcon, RefreshCwIcon, SquareIcon } from 'lucide-react';
import { Button } from '../ui/Button';
import { i18n } from '../../ui/legacyI18n.ts';
import type { LiveTurnStatus } from '../types/domain';
import { normalizeChineseProse } from '../../util/chineseTypography.ts';
import {
  captureLiveRetryViewport,
  retryLiveTurn,
  retryRecoveredTurn,
} from '../../chat/liveTurn.ts';

export interface TurnStatusProps {
  status: LiveTurnStatus;
  /** Identity for retry and resend actions. */
  messageId: string;
  readOnly?: boolean;
}

function FailedLine({ status, messageId, readOnly }: Readonly<TurnStatusProps>) {
  const message = normalizeChineseProse(status.error || status.label || '');
  const retry = () => {
    if (status.retryMode === 'restored') retryRecoveredTurn(messageId);
    else retryLiveTurn(messageId);
  };
  return (
    <div className="turn-surface-status msg-error" data-turn-surface-part="terminal" role="alert">
      <CircleAlertIcon className="msg-status-icon" size={20} strokeWidth={1.75} aria-hidden />
      <div className="msg-status-copy">
        <strong className="msg-status-title">
          {i18n('chat.errorTitle', 'Could not generate a response')}
        </strong>
        {message ? <span className="msg-error-text">{message}</span> : null}
      </div>
      {readOnly || status.retryable === false ? null : (
        <Button
          type="button"
          className="msg-retry-btn"
          onPointerDown={() => {
            if (status.retryMode !== 'restored') captureLiveRetryViewport(messageId);
          }}
          onMouseDown={(event) => {
            if (status.retryMode !== 'restored') event.preventDefault();
          }}
          onClick={retry}
        >
          <RefreshCwIcon size={16} strokeWidth={1.75} aria-hidden />
          {i18n('common.retry', 'Retry')}
        </Button>
      )}
    </div>
  );
}

/** A turn the reader stopped. Same slot, Resend instead of Retry. */
function StoppedLine({ status, messageId, readOnly }: Readonly<TurnStatusProps>) {
  const resend = () => {
    retryLiveTurn(messageId);
  };
  return (
    <div
      className="turn-surface-status msg-error msg-resend"
      data-turn-surface-part="terminal"
      role="status"
    >
      <SquareIcon className="msg-status-icon" size={18} strokeWidth={1.75} aria-hidden />
      <span className="msg-error-text">
        {normalizeChineseProse(status.label || i18n('chat.stopped', 'Response stopped'))}
      </span>
      {readOnly ? null : (
        <Button
          type="button"
          className="msg-retry-btn chat-resend-btn"
          data-chat-resend=""
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            resend();
          }}
        >
          <RefreshCwIcon size={16} strokeWidth={1.75} aria-hidden />
          {i18n('chat.resend', 'Resend')}
        </Button>
      )}
    </div>
  );
}

export function TurnStatus(props: Readonly<TurnStatusProps>) {
  const { status } = props;
  if (!status?.phase) return null;
  if (status.phase === 'error') return <FailedLine {...props} />;
  if (status.phase === 'stopped') return <StoppedLine {...props} />;
  if (!status.label) return null;
  return null;
}

export default TurnStatus;
