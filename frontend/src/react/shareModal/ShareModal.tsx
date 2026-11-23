import { DialogFrame } from '../dialog/DialogFrame';
import { createRootSlot } from '../lib/boot/ownedRoot';
import { ensureBodyContainer } from '../lib/boot/mountContainer';
import { useShareDispatch, useShareSnapshot } from './shareModal.store';
import { ShareLinkPanel } from './ShareLinkPanel';
import { ShareVisibilityOptions } from './ShareVisibilityOptions';
import { shareText } from './shareText';
import { i18n } from '../../ui/legacyI18n.ts';

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

  return (
    <DialogFrame
      id={OVERLAY_ID}
      open={snap.open}
      onOpenChange={(open) => {
        if (!open) dispatch.close();
      }}
      size="sm"
      title={shareText('share.title', 'Share conversation')}
      aria-label={i18n('chrome.shareChat', 'Share chat')}
      data-i18n-aria="chrome.shareChat"
      overlayClassName="share-overlay"
      className="share-modal"
      closeClassName="share-close"
      keepMounted
    >
      <ShareVisibilityOptions visibility={snap.visibility} onSelect={dispatch.selectVis} />
      <ShareLinkPanel
        hasLink={hasLink}
        shareUrl={snap.shareUrl}
        error={snap.error}
        status={snap.status}
        onRevoke={dispatch.revokeLink}
        onCreate={dispatch.createLink}
      />
    </DialogFrame>
  );
}

const rootSlot = createRootSlot('share-modal');

/**
 * Mount the React-owned share modal into its own body-level root.
 */
export function mountShareModal(): void {
  const container = ensureBodyContainer('shareModalReactRoot');
  rootSlot.mount(container, <ShareModal />);
}

export function unmountShareModal(): void {
  rootSlot.destroy();
}
