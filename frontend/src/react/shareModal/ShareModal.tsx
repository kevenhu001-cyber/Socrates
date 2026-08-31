import { createRoot, type Root } from 'react-dom/client';

import { t as _t } from '../legacy/gateway';
import {
  installShareBridge,
  useShareDispatch,
  useShareSnapshot,
} from './shareModal.bridge';
import type { ShareVisibility } from './types';
import { Icon } from '../../ui/Icon';

const OVERLAY_ID = 'shareOverlay';

function i18n(key: string, fallback: string): string {
  const v = _t(key);
  return v !== key ? v : fallback;
}

function VisibilityOption({
  vis,
  currentVis,
  labelKey,
  labelFallback,
  descKey,
  descFallback,
  onSelect,
}: {
  vis: ShareVisibility;
  currentVis: ShareVisibility;
  labelKey: string;
  labelFallback: string;
  descKey: string;
  descFallback: string;
  onSelect: (vis: ShareVisibility) => void;
}) {
  const selected = vis === currentVis;
  return (
    <div
      className={`share-opt${selected ? ' selected' : ''}`}
      role="radio"
      tabIndex={0}
      aria-checked={selected ? 'true' : 'false'}
      onClick={() => onSelect(vis)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onSelect(vis);
        }
      }}
    >
      <div className="share-opt-radio">
        <span className="share-opt-radio-dot" />
      </div>
      <div className="share-opt-body">
        <div className="share-opt-title">{i18n(labelKey, labelFallback)}</div>
        <div className="share-opt-desc">{i18n(descKey, descFallback)}</div>
      </div>
    </div>
  );
}

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
        <span className="share-title">{i18n('share.title', 'Share conversation')}</span>
        <button
          type="button"
          className="share-close"
          aria-label="Close"
          onClick={() => dispatch.close()}
        >
          <Icon name="close" size={16} strokeWidth={2.5} />
        </button>
      </div>
      <div className="share-visibility" role="radiogroup" aria-label={i18n('share.visibilityLabel', 'Link visibility')}>
        <VisibilityOption
          vis="public"
          currentVis={snap.visibility}
          labelKey="share.publicTitle"
          labelFallback="Anyone with the link"
          descKey="share.publicDesc"
          descFallback="No sign-in required. Anyone who has the link can view this conversation."
          onSelect={dispatch.selectVis}
        />
        <VisibilityOption
          vis="private"
          currentVis={snap.visibility}
          labelKey="share.privateTitle"
          labelFallback="Only you"
          descKey="share.privateDesc"
          descFallback="Must be logged into your account to view. Still shared via link."
          onSelect={dispatch.selectVis}
        />
      </div>

      <div
        className={`share-link-area${hasLink ? '' : ' hidden'}`}
        id="shareLinkArea"
      >
        <input
          className="share-link-input"
          id="shareLinkInput"
          name="shareLinkInput"
          type="text"
          readOnly
          onClick={(e) => (e.target as HTMLInputElement).select()}
          aria-label="Share link"
          value={snap.shareUrl}
        />
        <button
          type="button"
          className="share-copy-btn"
          id="shareCopyBtn"
          onClick={() => dispatch.copyLink()}
        >
          {i18n('share.copy', 'Copy')}
        </button>
      </div>

      <div
        className={`${hasLink ? '' : 'hidden'}`}
        id="shareRevokeArea"
        style={hasLink ? { textAlign: 'center' as const } : undefined}
      >
        <button
          type="button"
          className="share-revoke"
          onClick={() => dispatch.revokeLink()}
        >
          {'× ' + i18n('share.revoke', 'Revoke share link')}
        </button>
      </div>

      <div
        className={`share-error${snap.error ? '' : ' hidden'}`}
        id="shareError"
      >
        {snap.error}
      </div>

      <div
        className={`share-status${snap.status ? '' : ' hidden'}`}
        id="shareStatus"
      >
        {snap.status}
      </div>

      <div
        id="shareCreateArea"
        style={{ textAlign: 'center', marginTop: 4 }}
      >
        <button
          type="button"
          className="settings-btn primary"
          id="shareCreateBtn"
          onClick={() => dispatch.createLink()}
          style={{ marginTop: 8 }}
        >
          {i18n('share.create', 'Create share link')}
        </button>
      </div>
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
  /* M2 sentinel: replaced the legacy `data-react-migration-runtime`
     attribute with `dataset.mountedBy`. */
  if (overlay.dataset.mountedBy === 'share-modal') {
    throw new Error('Share modal React runtime was initialized more than once.');
  }

  installShareBridge();

  const root = createRoot(overlay);
  root.render(<ShareModal />);
  overlay.dataset.mountedBy = 'share-modal';
  return {
    overlay,
    root,
    destroy: () => {
      root.unmount();
      delete overlay.dataset.mountedBy;
    },
  };
}
