import { Icon } from '../../../legacy/Icon';
import { Input } from '../v3';
import { Label } from '../v3';
import { cn } from 'cn';

/** PageSearchField — the shared page search control (42px pill). */
export function PageSearchField({
  label,
  query,
  onQuery,
  className,
}: {
  label: string;
  query: string;
  onQuery: (value: string) => void;
  className?: string;
}) {
  return (
    <Label className={cn('ui-page-search', className)}>
      <Icon name="search" size={18} />
      <Input
        type="search"
        value={query}
        onChange={(event) => onQuery(event.target.value)}
        placeholder={label}
        aria-label={label}
      />
    </Label>
  );
}
