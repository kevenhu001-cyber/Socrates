import { Button as UiButton } from '../ui/Button';
import { mountOwnedRoot } from '../lib/boot/ownedRoot';
import type { Root } from 'react-dom/client';

import {
  useShareDispatch,
  useShareSnapshot,
} from './shareModal.store';
import { Icon } from '../../ui/Icon';
import { ShareLinkPanel } from './ShareLinkPanel';
import { ShareVisibilityOptions } from './ShareVisibilityOptions';
import { shareText } from './shareText';

const OVERLAY_ID = 'shareOverlay';

/**
 * Always renders the full modal structure matching index.html so React
 * hydration can adopt the existing DOM. State changes only toggle classes
 * and update text — the element tree stays stable.
 */
function ShareModal() {
  const snap = useShareSnapshot();
  const dispatch = useShareDispatch();
  const hasLink = !!snap.shareToken && !!snap.shareUrl;

  return (
    <div className="share-modal" onClick={(e) => e.stopPropagation()}>
      <div className="share-header">
        <span className="share-title">{shareText('share.title', 'Share conversation')}</span>
        <UiButton
          type="button"
          className="share-close"
          aria-label={shareText('common.close', 'Close')}
          onClick={() => dispatch.close()}
        >
          <Icon name="close" size={16} strokeWidth={2.5} />
        </UiButton>
      </div>
      <ShareVisibilityOptions visibility={snap.visibility} onSelect={dispatch.selectVis} />
      <ShareLinkPanel
        hasLink={hasLink}
        shareUrl={snap.shareUrl}
        error={snap.error}
        status={snap.status}
        onCopy={dispatch.copyLink}
        onRevoke={dispatch.revokeLink}
        onCreate={dispatch.createLink}
      />
    </div>
  );
}

export interface ShareModalHandle {
  overlay: HTMLElement;
  root: Root;
  destroy: () => void;
}

export function hydrateShareModal(): ShareModalHandle | null {
  const overlay = document.getElementById(OVERLAY_ID);
  if (!overlay) return null;
  return { overlay, ...mountOwnedRoot(overlay, 'share-modal', <ShareModal />) };
}
