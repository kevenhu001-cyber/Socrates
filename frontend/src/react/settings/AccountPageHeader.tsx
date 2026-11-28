import type { ReactNode } from 'react';
import { Icon, type IconProps } from '../../legacy/Icon';
import { Button } from '../ui/shadcn/button';
import { PageHeader } from '../ui/page/PageHeader';

/** Compatibility adapter: account pages share the PageHeader contract. */
export function AccountPageHeader({
  title,
  titleId,
  backLabel,
  backId,
  backIcon = 'chevronLeft',
  onBack,
  children,
}: {
  title: string;
  titleId: string;
  backLabel: string;
  backId: string;
  backIcon?: IconProps['name'];
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
        <Button variant="ghost" size="icon-lg" id={backId} aria-label={backLabel} onClick={onBack}>
          <Icon name={backIcon} size={20} />
        </Button>
      }
      actions={children}
    />
  );
}
