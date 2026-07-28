import React from 'react';
import type { LegacyChatMessage } from '../types/domain';
import { useMessageToolbarCallbacks } from './useMessageActions';

interface IconButtonProps {
  action: string;
  label: string;
  onClick?: (ev: React.MouseEvent<HTMLButtonElement>) => void;
  svgInner: string;
  active?: boolean;
}

function IconButton({ action, label, onClick, svgInner, active }: IconButtonProps): React.ReactElement {
  return (
    <button
      type="button"
      className={`msg-toolbar-btn${active ? ' active' : ''}`}
      aria-label={label}
      data-action={action}
      onClick={onClick}
    >
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        dangerouslySetInnerHTML={{ __html: svgInner }}
      />
    </button>
  );
}

interface MessageToolbarProps {
  message: LegacyChatMessage;
  role: 'user' | 'assistant';
}

function MessageToolbar({ message, role }: MessageToolbarProps): React.ReactElement | null {
  const c = useMessageToolbarCallbacks(message);
  const id = typeof message.id === 'string' ? message.id
    : typeof message.clientId === 'string' ? message.clientId
    : '';

  return (
    <div className="msg-toolbar" data-role={role} data-message-id={id}>
      <IconButton
        action="copy"
        label="Copy"
        onClick={() => c.onCopy?.()}
        svgInner='<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h10"/>'
      />
      {role === 'user' && (
        <>
          <IconButton
            action="edit"
            label="Edit message"
            onClick={() => c.onEdit?.()}
            svgInner='<path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 1 1 3 3L7 19l-4 1 1-4 12.5-12.5z"/>'
          />
          <IconButton
            action="delete"
            label="Delete message"
            onClick={() => c.onDelete?.()}
            svgInner='<path d="M3 6h18"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>'
          />
        </>
      )}
      {role === 'assistant' && (
        <>
          <IconButton
            action="share"
            label="Share conversation"
            onClick={() => c.onShare?.()}
            svgInner='<path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/><polyline points="16 6 12 2 8 6"/><line x1="12" y1="2" x2="12" y1="15"/>'
          />
          <IconButton
            action="regenerate"
            label="Regenerate response"
            onClick={() => c.onRegenerate?.()}
            svgInner='<path d="M21 12a9 9 0 1 1-3.5-7.1"/><path d="M21 4v6h-6"/>'
          />
          <IconButton
            action="thumbs-up"
            label="Helpful"
            onClick={() => c.onThumbsUp?.()}
            svgInner='<path d="M7 10v11"/><path d="M15 5l-1 5h5a2 2 0 0 1 2 2l-2 7a2 2 0 0 1-2 2H7V10l4-7a2 2 0 0 1 3 2v3z"/>'
          />
          <IconButton
            action="thumbs-down"
            label="Not helpful"
            onClick={() => c.onThumbsDown?.()}
            svgInner='<path d="M17 14V3"/><path d="M9 19l1-5H5a2 2 0 0 1-2-2l2-7a2 2 0 0 1 2-2h10v11l-4 7a2 2 0 0 1-3-2v-3z"/>'
          />
          <IconButton
            action="branch"
            label="Branch from here"
            onClick={() => c.onBranch?.()}
            svgInner='<path d="M6 4v16"/><path d="M18 4v16"/><path d="M6 8h8a2 2 0 0 1 2 2v4"/><path d="M6 16h8a2 2 0 0 0 2-2v-4"/><path d="M16 10l3 3-3 3"/>'
          />
          <IconButton
            action="re-explain"
            label="Re-explain from a different angle"
            onClick={() => c.onReExplain?.()}
            svgInner='<path d="M12 2l3.1 6.3L22 9.5l-5 4.9 1.2 6.8L12 18l-6.2 3.2L7 14.4 2 9.5l6.9-1.2L12 2z"/>'
          />
          <IconButton
            action="read-aloud"
            label="Read aloud"
            onClick={(ev) => c.onReadAloud?.(ev)}
            svgInner='<path d="M11 5 6 9H2v6h4l5 4z"/><path d="M15.5 8.5a5 5 0 0 1 0 7"/><path d="M18.5 5.5a9 9 0 0 1 0 13"/>'
          />
        </>
      )}
    </div>
  );
}

export { MessageToolbar };
