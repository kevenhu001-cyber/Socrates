import type { ReactNode } from 'react';
import { cn } from 'cn';

export interface SectionCardProps {
  title?: ReactNode;
  description?: ReactNode;
  badge?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  headerClassName?: string;
  contentClassName?: string;
  id?: string;
  'data-testid'?: string;
}

/**
 * SectionCard — standardized card container for settings, profile, admin,
 * study and exam sections.
 */
export function SectionCard({
  title,
  description,
  badge,
  actions,
  children,
  className,
  headerClassName,
  contentClassName,
  id,
  'data-testid': testId,
}: SectionCardProps) {
  const hasHeader = Boolean(title || description || badge || actions);
  return (
    <section
      className={cn('ui-section-card', className)}
      id={id}
      data-testid={testId}
      data-section-card
    >
      {hasHeader ? (
        <div className={cn('ui-section-card-header', headerClassName)}>
          {badge ? <div className="ui-section-card-badge">{badge}</div> : null}
          <div className="ui-section-card-heading">
            {title ? <h2 className="ui-section-card-title">{title}</h2> : null}
            {description ? <p className="ui-section-card-description">{description}</p> : null}
          </div>
          {actions ? <div className="ui-section-card-actions">{actions}</div> : null}
        </div>
      ) : null}
      <div className={cn('ui-section-card-content', contentClassName)}>{children}</div>
    </section>
  );
}
