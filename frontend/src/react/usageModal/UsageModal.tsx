import { Button } from '../ui/shadcn/button';
import { ToggleGroup, ToggleGroupItem } from '../ui/shadcn/toggle-group';
import { mountOwnedRoot } from '../lib/boot/ownedRoot';
import type { Root } from 'react-dom/client';

import { t as _t } from '../legacy/gateway.ts';
import {
  useUsageDispatch,
  useUsageSnapshot,
} from './usageModal.store';

const OVERLAY_ID = 'usageOverlay';

function i18n(key: string, fallback: string): string {
  const v = _t(key);
  return v !== key ? v : fallback;
}

function UsagePeriodControls({ period }: { period: 'year' | 'month' }) {
  return (
    <ToggleGroup
      className="usage-period-tabs"
      value={[period]}
      variant="outline"
      size="sm"
      spacing={1}
      aria-label={i18n('usage.period', 'Usage period')}
    >
      <ToggleGroupItem type="button" className="usage-period-tab" value="year" data-usage-period="year">
        {i18n('usage.last12Months', 'Last 12 months')}
      </ToggleGroupItem>
      <ToggleGroupItem type="button" className="usage-period-tab" value="month" data-usage-period="month">
        {i18n('usage.thisMonth', 'This month')}
      </ToggleGroupItem>
    </ToggleGroup>
  );
}

function UsageModal() {
  const snap = useUsageSnapshot();
  const dispatch = useUsageDispatch();

  return (
    <div className="usage-modal" onClick={(e) => e.stopPropagation()}>
      <div className="usage-header">
        <span className="usage-title">{i18n('usage.title', 'Token Usage')}</span>
        <Button
          variant="ghost"
          size="icon-sm"
          type="button"
          className="usage-close"
          onClick={() => dispatch.close()}
          aria-label={i18n('common.close', 'Close')}
          data-initial-focus="true"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
            <path d="M18 6 6 18M6 6l12 12" />
          </svg>
        </Button>
      </div>
      <div className="usage-body" id="usageBody">
        {(() => {
          const parts = snap.bodyHtml.split(/<div data-usage-period-placeholder(?:="")?><\/div>/);
          if (parts.length === 1) return <div className="contents" dangerouslySetInnerHTML={{ __html: snap.bodyHtml }} />;
          return <>
            <div className="contents" dangerouslySetInnerHTML={{ __html: parts[0] }} />
            <UsagePeriodControls period={snap.period} />
            <div className="contents" dangerouslySetInnerHTML={{ __html: parts.slice(1).join('<div data-usage-period-placeholder></div>') }} />
          </>;
        })()}
      </div>
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
  return { overlay, ...mountOwnedRoot(overlay, 'usage-modal', <UsageModal />) };
}
