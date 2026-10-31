import type { ReactNode } from 'react';
import { Button } from '../ui/shadcn/button';

export interface DetailSurfaceOptions {
  owner: string;
  title: string;
  meta?: string;
  closeLabel: string;
  content: ReactNode;
  onClose?: () => void;
}

export function DetailSurfaceView({ options, onClose }: { options: DetailSurfaceOptions | null; onClose: () => void }) {
  const closeLabel = options?.closeLabel ?? '';
  return (
    <>
      <Button
        type="button"
        variant="ghost"
        className="detail-backdrop"
        tabIndex={-1}
        aria-label={closeLabel}
        onClick={onClose}
      />
      <aside
        className="detail-surface artifact-preview-drawer"
        role="dialog"
        aria-labelledby="detailSurfaceTitle"
        data-detail-owner={options?.owner}
      >
        <header className="detail-header">
          <div className="detail-heading">
            <h2 id="detailSurfaceTitle">{options?.title ?? ''}</h2>
            <p className="detail-meta" hidden={!options?.meta}>{options?.meta ?? ''}</p>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            className="detail-close artifact-preview-close"
            aria-label={closeLabel}
            onClick={onClose}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </Button>
        </header>
        <div className="detail-body">{options?.content}</div>
      </aside>
    </>
  );
}
