import type { ReactNode } from 'react';
import { cn } from 'cn';
import { PageFrame } from '../ui/page/PageFrame';
import { PageHeader } from '../ui/page/PageHeader';
import { PageToolbar } from '../ui/page/PageToolbar';

export interface PageShellProps {
  titleId: string;
  title?: string;
  description?: ReactNode;
  eyebrow?: string;
  leading?: ReactNode;
  actions?: ReactNode;
  toolbar?: ReactNode;
  hideHeader?: boolean;
  maxWidth?: 'reading' | 'wide';
  ariaBusy?: boolean;
  ariaLive?: 'polite' | 'assertive' | 'off';
  className?: string;
  children: ReactNode;
}

/**
 * PageShell — canonical v3 subpage layout shell (see docs/design/ui-design-standard.md).
 *
 * Unifies header geometry, optional single-row toolbar, content width rhythm
 * (860px reading / 1040px wide grid), and vertical spacing across workspace,
 * scheduled, admin, exam, creation, and secondary app pages.
 */
export function PageShell({
  titleId,
  title,
  description,
  eyebrow,
  leading,
  actions,
  toolbar,
  hideHeader = false,
  maxWidth = 'reading',
  ariaBusy,
  ariaLive,
  className,
  children,
}: Readonly<PageShellProps>) {
  return (
    <PageFrame
      className={cn(
        'mx-auto flex w-full flex-col gap-5',
        maxWidth === 'wide' ? 'max-w-[1040px]' : 'max-w-[860px]',
        className,
      )}
      aria-labelledby={titleId}
      aria-busy={ariaBusy}
      aria-live={ariaLive}
      data-page-shell=""
      data-page-width={maxWidth}
    >
      {!hideHeader && title ? (
        <PageHeader
          titleId={titleId}
          title={title}
          description={description}
          eyebrow={eyebrow}
          leading={leading}
          actions={actions}
        />
      ) : null}
      {toolbar ? <PageToolbar>{toolbar}</PageToolbar> : null}
      <div className="flex min-w-0 flex-col gap-4" data-page-shell-body="">
        {children}
      </div>
    </PageFrame>
  );
}

/**
 * PageCollectionCard — single-layer 12px hairline container for structured
 * lists and status tables inside subpages (zero nested card shadows).
 */
export function PageCollectionCard({
  className,
  children,
}: Readonly<{
  className?: string;
  children: ReactNode;
}>) {
  return (
    <div
      className={cn(
        'min-w-0 overflow-hidden rounded-md border border-border bg-transparent',
        className,
      )}
      data-page-collection-card=""
    >
      {children}
    </div>
  );
}
