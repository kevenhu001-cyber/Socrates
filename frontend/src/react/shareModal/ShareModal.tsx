import { Button as UiButton } from '../ui/Button';
import { createRootSlot } from '../lib/boot/ownedRoot';
import { useEffect } from 'react';
import { cn } from 'cn';

import {
  useShareDispatch,
  useShareSnapshot,
} from './shareModal.store';
import { Icon } from '../../ui/Icon';
import { ShareLinkPanel } from './ShareLinkPanel';
import { ShareVisibilityOptions } from './ShareVisibilityOptions';
import { shareText } from './shareText';
import { i18n } from '../legacy/gateway';
import { installModalA11y } from '../../ui/modalA11y.ts';

const OVERLAY_ID = 'shareOverlay';

/**
 * Renders the whole modal, overlay included. React owns the surface: the
 * static `#shareOverlay` markup was removed from index.html, so the legacy
 * module only publishes the open flag and the link state.
 */
function ShareModal() {
  const snap = useShareSnapshot();
  const dispatch = useShareDispatch();
  const hasLink = !!snap.shareToken && !!snap.shareUrl;

  /* The overlay element exists only once React has rendered it, so the
     Esc/focus wiring is installed from here. */
  useEffect(() => {
    installModalA11y({ overlayId: OVERLAY_ID, closeFn: () => dispatch.close() });
    /* The close function is stable for the lifetime of the modal. */
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div
      className={cn('share-overlay', !snap.open && 'hidden')}
      id={OVERLAY_ID}
      role="dialog"
      aria-modal="true"
      aria-label={i18n('chrome.shareChat', 'Share chat')}
      data-i18n-aria="chrome.shareChat"
    >
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
          onRevoke={dispatch.revokeLink}
          onCreate={dispatch.createLink}
        />
      </div>
    </div>
  );
}

const rootSlot = createRootSlot('share-modal');

/**
 * Mount the React-owned share modal into its own body-level root.
 */
export function mountShareModal(): void {
  let container = document.getElementById('shareModalReactRoot');
  if (!container) {
    container = document.createElement('div');
    container.id = 'shareModalReactRoot';
    document.body.appendChild(container);
  }
  rootSlot.mount(container, <ShareModal />);
}

export function unmountShareModal(): void {
  rootSlot.destroy();
}
