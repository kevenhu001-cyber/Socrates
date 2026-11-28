import { LayoutGrid, List } from 'lucide-react';
import { SegmentedControl } from '../v3';
import { cn } from 'cn';

export interface PageTabItem<T extends string> {
  value: T;
  label: string;
}

/**
 * PageTabs — one segmented range-filter grammar backed by @openai/apps-sdk-ui
 * SegmentedControl so Library / Projects / Plugins / Scheduled share one pill.
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
    <SegmentedControl
      className={cn('ui-page-tabs', className)}
      value={value}
      size="sm"
      pill
      aria-label={ariaLabel}
      onChange={(next) => {
        if (next) onChange(next as T);
      }}
    >
      {items.map((item) => (
        <SegmentedControl.Option key={item.value} value={item.value}>
          <span className="ui-page-tab">{item.label}</span>
        </SegmentedControl.Option>
      ))}
    </SegmentedControl>
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
    <SegmentedControl
      className={cn('ui-page-tabs ui-page-view-toggle', className)}
      value={value}
      size="sm"
      pill
      aria-label={ariaLabel}
      onChange={(next) => {
        if (next === 'grid' || next === 'list') onChange(next);
      }}
    >
      <SegmentedControl.Option value="grid" aria-label={gridLabel}>
        <span
          className={cn('ui-page-tab inline-flex items-center justify-center', itemClassName)}
          data-i18n-aria={gridI18nKey}
        >
          <LayoutGrid aria-hidden="true" size={15} />
        </span>
      </SegmentedControl.Option>
      <SegmentedControl.Option value="list" aria-label={listLabel}>
        <span
          className={cn('ui-page-tab inline-flex items-center justify-center', itemClassName)}
          data-i18n-aria={listI18nKey}
        >
          <List aria-hidden="true" size={15} />
        </span>
      </SegmentedControl.Option>
    </SegmentedControl>
  );
}
