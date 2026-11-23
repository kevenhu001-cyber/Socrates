import type { ReactNode } from 'react';
import { cn } from 'cn';

/**
 * PageHeader — the single page-heading grammar.
 *
 * One `h1` per page (`data-page-title` is the contract used by tests and the
 * page guard), an optional description and a fixed trailing action slot.
 */
export function PageHeader({
  titleId,
  title,
  description,
  eyebrow,
  actions,
  className,
}: {
  titleId: string;
  title: string;
  description?: string;
  eyebrow?: string;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <header className={cn('ui-page-header', className)}>
      <div className="ui-page-heading">
        {eyebrow ? <p className="ui-page-eyebrow">{eyebrow}</p> : null}
        <h1 id={titleId} data-page-title>
          {title}
        </h1>
        {description ? <p className="ui-page-description">{description}</p> : null}
      </div>
      {actions ? (
        <div className="ui-page-actions" data-page-actions>
          {actions}
        </div>
      ) : null}
    </header>
  );
}
