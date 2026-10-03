/**
 * react/tool-run/TurnStatus.tsx — the one live status line of a turn.
 *
 * While an answer streams, the reader is told what the assistant is doing
 * through `message._liveStatus`, and this is the only thing that draws it,
 * so a turn can never show two "working on it" lines at once.
 *
 * P_thinking-unified — every live phase (waiting for the first token,
 * streaming reasoning, tool-running, retrying) renders the SAME markup:
 * one `span.thinking-status` pill with the shared 14px spinner and a flat
 * label. Only the label text (and the quiet elapsed cue) changes between
 * phases, so React updates the text in place: no remount, no box change,
 * no visible jump when the first token lands or reasoning starts. The
 * error / stopped phases keep their own block — they replace the answer,
 * not continue it.
 */
import { getLegacyActions, i18n } from '../legacy/gateway.js';
import type { LiveTurnStatus } from '../types/domain';

export interface TurnStatusProps {
  status: LiveTurnStatus;
  /** Opens the thinking panel; also what the pill's aria-label promises. */
  messageId: string;
}

function openThinkingPanel(messageId: string): void {
  try {
    getLegacyActions().thinking?.openPanel(messageId);
  } catch (_) {
    /* A runtime without the panel still shows the status line. */
  }
}

/** Keyboard parity with the div the legacy pill built (Enter / Space). */
function panelKeyHandler(messageId: string) {
  return (event: React.KeyboardEvent<HTMLElement>) => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    openThinkingPanel(messageId);
  };
}

/** The shared live-status icon: one quiet 14px arc (P_thinking-unified).
 *  The waiting line, the reasoning pill and the in-bubble "Thinking"
 *  summary all use it, so nothing re-themes when the first token lands. */
function ThinkingSpinner() {
  return <span className="thinking-spinner" aria-hidden="true" />;
}

function StatusLine({ status, messageId }: TurnStatusProps) {
  const clickable = status.clickable !== false;
  /* The quiet elapsed cue belongs to the waiting phase only — it is the
     sole writer of `elapsedSec`, so no other phase can grow this pill. */
  const elapsed = status.elapsedSec && status.elapsedSec >= 12 ? `${status.elapsedSec}s` : '';
  const onOpen = clickable ? (event: React.SyntheticEvent<HTMLElement>) => {
    event.preventDefault();
    openThinkingPanel(messageId);
  } : undefined;
  return (
    <span
      className={`thinking-status thinking-status-clickable${elapsed ? ' thinking-elapsed-shown' : ''}`}
      data-mode={status.mode || 'tool'}
      data-state={status.state || undefined}
      data-elapsed={elapsed || undefined}
      role={clickable ? 'button' : undefined}
      tabIndex={clickable ? 0 : undefined}
      aria-label={clickable ? i18n('think.openPanel', 'View thinking process') : undefined}
      onClick={onOpen}
      onKeyDown={clickable ? panelKeyHandler(messageId) : undefined}
    >
      <ThinkingSpinner />
      <span className="thinking-status-label" aria-live="polite">
        {status.label}
      </span>
    </span>
  );
}

function FailedLine({ status, messageId }: TurnStatusProps) {
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
      {status.retryable === false ? null : (
        <button type="button" className="msg-retry-btn" onClick={retry}>
          {i18n('common.retry', 'Retry')}
        </button>
      )}
    </div>
  );
}

/** A turn the reader stopped. Same slot, Resend instead of Retry. */
function StoppedLine({ status, messageId }: TurnStatusProps) {
  const resend = () => {
    try {
      getLegacyActions().liveTurn?.retry(messageId);
    } catch (_) { /* bridge unavailable — the button is inert */ }
  };
  return (
    <div className="msg-error msg-resend" style={{ marginTop: '8px' }}>
      <span className="msg-error-text">{status.label || i18n('chat.stopped', 'Response stopped')}</span>
      <button
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
      </button>
    </div>
  );
}

export function TurnStatus(props: TurnStatusProps) {
  const { status } = props;
  if (!status || !status.phase) return null;
  if (status.phase === 'error') return <FailedLine {...props} />;
  if (status.phase === 'stopped') return <StoppedLine {...props} />;
  if (!status.label) return null;
  /* waiting / thinking / tool-running / retrying: one shape. */
  return <StatusLine {...props} />;
}

export default TurnStatus;
