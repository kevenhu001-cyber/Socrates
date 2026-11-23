import type { ReactNode } from 'react';
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from '../shadcn/empty';
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
    <Empty className={cn('ui-page-empty', className)}>
      <EmptyHeader>
        <EmptyTitle>{title}</EmptyTitle>
        {description ? <EmptyDescription>{description}</EmptyDescription> : null}
      </EmptyHeader>
      {action}
    </Empty>
  );
}
