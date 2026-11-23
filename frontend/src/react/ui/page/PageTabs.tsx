import { ToggleGroup, ToggleGroupItem } from '../shadcn/toggle-group';
import { cn } from 'cn';

export interface PageTabItem<T extends string> {
  value: T;
  label: string;
}

/**
 * PageTabs — one segmented range-filter grammar.
 *
 * `underline` tabs stay reserved for in-page section navigation; page
 * filters use this segmented control so Library / Projects / Plugins /
 * Scheduled no longer each invent their own pill.
 */
export function PageTabs<T extends string>({
  items,
  value,
  onChange,
  ariaLabel,
  className,
}: {
  items: ReadonlyArray<PageTabItem<T>>;
  value: T;
  onChange: (value: T) => void;
  ariaLabel: string;
  className?: string;
}) {
  return (
    <ToggleGroup
      className={cn('ui-page-tabs', className)}
      value={[value]}
      aria-label={ariaLabel}
      onValueChange={(values) => {
        const next = values[0];
        if (next) onChange(next as T);
      }}
    >
      {items.map((item) => (
        <ToggleGroupItem key={item.value} type="button" value={item.value} className="ui-page-tab">
          {item.label}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  );
}
