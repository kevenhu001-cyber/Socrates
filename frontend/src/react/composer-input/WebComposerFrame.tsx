import type { ReactNode } from 'react';
import { ComposerControls, type ComposerControlsProps } from '@socrates/ui/composer';

interface WebComposerFrameProps {
  focused: boolean;
  expanded: boolean;
  compact: boolean;
  topVisible: boolean;
  top: ReactNode;
  body: ReactNode;
  hidden: ReactNode;
  controls: Omit<ComposerControlsProps, 'compact'>;
}

/** One Web DOM tree, one stylesheet owner, no positioned control replicas.
 * The editor survives the desktop-to-phone grid reflow without remounting.
 * Shared controls provide behavior and accessible labels, not frame geometry.
 */
export function WebComposerFrame({
  focused,
  expanded,
  compact,
  topVisible,
  top,
  body,
  hidden,
  controls,
}: WebComposerFrameProps) {
  return (
    <div
      data-composer-frame=""
      data-layout="inline"
      data-focused={String(focused)}
      data-expanded={String(expanded)}
    >
      <div data-composer-slot="top" data-visible={String(topVisible)}>
        {top}
      </div>
      <div data-composer-slot="inline">
        <ComposerControls {...controls} compact={compact} part="leading" />
        <div data-composer-slot="body">{body}</div>
        <div data-composer-slot="trailing">
          <ComposerControls {...controls} compact={compact} part="trailing" />
        </div>
      </div>
      {hidden}
    </div>
  );
}
