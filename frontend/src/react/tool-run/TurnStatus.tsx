import { getLegacyActions, i18n } from '../legacy/gateway.ts';
import type { LiveTurnStatus } from '../types/domain';

export interface TurnStatusProps {
  status: LiveTurnStatus;
  /** Identity for retry and resend actions. */
  messageId: string;
  readOnly?: boolean;
}

function FailedLine({ status, messageId, readOnly }: TurnStatusProps) {
  const message = status.error || status.label || '';
  const retry = () => {
    /* The retry handler belongs to the in-flight turn (it knows the prompt,
       the retry budget, and the viewport to re-anchor), so this hands off to
       main.js rather than re-implementing a send. */
    try {
      getLegacyActions().liveTurn?.retry(messageId);
    } catch (_) { /* bridge unavailable — the button is inert */ }
  };
  return (
    <div className="msg-error">
      <span className="msg-error-text">{message}</span>
      {readOnly || status.retryable === false ? null : (
        <button type="button" className="msg-retry-btn" onClick={retry}>
          {i18n('common.retry', 'Retry')}
        </button>
      )}
    </div>
  );
}

/** A turn the reader stopped. Same slot, Resend instead of Retry. */
function StoppedLine({ status, messageId, readOnly }: TurnStatusProps) {
  const resend = () => {
    try {
      getLegacyActions().liveTurn?.retry(messageId);
    } catch (_) { /* bridge unavailable — the button is inert */ }
  };
  return (
    <div className="msg-error msg-resend" style={{ marginTop: '8px' }}>
      <span className="msg-error-text">{status.label || i18n('chat.stopped', 'Response stopped')}</span>
      {readOnly ? null : <button
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
      </button>}
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
