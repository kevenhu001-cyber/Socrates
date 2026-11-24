import type { ReactNode } from 'react';
import { ArrowLeftIcon, type LucideIcon } from 'lucide-react';
import { Button } from '../ui/shadcn/button';
import { PageHeader } from '../ui/page/PageHeader';

/** Compatibility adapter: account pages share the PageHeader contract. */
export function AccountPageHeader({
  title,
  titleId,
  backLabel,
  backId,
  backIcon: BackIcon = ArrowLeftIcon,
  onBack,
  children,
}: {
  title: string;
  titleId: string;
  backLabel: string;
  backId: string;
  backIcon?: LucideIcon;
  onBack: () => void;
  children?: ReactNode;
}) {
  return (
    <PageHeader
      variant="account"
      title={title}
      titleId={titleId}
      titleTabIndex={-1}
      leading={
        <Button
          variant="ghost"
          size="icon-lg"
          id={backId}
          aria-label={backLabel}
          onClick={onBack}
        >
          <BackIcon aria-hidden />
        </Button>
      }
      actions={children}
    />
  );
}
