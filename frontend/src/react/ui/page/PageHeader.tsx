import type { ReactNode } from 'react';
import { cn } from 'cn';

/**
 * PageHeader — the single page-heading grammar for AppPage and FocusedPage.
 *
 * Standard pages use a title/description with trailing actions. Account pages
 * use the same semantic heading with a leading back/close action and divider.
 */
export function PageHeader({
  titleId,
  title,
  description,
  eyebrow,
  leading,
  actions,
  variant = 'default',
  titleTabIndex,
  className,
}: {
  titleId: string;
  title: string;
  description?: string;
  eyebrow?: string;
  leading?: ReactNode;
  actions?: ReactNode;
  variant?: 'default' | 'account';
  titleTabIndex?: number;
  className?: string;
}) {
  const account = variant === 'account';
  return (
    <header
      className={cn(account ? 'account-page-header' : 'ui-page-header', className)}
      data-page-header
      data-page-header-variant={variant}
    >
      {leading}
      <div className={account ? 'account-page-title' : 'ui-page-heading'}>
        {eyebrow ? <p className="ui-page-eyebrow">{eyebrow}</p> : null}
        <h1 id={titleId} data-page-title tabIndex={titleTabIndex}>
          {title}
        </h1>
        {description ? <p className="ui-page-description">{description}</p> : null}
      </div>
      {actions ? (
        <div
          className={account ? 'account-page-actions' : 'ui-page-actions'}
          data-page-actions
        >
          {actions}
        </div>
      ) : null}
    </header>
  );
}
