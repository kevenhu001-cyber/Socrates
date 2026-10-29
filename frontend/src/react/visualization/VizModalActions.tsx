import { useState } from 'react';
import { Check, Copy, X } from 'lucide-react';
import { Button } from '../ui/shadcn/button';

export interface VizModalActionsProps {
  onClose: () => void;
  onCopy?: () => Promise<void>;
}

export function VizModalActions({ onClose, onCopy }: VizModalActionsProps) {
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'failed'>('idle');

  async function copySource() {
    if (!onCopy) return;
    try {
      await onCopy();
      setCopyState('copied');
    } catch {
      setCopyState('failed');
    }
    window.setTimeout(() => setCopyState('idle'), 1200);
  }

  const copyLabel = copyState === 'copied' ? 'Copied' : copyState === 'failed' ? 'Copy failed' : 'Copy source';

  return (
    <>
      {onCopy && (
        <Button variant="outline" size="sm" className="viz-source-copy" onClick={copySource}>
          {copyState === 'copied' ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
          {copyLabel}
        </Button>
      )}
      <Button variant="ghost" size="icon-sm" className="viz-modal-close" aria-label="Close" title="Close" onClick={onClose}>
        <X aria-hidden="true" />
      </Button>
    </>
  );
}
