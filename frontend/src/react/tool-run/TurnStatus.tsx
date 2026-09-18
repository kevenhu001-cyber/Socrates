/**
 * react/tool-run/TurnStatus.tsx — the one live status line of a turn.
 *
 * While an answer streams, the reader is told what the assistant is doing by
 * up to three legacy surfaces: the `.thinking-placeholder` dot (before the
 * first token, with phase copy and a quiet elapsed cue), the `.thinking-status`
 * reasoning pill, and a `.msg-error` block when the wait expired. They were
 * separate DOM appenders, each created and removed at a different moment, which
 * is how a turn ended up showing two "working on it" lines at once — or, after
 * React took over the bubble, zero.
 *
 * Here there is exactly one slot, and `phase` picks which shape fills it. The
 * markup and class names match the stylesheet that already exists.
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

function WaitingLine({ status, messageId }: TurnStatusProps) {
  const clickable = status.clickable !== false;
  const elapsed = (typeof status.elapsedSec === 'number' && status.elapsedSec >= 5) ? `${status.elapsedSec}s` : '';
  return (
    <div className="thinking-placeholder">
      <span
        className={`thinking-dot${clickable ? ' thinking-dot-clickable' : ''}${elapsed ? ' thinking-elapsed-shown' : ''}`}
        data-mode={status.mode || 'chat'}
        data-elapsed={elapsed || undefined}
        role={clickable ? 'button' : undefined}
        tabIndex={clickable ? 0 : undefined}
        aria-label={clickable ? i18n('think.openPanel', 'View thinking process') : undefined}
        onClick={clickable ? () => openThinkingPanel(messageId) : undefined}
        onKeyDown={clickable ? panelKeyHandler(messageId) : undefined}
      >
        <ThinkingSpinner />
        <span className="thinking-dot-label">{status.label}</span>
      </span>
    </div>
  );
}

function ReasoningLine({ status, messageId }: TurnStatusProps) {
  const elapsed = (typeof status.elapsedSec === 'number' && status.elapsedSec >= 5) ? `${status.elapsedSec}s` : '';
  return (
    <span
      className={`thinking-status thinking-status-clickable${elapsed ? ' thinking-elapsed-shown' : ''}`}
      data-mode="tool"
      data-state={status.state || undefined}
      data-elapsed={elapsed || undefined}
      role="button"
      tabIndex={0}
      aria-label={i18n('think.openPanel', 'View thinking process')}
      onClick={(event) => {
        event.preventDefault();
        openThinkingPanel(messageId);
      }}
      onKeyDown={panelKeyHandler(messageId)}
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
  if (status.phase === 'waiting') return <WaitingLine {...props} />;
  if (!status.label) return null;
  return <ReasoningLine {...props} />;
}

export default TurnStatus;
