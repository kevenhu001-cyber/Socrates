import { Button } from '../ui/Button';
import { getLegacyActions, i18n } from '../legacy/gateway.ts';
import type { LiveTurnStatus } from '../types/domain';
import { normalizeChineseProse } from '../../util/chineseTypography.ts';
import { reportSwallow as reportEmptyCatch } from '../../util/reportSwallow.ts';

export interface TurnStatusProps {
  status: LiveTurnStatus;
  /** Identity for retry and resend actions. */
  messageId: string;
  readOnly?: boolean;
}

function FailedLine({ status, messageId, readOnly }: TurnStatusProps) {
  const message = normalizeChineseProse(status.error || status.label || '');
  const retry = () => {
    /* The retry handler belongs to the in-flight turn (it knows the prompt,
       the retry budget, and the viewport to re-anchor), so this hands off to
       main.js rather than re-implementing a send. */
    try {
      getLegacyActions().liveTurn?.retry(messageId);
    } catch (_) {
      reportEmptyCatch(_, 'empty catch: react/tool-run/TurnStatus.tsx:21', 'expected');
      /* bridge unavailable — the button is inert */
    }
  };
  return (
    <div className="turn-surface-status msg-error" data-turn-surface-part="terminal">
      <span className="msg-error-text">{message}</span>
      {readOnly || status.retryable === false ? null : (
        <Button
          type="button"
          className="msg-retry-btn"
          id={status.retryButtonId}
          data-stream-retry={status.retryMode === 'restored' ? '' : undefined}
          onClick={status.retryMode === 'restored' || status.retryButtonId ? undefined : retry}
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
    try {
      getLegacyActions().liveTurn?.retry(messageId);
    } catch (_) {
      reportEmptyCatch(_, 'empty catch: react/tool-run/TurnStatus.tsx:46', 'expected');
      /* bridge unavailable — the button is inert */
    }
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
