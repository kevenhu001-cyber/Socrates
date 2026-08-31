import { createRoot, type Root } from 'react-dom/client';

import { t as _t } from '../legacy/gateway';
import {
  installUsageBridge,
  useUsageDispatch,
  useUsageSnapshot,
} from './usageModal.bridge';

const OVERLAY_ID = 'usageOverlay';

function i18n(key: string, fallback: string): string {
  const v = _t(key);
  return v !== key ? v : fallback;
}

function UsageModal() {
  const snap = useUsageSnapshot();
  const dispatch = useUsageDispatch();

  return (
    <div className="usage-modal" onClick={(e) => e.stopPropagation()}>
      <div className="usage-header">
        <span className="usage-title">{i18n('usage.title', 'Token Usage')}</span>
        <button
          type="button"
          className="usage-close"
          onClick={() => dispatch.close()}
          aria-label={i18n('common.close', 'Close')}
          data-initial-focus="true"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
            <path d="M18 6 6 18M6 6l12 12" />
          </svg>
        </button>
      </div>
      <div
        className="usage-body"
        id="usageBody"
        dangerouslySetInnerHTML={{ __html: snap.bodyHtml }}
      />
    </div>
  );
}

export interface UsageModalHandle {
  overlay: HTMLElement;
  root: Root;
  destroy: () => void;
}

export function hydrateUsageModal(): UsageModalHandle | null {
  const overlay = document.getElementById(OVERLAY_ID);
  if (!overlay) return null;
  /* M2 sentinel: replaced the legacy `data-react-migration-runtime`
     attribute with `dataset.mountedBy`. */
  if (overlay.dataset.mountedBy === 'usage-modal') {
    throw new Error('Usage modal React runtime was initialized more than once.');
  }

  installUsageBridge();

  const root = createRoot(overlay);
  root.render(<UsageModal />);
  overlay.dataset.mountedBy = 'usage-modal';
  return {
    overlay,
    root,
    destroy: () => {
      root.unmount();
      delete overlay.dataset.mountedBy;
    },
  };
}
