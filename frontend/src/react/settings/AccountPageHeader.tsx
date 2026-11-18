import type { ReactNode } from 'react';
import { ArrowLeftIcon } from 'lucide-react';
import { AccountPageTitle } from '@socrates/ui/settings';
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
        <AccountPageTitle id={titleId} title={title} />
      </div>
      {children}
    </header>
  );
}
