import type { MouseEvent } from 'react';
import { Button } from '../ui/shadcn/button';

export interface ArtifactControlProps {
  kind: 'retry' | 'fullscreen' | 'open';
  label: string;
  className: string;
  onClick: (event: MouseEvent<HTMLButtonElement>) => void;
  title?: string;
  i18nTitle?: string;
  i18nAria?: string;
}

export function ArtifactControl({ kind, label, className, onClick, title, i18nTitle, i18nAria }: ArtifactControlProps) {
  if (kind === 'fullscreen') {
    return (
      <Button
        type="button"
        variant="ghost"
        size="icon-xs"
        className={className}
        title={title}
        aria-label={label}
        data-i18n-title={i18nTitle}
        data-i18n-aria={i18nAria}
        onClick={onClick}
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />
        </svg>
      </Button>
    );
  }

  return (
    <Button
      type="button"
      variant={kind === 'retry' ? 'outline' : 'secondary'}
      size="sm"
      className={className}
      title={title}
      aria-label={kind === 'open' ? label : undefined}
      onClick={onClick}
    >
      {label}
    </Button>
  );
}
