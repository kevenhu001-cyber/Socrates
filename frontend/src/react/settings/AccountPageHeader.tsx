import type { ReactNode } from 'react';
import { ArrowLeftIcon } from 'lucide-react';
import { Button } from '../ui/shadcn/button';

export function AccountPageHeader({
  title,
  titleId,
  backLabel,
  backId,
  onBack,
  children,
}: {
  title: string;
  titleId: string;
  backLabel: string;
  backId: string;
  onBack: () => void;
  children?: ReactNode;
}) {
  return (
    <header className="account-page-header">
      <Button variant="ghost" size="icon-lg" id={backId} aria-label={backLabel} onClick={onBack}>
        <ArrowLeftIcon aria-hidden />
      </Button>
      <div className="account-page-title">
        <h1 id={titleId} data-page-title tabIndex={-1}>
          {title}
        </h1>
      </div>
      {children}
    </header>
  );
}
