import { Button } from '../ui/Button';
import { i18n } from '../legacy/gateway.ts';
import type { LiveTurnStatus } from '../types/domain';
import { normalizeChineseProse } from '../../util/chineseTypography.ts';
import { captureLiveRetryViewport, retryLiveTurn, retryRecoveredTurn } from '../../chat/liveTurn.ts';

export interface TurnStatusProps {
  status: LiveTurnStatus;
  /** Identity for retry and resend actions. */
  messageId: string;
  readOnly?: boolean;
}

function FailedLine({ status, messageId, readOnly }: TurnStatusProps) {
  const message = normalizeChineseProse(status.error || status.label || '');
  const retry = () => {
    if (status.retryMode === 'restored') retryRecoveredTurn(messageId);
    else retryLiveTurn(messageId);
  };
  return (
    <div className="turn-surface-status msg-error" data-turn-surface-part="terminal">
      <span className="msg-error-text">{message}</span>
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
          {i18n('common.retry', 'Retry')}
        </Button>
      )}
    </div>
  );
}

/** A turn the reader stopped. Same slot, Resend instead of Retry. */
function StoppedLine({ status, messageId, readOnly }: TurnStatusProps) {
  const resend = () => {
    retryLiveTurn(messageId);
  };
  return (
    <div className="turn-surface-status msg-error msg-resend" data-turn-surface-part="terminal" style={{ marginTop: '8px' }}>
      <span className="msg-error-text">{normalizeChineseProse(status.label || i18n('chat.stopped', 'Response stopped'))}</span>
      {readOnly ? null : <Button
        type="button"
        className="msg-retry-btn chat-resend-btn"
        data-chat-resend=""
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          resend();
        }}
      >
        {i18n('chat.resend', 'Resend')}
      </Button>}
    </div>
  );
}

export function TurnStatus(props: TurnStatusProps) {
  const { status } = props;
  if (!status || !status.phase) return null;
  if (status.phase === 'error') return <FailedLine {...props} />;
  if (status.phase === 'stopped') return <StoppedLine {...props} />;
  if (!status.label) return null;
  return null;
}

export default TurnStatus;
