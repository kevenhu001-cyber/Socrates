import type { ReactNode } from 'react';
import { Button } from '../ui/Button';
import { FileIcon } from './FileIcon';

export interface FileCardProps {
  name: string;
  size?: number;
  status?: 'uploading' | 'done' | 'error';
  error?: string;
  subCaption?: string;
  onRetry?: () => void;
  onRemove?: () => void;
  onOpen?: () => void;
  href?: string;
  className?: string;
}

export function getFileExtension(name: string | undefined): string {
  if (!name) return '';
  const dot = name.lastIndexOf('.');
  if (dot < 0 || dot === name.length - 1) return '';
  return name.slice(dot + 1).toUpperCase();
}

export function formatFileSize(bytes?: number): string {
  const value = Number(bytes);
  if (!Number.isFinite(value) || value <= 0) return '';
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(value < 10 * 1024 ? 1 : 0)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

const REMOVE_ICON = (
  <svg
    viewBox="0 0 24 24"
    width="12"
    height="12"
    fill="none"
    stroke="currentColor"
    strokeWidth="2.5"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d="M18 6L6 18M6 6l12 12" />
  </svg>
);

const RETRY_ICON = (
  <svg
    viewBox="0 0 24 24"
    width="18"
    height="18"
    fill="none"
    stroke="currentColor"
    strokeWidth="2.2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d="M21 12a9 9 0 1 1-2.64-6.36" />
    <path d="M21 3v6h-6" />
  </svg>
);

function renderIconNode(ext: string, status?: string, onRetry?: () => void): ReactNode {
  if (status === 'uploading') {
    return <span className="file-card-spinner" aria-hidden="true" />;
  }
  if (status === 'error' && onRetry) {
    return (
      <Button
        variant="plain"
        className="file-card-retry-btn"
        aria-label="Retry upload"
        onClick={(e) => {
          e.stopPropagation();
          onRetry();
        }}
      >
        {RETRY_ICON}
      </Button>
    );
  }
  return <FileIcon ext={ext} />;
}

function resolveCardClasses(
  editable: boolean,
  status: string,
  clickable: boolean,
  extra: string,
): string {
  return [
    'file-card',
    'attachment-chip',
    'is-file',
    editable ? 'editable' : '',
    status === 'error' ? 'error' : '',
    status === 'uploading' ? 'uploading pending' : '',
    clickable ? 'clickable' : '',
    extra,
  ]
    .filter(Boolean)
    .join(' ');
}

function FileCardBody({
  iconNode,
  name,
  description,
  onRemove,
}: {
  iconNode: ReactNode;
  name: string;
  description: string;
  onRemove?: () => void;
}) {
  return (
    <>
      <div className="file-card-icon">{iconNode}</div>
      <div className="file-card-content">
        <div className="file-card-caption" title={name}>
          {name}
        </div>
        <div className="file-card-subcaption" title={description}>
          {description}
        </div>
      </div>
      {onRemove ? (
        <Button
          variant="plain"
          className="file-card-remove"
          aria-label="Delete attachment"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onRemove();
          }}
        >
          {REMOVE_ICON}
        </Button>
      ) : null}
    </>
  );
}

export function FileCard({
  name,
  size,
  status = 'done',
  error,
  subCaption,
  onRetry,
  onRemove,
  onOpen,
  href,
  className = '',
}: FileCardProps) {
  const ext = getFileExtension(name);
  const formattedSize = formatFileSize(size);
  const fallbackSub = [ext, formattedSize].filter(Boolean).join(' · ');
  const description = error || subCaption || fallbackSub;

  const iconNode = renderIconNode(ext, status, onRetry);
  const isClickable = Boolean(href || onOpen || (status === 'error' && onRetry));

  const handleClick = (e: React.MouseEvent) => {
    if (status === 'error' && onRetry) {
      e.preventDefault();
      onRetry();
      return;
    }
    if (onOpen) onOpen();
  };

  const cardClasses = resolveCardClasses(Boolean(onRemove), status, isClickable, className);
  const body = (
    <FileCardBody iconNode={iconNode} name={name} description={description} onRemove={onRemove} />
  );
  /* The reference card is titled by its file name; only a failure swaps the
     title for the reason so the retry affordance explains itself. */
  const cardTitle = status === 'error' && description ? description : name;

  if (href) {
    return (
      <a
        className={cardClasses}
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        title={cardTitle}
        onClick={handleClick}
      >
        {body}
      </a>
    );
  }

  return (
    <div
      className={cardClasses}
      title={cardTitle}
      onClick={isClickable ? handleClick : undefined}
      role={isClickable ? 'button' : undefined}
      tabIndex={isClickable ? 0 : undefined}
      onKeyDown={
        isClickable
          ? (e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                handleClick(e as unknown as React.MouseEvent);
              }
            }
          : undefined
      }
    >
      {body}
    </div>
  );
}
