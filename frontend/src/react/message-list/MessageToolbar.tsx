import React from 'react';
import type { LegacyChatMessage } from '../types/domain';
import { useMessageToolbarCallbacks } from './useMessageActions';

interface IconButtonProps {
  label: string;
  onClick?: (ev: React.MouseEvent<HTMLButtonElement>) => void;
  svgInner: string;
  active?: boolean;
}

function IconButton({ label, onClick, svgInner, active }: IconButtonProps): React.ReactElement {
  return (
    <button
      type="button"
      className={`msg-toolbar-btn${active ? ' active' : ''}`}
      aria-label={label}
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
        label="Copy"
        onClick={() => c.onCopy?.()}
        svgInner='<rect width="14" height="14" x="8" y="8" rx="2.5"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/>'
      />
      {role === 'user' && (
        <>
          <IconButton
            label="Edit message"
            onClick={() => c.onEdit?.()}
            svgInner='<path d="M12 20h9"/><path d="M16.376 3.622a1 1 0 0 1 3.002 3.002L7.368 18.635a2 2 0 0 1-.855.506l-2.872.838a.5.5 0 0 1-.62-.62l.838-2.872a2 2 0 0 1 .506-.854z"/>'
          />
          <IconButton
            label="Delete message"
            onClick={() => c.onDelete?.()}
            svgInner='<path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" x2="10" y1="11" y2="17"/><line x1="14" x2="14" y1="11" y2="17"/>'
          />
        </>
      )}
      {role === 'assistant' && (
        <>
          <IconButton
            label="Share conversation"
            onClick={() => c.onShare?.()}
            svgInner='<path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/><polyline points="16 6 12 2 8 6"/><line x1="12" x2="12" y1="2" y2="15"/>'
          />
          <IconButton
            label="Regenerate response"
            onClick={() => c.onRegenerate?.()}
            svgInner='<path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M8 16H3v5"/>'
          />
          <IconButton
            label="Helpful"
            onClick={() => c.onThumbsUp?.()}
            svgInner='<path d="M7 10v12"/><path d="M15 5.88 14 10h5.83a2 2 0 0 1 1.92 2.56l-2.33 8A2 2 0 0 1 17.5 22H4a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2h2.76a2 2 0 0 0 1.79-1.11L12 2a3.13 3.13 0 0 1 3 3.88Z"/>'
          />
          <IconButton
            label="Not helpful"
            onClick={() => c.onThumbsDown?.()}
            svgInner='<path d="M17 14V2"/><path d="M9 18.12 10 14H4.17a2 2 0 0 1-1.92-2.56l2.33-8A2 2 0 0 1 6.5 2H20a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-2.76a2 2 0 0 0-1.79 1.11L12 22a3.13 3.13 0 0 1-3-3.88Z"/>'
          />
          <IconButton
            label="Branch from here"
            onClick={() => c.onBranch?.()}
            svgInner='<line x1="6" x2="6" y1="3" y2="15"/><circle cx="18" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="M18 9a9 9 0 0 1-9 9"/>'
          />
          <IconButton
            label="Re-explain from a different angle"
            onClick={() => c.onReExplain?.()}
            svgInner='<path d="M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1 .2 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5"/><path d="M9 18h6"/><path d="M10 22h4"/>'
          />
          <IconButton
            label="Read aloud"
            onClick={(ev) => c.onReadAloud?.(ev)}
            svgInner='<path d="M11 4.702a.705.705 0 0 0-1.203-.498L6.413 7.587A1.4 1.4 0 0 1 5.416 8H3a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h2.416a1.4 1.4 0 0 1 .997.413l3.383 3.384A.705.705 0 0 0 11 19.298z"/><path d="M16 9a5 5 0 0 1 0 6"/><path d="M19.364 18.364a9 9 0 0 0 0-12.728"/>'
          />
        </>
      )}
    </div>
  );
}

export { MessageToolbar };
