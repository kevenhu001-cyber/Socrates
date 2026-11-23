import { Search } from 'lucide-react';
import { Input } from '../shadcn/input';
import { Label } from '../shadcn/label';
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
      <Search aria-hidden="true" />
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
