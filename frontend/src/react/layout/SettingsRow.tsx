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
 * SettingsRow — canonical v3 ChatGPT-style settings row atom.
 *
 * Enforces minimalist commercial-app rhythm: 52px minimum height, subtle 1px
 * hairline bottom divider, crisp 14px medium label + optional muted caption,
 * and a single right-aligned control without nested card frames.
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
        'flex min-h-[52px] items-center justify-between gap-6 border-b border-border py-3.5 last:border-b-0',
        className,
      )}
      data-settings-row=""
    >
      <div className="flex min-w-0 items-center gap-3">
        {leading ? (
          <span className="flex shrink-0 items-center text-muted-foreground">{leading}</span>
        ) : null}
        <div className="flex min-w-0 flex-col gap-0.5">
          {htmlFor ? (
            <Label
              id={labelId}
              htmlFor={htmlFor}
              className={cn('text-sm font-medium leading-5 text-foreground', labelClassName)}
            >
              {label}
            </Label>
          ) : (
            <span
              id={labelId}
              className={cn('text-sm font-medium leading-5 text-foreground', labelClassName)}
            >
              {label}
            </span>
          )}
          {description ? (
            <p className="m-0 text-xs leading-relaxed text-muted-foreground">{description}</p>
          ) : null}
        </div>
      </div>
      <div className="flex shrink-0 items-center">{control}</div>
    </div>
  );
}
