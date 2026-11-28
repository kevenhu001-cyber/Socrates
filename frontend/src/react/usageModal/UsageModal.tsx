import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties, MouseEvent as ReactMouseEvent } from 'react';
import { SegmentedControl } from '../ui/v3';
import { createRootSlot } from '../lib/boot/ownedRoot';
import { ensureBodyContainer } from '../lib/boot/mountContainer';
import { DialogFrame } from '../dialog/DialogFrame';

import { t as _t } from '../../ui/legacyI18n.ts';
import {
  beagleUsageSummary,
  collectUsageEntries,
  monthlyUsageSummaries,
  usageCalendarWeeks,
  usageLevel,
  usageMonthLabels,
  type UsageCalendarDay,
  type UsagePeriod,
} from '../../legacy/usageModel.ts';
import { loadUsagePeriod } from '../../legacy/usage.ts';
import { useUsageDispatch, useUsageSnapshot } from './usageModal.store';

const OVERLAY_ID = 'usageOverlay';

function i18n(key: string, fallback: string): string {
  const value = _t(key);
  return value !== key ? value : fallback;
}

function UsagePeriodControls({
  period,
  onChange,
}: {
  period: UsagePeriod;
  onChange: (period: UsagePeriod) => void;
}) {
  return (
    <SegmentedControl
      className="usage-period-tabs"
      value={period}
      size="sm"
      pill
      aria-label={i18n('usage.period', 'Usage period')}
      onChange={(nextPeriod) => {
        if (nextPeriod === 'year' || nextPeriod === 'month') onChange(nextPeriod);
      }}
    >
      <SegmentedControl.Option value="year">
        <span className="usage-period-tab" data-usage-period="year">
          {i18n('usage.last12Months', 'Last 12 months')}
        </span>
      </SegmentedControl.Option>
      <SegmentedControl.Option value="month">
        <span className="usage-period-tab" data-usage-period="month">
          {i18n('usage.thisMonth', 'This month')}
        </span>
      </SegmentedControl.Option>
    </SegmentedControl>
  );
}

function UsageLoading({ errorKey }: { errorKey: string | null }) {
  if (errorKey) {
    const fallback =
      errorKey === 'usage.failedGeneric'
        ? 'Failed to load usage data.'
        : 'Failed to load usage data. Make sure you are signed in.';
    return (
      <div className="usage-loading" style={{ color: 'var(--ui-danger)' }}>
        {i18n(errorKey, fallback)}
      </div>
    );
  }
  return (
    <div className="usage-loading">
      <span className="loading">
        <span />
        <span />
        <span />
      </span>{' '}
      {i18n('usage.loading', 'Loading usage data…')}
    </div>
  );
}

function UsageSummary({
  entries,
  totalTokens,
  totalMsgs,
}: {
  entries: number;
  totalTokens: number;
  totalMsgs: number;
}) {
  const averageTokens = entries > 0 ? Math.round(totalTokens / entries).toLocaleString() : '0';
  const averageMessages = entries > 0 ? Math.round(totalMsgs / entries).toLocaleString() : '0';
  return (
    <div className="usage-summary">
      <div className="usage-stat">
        <div className="usage-stat-val">{totalTokens.toLocaleString()}</div>
        <div className="usage-stat-lbl">Total tokens</div>
      </div>
      <div className="usage-stat">
        <div className="usage-stat-val">{totalMsgs.toLocaleString()}</div>
        <div className="usage-stat-lbl">Messages</div>
      </div>
      <div className="usage-stat">
        <div className="usage-stat-val">{averageTokens}</div>
        <div className="usage-stat-lbl">Avg tokens / active day</div>
      </div>
      <div className="usage-stat">
        <div className="usage-stat-val">{averageMessages}</div>
        <div className="usage-stat-lbl">Avg msgs / active day</div>
      </div>
    </div>
  );
}

interface UsageTooltip {
  date: string;
  tokens: number;
  msgs: number;
  anchor: { left: number; top: number; width: number };
}

function UsageCalendar({
  weeks,
  maxDay,
  onDayEnter,
  onDayLeave,
}: {
  weeks: UsageCalendarDay[][];
  maxDay: number;
  onDayEnter: (event: ReactMouseEvent<HTMLDivElement>, day: UsageCalendarDay) => void;
  onDayLeave: () => void;
}) {
  const monthLabels = usageMonthLabels(weeks);
  let monthIndex = 0;
  const dayLabels = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  return (
    <>
      <div className="usage-calendar-wrap">
        <div className="usage-calendar">
          <div className="usage-cal-day-lbl" />
          {weeks.map((_week, column) => {
            let label = '';
            if (monthIndex < monthLabels.length && monthLabels[monthIndex].col === column) {
              label = monthLabels[monthIndex].label;
              monthIndex += 1;
            }
            return (
              <div
                key={`month-${column}`}
                style={{
                  fontSize: 'calc(8px * var(--app-font-scale, 1))',
                  color: 'var(--ui-text-tertiary)',
                  textAlign: 'center',
                }}
              >
                {label}
              </div>
            );
          })}
          {dayLabels
            .map((label) => (
              <div className="usage-cal-day-lbl" key={`day-label-${label}`}>
                {label}
              </div>
            ))
            .flatMap((labelNode, row) => [
              labelNode,
              ...weeks.map((week, column) => {
                const day = week[row];
                if (!day) return <div key={`empty-${row}-${column}`} />;
                const level = day.tokens > 0 ? usageLevel(day.tokens, maxDay) : 0;
                return (
                  <div
                    key={day.date}
                    className={`usage-cal-day lv${level}`}
                    data-date={day.date}
                    data-tokens={day.tokens}
                    data-msgs={day.msgs}
                    onMouseEnter={(event) => onDayEnter(event, day)}
                    onMouseLeave={onDayLeave}
                  />
                );
              }),
            ])}
        </div>
      </div>
      <div className="usage-legend">
        Less
        {[0, 1, 2, 3, 4, 5].map((level) => (
          <div key={level} className={`usage-legend-cell usage-cal-day lv${level}`} />
        ))}
        More
      </div>
    </>
  );
}

function UsageTooltipView({ tooltip }: { tooltip: UsageTooltip | null }) {
  const elementRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<{ left: number; top: number } | null>(null);
  useLayoutEffect(() => {
    const element = elementRef.current;
    if (!tooltip || !element) {
      setPosition(null);
      return;
    }
    const rect = element.getBoundingClientRect();
    setPosition({
      left: Math.min(
        tooltip.anchor.left + tooltip.anchor.width / 2 - rect.width / 2,
        document.documentElement.clientWidth - rect.width - 10,
      ),
      top: tooltip.anchor.top - rect.height - 6,
    });
  }, [tooltip]);
  if (!tooltip) return null;
  const style: CSSProperties = {
    display: 'block',
    ...(position ? { left: `${position.left}px`, top: `${position.top}px` } : {}),
  };
  return (
    <div className="usage-tooltip" id="usageTooltip" ref={elementRef} style={style}>
      <strong>{tooltip.date}</strong> — {tooltip.tokens.toLocaleString()} tokens,{' '}
      {tooltip.msgs.toLocaleString()} messages
    </div>
  );
}

function UsageCalendarAndTooltip({
  entries,
  period,
}: {
  entries: ReturnType<typeof collectUsageEntries>;
  period: UsagePeriod;
}) {
  const [tooltip, setTooltip] = useState<UsageTooltip | null>(null);
  const weeks = useMemo(() => usageCalendarWeeks(entries.lookup, period), [entries.lookup, period]);
  const handleDayEnter = (event: ReactMouseEvent<HTMLDivElement>, day: UsageCalendarDay) => {
    const rect = event.currentTarget.getBoundingClientRect();
    setTooltip({
      date: day.date,
      tokens: day.tokens,
      msgs: day.msgs,
      anchor: { left: rect.left, top: rect.top, width: rect.width },
    });
  };
  return (
    <>
      <UsageCalendar
        weeks={weeks}
        maxDay={entries.maxDay}
        onDayEnter={handleDayEnter}
        onDayLeave={() => setTooltip(null)}
      />
      <UsageTooltipView tooltip={tooltip} />
    </>
  );
}

function BeagleUsage({ limits }: { limits: ReturnType<typeof beagleUsageSummary> }) {
  if (!limits) return null;
  return (
    <div
      className="usage-beagle-section"
      style={{
        marginBottom: 20,
        padding: '14px 16px',
        background: 'var(--ui-bg-raised)',
        borderRadius: 10,
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 8,
        }}
      >
        <div
          style={{
            fontSize: 'calc(13px * var(--app-font-scale, 1))',
            fontWeight: 600,
            color: 'var(--ui-text-primary)',
          }}
        >
          Beagle Monthly Usage
        </div>
        <div
          style={{
            fontSize: 'calc(11px * var(--app-font-scale, 1))',
            color: 'var(--ui-text-tertiary)',
          }}
        >
          {limits.used.toLocaleString()} / {limits.limit.toLocaleString()} tokens
        </div>
      </div>
      <div
        style={{
          height: 8,
          background: 'var(--ui-bg-control)',
          borderRadius: 4,
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            height: '100%',
            width: `${limits.percent}%`,
            background: limits.color,
            borderRadius: 4,
            transition: 'width .3s ease',
          }}
        />
      </div>
      {limits.message === 'limit' && (
        <div
          style={{
            marginTop: 6,
            fontSize: 'calc(11px * var(--app-font-scale, 1))',
            color: 'var(--ui-danger)',
            fontWeight: 500,
          }}
        >
          Limit reached. Add your own API key in Account → API Keys to continue using Beagle.
        </div>
      )}
      {limits.message === 'approaching' && (
        <div
          style={{
            marginTop: 6,
            fontSize: 'calc(11px * var(--app-font-scale, 1))',
            color: 'var(--ui-ink-secondary)',
          }}
        >
          Approaching monthly limit ({limits.percent}% used).
        </div>
      )}
    </div>
  );
}

function MonthlyBreakdown({ entries }: { entries: ReturnType<typeof monthlyUsageSummaries> }) {
  return (
    <div className="usage-breakdown">
      <div className="usage-section-title">Monthly Summary</div>
      <table>
        <thead>
          <tr>
            <th>Month</th>
            <th>Days active</th>
            <th>Tokens</th>
            <th>Messages</th>
          </tr>
        </thead>
        <tbody>
          {entries.map((entry) => (
            <tr key={entry.month}>
              <td>{entry.month}</td>
              <td>{entry.activeDays}</td>
              <td>{entry.tokens.toLocaleString()}</td>
              <td>{entry.messages.toLocaleString()}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function UsageReport() {
  const snap = useUsageSnapshot();
  if (snap.status === 'idle' || snap.status === 'loading' || snap.status === 'error') {
    return <UsageLoading errorKey={snap.status === 'error' ? snap.errorKey : null} />;
  }

  const totals = collectUsageEntries(snap.entries);
  const beagle = beagleUsageSummary(snap.limits);
  const months = monthlyUsageSummaries(snap.entries);
  return (
    <>
      <BeagleUsage limits={beagle} />
      <UsageSummary
        entries={snap.entries.length}
        totalTokens={totals.totalTokens}
        totalMsgs={totals.totalMsgs}
      />
      <div className="usage-section-title">Daily Activity</div>
      <UsagePeriodControls
        period={snap.period}
        onChange={(period) => {
          void loadUsagePeriod(period);
        }}
      />
      <UsageCalendarAndTooltip key={snap.period} entries={totals} period={snap.period} />
      <MonthlyBreakdown entries={months} />
    </>
  );
}

function UsageModal() {
  const snap = useUsageSnapshot();
  const dispatch = useUsageDispatch();

  return (
    <DialogFrame
      id={OVERLAY_ID}
      open={snap.open}
      onOpenChange={(open) => {
        if (!open) dispatch.close();
      }}
      size="lg"
      title={i18n('usage.title', 'Token Usage')}
      aria-label={i18n('profile.usage', 'Token usage')}
      data-i18n-aria="profile.usage"
      overlayClassName="usage-overlay"
      className="usage-modal"
      closeClassName="usage-close"
      bodyClassName="usage-body"
      keepMounted
    >
      <div id="usageBody">
        <UsageReport />
      </div>
    </DialogFrame>
  );
}

const rootSlot = createRootSlot('usage-modal');

/**
 * Mount the React-owned usage modal into its own body-level root.
 */
export function mountUsageModal(): void {
  const container = ensureBodyContainer('usageModalReactRoot');
  rootSlot.mount(container, <UsageModal />);
}

export function unmountUsageModal(): void {
  rootSlot.destroy();
}
