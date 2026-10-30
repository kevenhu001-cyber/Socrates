import { Badge } from '../ui/shadcn/badge';
import { Button } from '../ui/shadcn/button';
import { useLayoutEffect, useSyncExternalStore } from 'react';
import {
  getQueuedPrompts,
  removeQueuedPrompt,
  subscribePromptQueue,
  type QueuedPrompt,
} from '../../chat/promptQueue.ts';
import { setComposerMarkdown, focusComposer } from '../../composer/controller.ts';
import { useCurrentSessionId } from '../session-list/sessionList.bridge.ts';
import { syncComposerShellFlags } from '../../ui/composerShape.ts';
import { i18n } from '../legacy/gateway.ts';
import type { ComposerSurface } from '../../composer/types.ts';

export function ComposerQueueBanner({ surface }: { surface: ComposerSurface }) {
  const queue = useSyncExternalStore(subscribePromptQueue, getQueuedPrompts);
  const currentSessionId = useCurrentSessionId();

  const sessionQueue = queue.filter((p) => !p.sessionId || p.sessionId === currentSessionId);
  const isVisible = surface === 'chat' && sessionQueue.length > 0;

  useLayoutEffect(() => {
    syncComposerShellFlags(document);
  }, [isVisible]);

  if (!isVisible) return null;

  const first: QueuedPrompt = sessionQueue[0];
  const count = sessionQueue.length;
  const preview = first.text.length > 36 ? `${first.text.slice(0, 36)}…` : first.text;

  const handleEdit = () => {
    removeQueuedPrompt(first.id);
    setComposerMarkdown('chat', first.text);
    focusComposer('chat');
  };

  const handleCancel = () => {
    removeQueuedPrompt(first.id);
  };

  return (
    <div
      className="composer-queue-banner flex items-center justify-between gap-2 rounded-lg border border-border bg-card px-2.5 py-2 text-xs text-muted-foreground"
      role="status"
      aria-live="polite"
    >
      <div className="composer-queue-main flex min-w-0 items-center gap-1.5 overflow-hidden">
        <span className="composer-queue-icon inline-flex shrink-0 items-center text-muted-foreground" aria-hidden="true">
          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10" />
            <polyline points="12 6 12 12 16 14" />
          </svg>
        </span>
        <Badge variant="secondary" className="composer-queue-badge shrink-0">
          {count > 1 ? i18n('composer.queue.count', '{count} queued').replace('{count}', String(count)) : i18n('composer.queue.title', 'Queued prompt')}
        </Badge>
        <span className="composer-queue-text truncate text-muted-foreground" title={first.text}>
          “{preview}”
        </span>
      </div>
      <div className="composer-queue-actions flex shrink-0 items-center gap-1">
        <Button
          type="button"
          variant="ghost"
          size="xs"
          className="composer-queue-btn composer-queue-edit"
          onClick={handleEdit}
        >
          {i18n('composer.queue.edit', 'Edit')}
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          className="composer-queue-btn composer-queue-cancel"
          onClick={handleCancel}
          aria-label={i18n('composer.queue.cancel', 'Cancel')}
          title={i18n('composer.queue.cancel', 'Cancel')}
        >
          <svg aria-hidden="true" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <path d="M18 6L6 18M6 6l12 12" />
          </svg>
        </Button>
      </div>
    </div>
  );
}
