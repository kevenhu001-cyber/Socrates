import type { ReactNode } from 'react';
import { cn } from 'cn';
import { Label } from '../ui/shadcn/label';

export interface SettingsRowProps {
  htmlFor?: string;
  label: ReactNode;
  description?: ReactNode;
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
  label,
  description,
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
      <div className="flex min-w-0 flex-col gap-0.5">
        <Label htmlFor={htmlFor} className="text-sm font-medium text-foreground">
          {label}
        </Label>
        {description ? (
          <p className="m-0 text-xs leading-snug text-muted-foreground">{description}</p>
        ) : null}
      </div>
      <div className="flex shrink-0 items-center">{control}</div>
    </div>
  );
}
