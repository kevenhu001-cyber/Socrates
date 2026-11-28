import type { ReactNode } from 'react';
import { EmptyMessage } from '../v3';
import { cn } from 'cn';

/** PageEmptyState — the shared empty state for a standard page body. */
export function PageEmptyState({
  title,
  description,
  action,
  className,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <EmptyMessage className={cn('ui-page-empty', className)}>
      <EmptyMessage.Title>{title}</EmptyMessage.Title>
      {description ? <EmptyMessage.Description>{description}</EmptyMessage.Description> : null}
      {action ? <EmptyMessage.ActionRow>{action}</EmptyMessage.ActionRow> : null}
    </EmptyMessage>
  );
}
