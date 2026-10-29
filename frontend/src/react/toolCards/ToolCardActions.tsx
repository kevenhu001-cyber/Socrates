import { useEffect, useRef, useState } from 'react';
import { Button } from '../ui/shadcn/button';

export interface ToolCardCopyActionProps {
  kind: 'code' | 'output' | 'sources';
  label: string;
  copiedLabel: string;
  failedLabel: string;
  hidden: boolean;
  className?: string;
  onCopy: () => Promise<void>;
}

export function ToolCardCopyAction({ kind, label, copiedLabel, failedLabel, hidden, className, onCopy }: ToolCardCopyActionProps) {
  const [feedback, setFeedback] = useState('');
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  return (
    <Button
      type="button"
      variant="ghost"
      size="xs"
      className={className || 'agent-tool-action'}
      data-tool-copy={kind}
      hidden={hidden}
      onClick={(event) => {
        event.stopPropagation();
        onCopy().then(() => setFeedback(copiedLabel)).catch(() => setFeedback(failedLabel));
        if (timer.current) clearTimeout(timer.current);
        timer.current = setTimeout(() => setFeedback(''), 1200);
      }}
    >
      {feedback || label}
    </Button>
  );
}

export function ToolOutputToggle({ collapsed, showLabel, collapseLabel, onToggle }: {
  collapsed: boolean;
  showLabel: string;
  collapseLabel: string;
  onToggle: (collapsed: boolean) => void;
}) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="xs"
      className="agent-tool-output-toggle"
      onClick={() => onToggle(!collapsed)}
    >
      {collapsed ? showLabel : collapseLabel}
    </Button>
  );
}
