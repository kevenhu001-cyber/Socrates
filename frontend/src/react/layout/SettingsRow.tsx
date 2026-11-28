import type { ReactNode } from 'react';
import { cn } from 'cn';
import { Label } from '../ui/shadcn/label';

export interface SettingsRowProps {
  htmlFor?: string;
  labelId?: string;
  label: ReactNode;
  labelClassName?: string;
  description?: ReactNode;
  leading?: ReactNode;
  control: ReactNode;
  className?: string;
}

/**
 * SettingsRow — canonical v3 settings row atom (see docs/design/ui-design-standard.md).
 *
 * Enforces ChatGPT-style hairline row rhythm: 52px minimum height, subtle
 * bottom hairline divider, left-aligned label + optional description, and a
 * single trailing control slot without nested card frames.
 */
export function SettingsRow({
  htmlFor,
  labelId,
  label,
  labelClassName,
  description,
  leading,
  control,
  className,
}: Readonly<SettingsRowProps>) {
  return (
    <div
      className={cn(
        'flex min-h-[52px] items-center justify-between gap-4 border-b border-border py-3 last:border-b-0',
        className,
      )}
      data-settings-row=""
    >
      <div className="flex min-w-0 items-center gap-3">
        {leading ? <span className="flex shrink-0 items-center text-muted-foreground">{leading}</span> : null}
        <div className="flex min-w-0 flex-col gap-0.5">
          {htmlFor ? (
            <Label
              id={labelId}
              htmlFor={htmlFor}
              className={cn('text-sm font-medium text-foreground', labelClassName)}
            >
              {label}
            </Label>
          ) : (
            <span id={labelId} className={cn('text-sm font-medium text-foreground', labelClassName)}>
              {label}
            </span>
          )}
          {description ? (
            <p className="m-0 text-xs leading-snug text-muted-foreground">{description}</p>
          ) : null}
        </div>
      </div>
      <div className="flex shrink-0 items-center">{control}</div>
    </div>
  );
}
