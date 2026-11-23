import { DialogFrame } from '../dialog/DialogFrame';
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
  return (
    <DialogFrame
      id="vizModal"
      open={true}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      size="full"
      title={title}
      aria-label={ariaLabel(variant, title)}
      overlayClassName="viz-modal-backdrop"
      className={'viz-modal' + (variant === 'source' ? ' viz-source-modal' : '')}
      showClose={false}
      headerActions={<VizModalActions onClose={onClose} onCopy={onCopy} />}
    >
      {bodyFor(variant, content)}
    </DialogFrame>
  );
}
