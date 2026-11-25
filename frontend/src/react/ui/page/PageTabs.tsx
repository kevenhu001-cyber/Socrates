import { LayoutGrid, List } from 'lucide-react';
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

/** Compact icon-only sibling of PageTabs for grid/list directory views. */
export function PageViewToggle({
  value,
  onChange,
  ariaLabel,
  gridLabel,
  listLabel,
  className,
  itemClassName,
  gridI18nKey,
  listI18nKey,
}: {
  value: 'grid' | 'list';
  onChange: (value: 'grid' | 'list') => void;
  ariaLabel: string;
  gridLabel: string;
  listLabel: string;
  className?: string;
  itemClassName?: string;
  gridI18nKey?: string;
  listI18nKey?: string;
}) {
  return (
    <ToggleGroup
      className={cn('ui-page-tabs ui-page-view-toggle', className)}
      value={[value]}
      aria-label={ariaLabel}
      onValueChange={(values) => {
        const next = values[0];
        if (next === 'grid' || next === 'list') onChange(next);
      }}
    >
      <ToggleGroupItem
        type="button"
        value="grid"
        className={cn('ui-page-tab', itemClassName)}
        aria-label={gridLabel}
        data-i18n-aria={gridI18nKey}
      >
        <LayoutGrid aria-hidden="true" />
      </ToggleGroupItem>
      <ToggleGroupItem
        type="button"
        value="list"
        className={cn('ui-page-tab', itemClassName)}
        aria-label={listLabel}
        data-i18n-aria={listI18nKey}
      >
        <List aria-hidden="true" />
      </ToggleGroupItem>
    </ToggleGroup>
  );
}
