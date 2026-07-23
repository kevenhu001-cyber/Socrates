import { StrictMode } from 'react';
import { hydrateRoot, type Root } from 'react-dom/client';

import { installChatRuntimeBridge } from './chatRuntimeStore';
import { useChatStreamStatus, useIsChatStreaming } from './useChatRuntime';

const NEW_REPLY_PILL_ID = 'newReplyPill';
const SEND_BUTTON_CONTENT_ID = 'sendBtnContent';

let sendButtonRoot: Root | null = null;

function NewReplyPillContent(): string {
  // Establish the first React subscription without changing the legacy
  // element's markup, text, visibility logic, or delegated click behavior.
  useIsChatStreaming();
  return '↓ New reply';
}

function SendButtonContent() {
  const streamStatus = useChatStreamStatus();

  if (streamStatus === 'streaming') {
    return (
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <rect x="6" y="6" width="12" height="12" rx="2" />
      </svg>
    );
  }

  return (
    <svg
      className={streamStatus === 'idle' ? 'icon-arrow' : undefined}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M12 19V5M5 12l7-7 7 7" />
    </svg>
  );
}

/**
 * Starts React by hydrating the first, deliberately small feature slice.
 *
 * The legacy element retains its id, classes, click delegation, and visibility
 * logic. React owns only its existing text node, so `?react=1` has the exact
 * same visible UI and event surface as the current application.
 */
export function bootstrapReactCompatibilityRuntime(): Root {
  const pill = document.getElementById(NEW_REPLY_PILL_ID);
  const sendButtonContent = document.getElementById(SEND_BUTTON_CONTENT_ID);
  if (!pill) {
    throw new Error('React migration target "#newReplyPill" was not found.');
  }
  if (!sendButtonContent) {
    throw new Error('React migration target "#sendBtnContent" was not found.');
  }
  if (pill.dataset.reactMigrationRuntime) {
    throw new Error('React compatibility runtime was initialized more than once.');
  }
  if (sendButtonContent.dataset.reactMigrationRuntime) {
    throw new Error('React send-button runtime was initialized more than once.');
  }

  pill.setAttribute('data-react-migration-runtime', 'new-reply-pill');
  sendButtonContent.setAttribute('data-react-migration-runtime', 'send-button');
  installChatRuntimeBridge();

  const pillRoot = hydrateRoot(
    pill,
    <StrictMode>
      <NewReplyPillContent />
    </StrictMode>,
  );

  sendButtonRoot = hydrateRoot(
    sendButtonContent,
    <StrictMode>
      <SendButtonContent />
    </StrictMode>,
  );

  return pillRoot;
}
