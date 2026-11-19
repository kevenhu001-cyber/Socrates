import { useEffect, useLayoutEffect, useRef } from 'react';
import { VizModalActions } from './VizModalActions';
import { nativeIslandFrameAttributes } from '../../ui/nativeIslandFrame';

export interface VizModalProps {
  variant: 'sandbox' | 'raw' | 'source';
  content: string;
  title: string;
  onClose: () => void;
  onCopy?: () => Promise<void>;
}

function ariaLabel(variant: VizModalProps['variant'], title: string): string {
  if (variant === 'source') return title.endsWith(' source') ? title : title + ' source';
  return variant === 'sandbox' ? 'Canvas fullscreen' : title || 'Fullscreen';
}

function bodyFor(variant: VizModalProps['variant'], content: string) {
  if (variant === 'sandbox') {
    return (
      <div className="viz-modal-body">
        <iframe
          {...nativeIslandFrameAttributes({
            kind: 'visualization',
            html: content,
            title: 'Canvas fullscreen',
          })}
          style={{
            width: '100%',
            height: '100%',
            border: 0,
            background: 'transparent',
            display: 'block',
          }}
        />
      </div>
    );
  }
  if (variant === 'raw') {
    return (
      <div
        className="viz-modal-body viz-modal-body-raw"
        dangerouslySetInnerHTML={{ __html: content }}
      />
    );
  }
  return (
    <div className="viz-modal-body viz-source-body">
      <pre className="viz-source-code">{content}</pre>
    </div>
  );
}

/**
 * React owns the fullscreen visualization shell. The caller still supplies
 * the already-sanitized srcdoc/HTML body, but backdrop, dialog semantics,
 * Escape handling, focus placement and the shared close/copy actions are one
 * declarative surface instead of three imperative builders.
 */
export function VizModal({ variant, content, title, onClose, onCopy }: VizModalProps) {
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  useLayoutEffect(() => {
    /* Match the old modal: the close action is the initial focused control,
       and Escape then returns focus to the opener from the caller. */
    dialogRef.current?.querySelector<HTMLButtonElement>('.viz-modal-actions button')?.focus();
  }, []);

  return (
    <div
      className="viz-modal-backdrop"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={dialogRef}
        className={'viz-modal' + (variant === 'source' ? ' viz-source-modal' : '')}
        role="dialog"
        aria-label={ariaLabel(variant, title)}
        aria-modal="true"
      >
        <div className="viz-modal-head">
          <span className="viz-modal-title">{title}</span>
          <div className="viz-modal-actions">
            <VizModalActions onClose={onClose} onCopy={onCopy} />
          </div>
        </div>
        {bodyFor(variant, content)}
      </div>
    </div>
  );
}
