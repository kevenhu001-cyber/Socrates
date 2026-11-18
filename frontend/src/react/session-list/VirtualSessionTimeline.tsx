import {
  Fragment,
  useCallback,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import type { SessionItem } from '../../legacy/sessionListState.ts';
import { SessionGroupHeading } from './SessionGroupHeading';

export type TimelineEntry = {
  key: string;
  session?: SessionItem;
  heading?: string;
  project?: boolean;
};
const OVERSCAN = 8;

function timelineTop(root: HTMLElement, host: HTMLElement): number {
  return Math.max(0, host.getBoundingClientRect().top - root.getBoundingClientRect().top);
}

function rowIndexAt(offsets: number[], position: number): number {
  let low = 0;
  let high = offsets.length - 1;
  while (low < high) {
    const mid = (low + high) >>> 1;
    if (offsets[mid + 1] <= position) low = mid + 1;
    else high = mid;
  }
  return Math.min(low, offsets.length - 2);
}

function visibleRange(offsets: number[], top: number, height: number) {
  return {
    start: Math.max(0, rowIndexAt(offsets, top) - OVERSCAN),
    end: Math.min(offsets.length - 1, rowIndexAt(offsets, top + height) + OVERSCAN + 1),
  };
}

/** Variable-height window with sparse retained rows for menus, rename and drag.
 * Gaps stay in normal flow, so retained rows never move or remount on scroll. */
export function VirtualSessionTimeline({
  entries,
  renderSession,
}: {
  entries: TimelineEntry[];
  renderSession: (session: SessionItem, retain: (id: string, active: boolean) => void) => ReactNode;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const heights = useRef(new Map<string, number>());
  const measurement = useRef({ entries, offsets: [0] });
  const rowObserver = useRef<ResizeObserver | null>(null);
  const observedRows = useRef(new Set<HTMLElement>());
  const [measureRevision, setMeasureRevision] = useState(0);
  const [retained, setRetained] = useState<ReadonlySet<string>>(new Set());
  const [focused, setFocused] = useState<string | null>(null);
  const retain = useCallback((id: string, active: boolean) => {
    setRetained((previous) => {
      if (previous.has(id) === active) return previous;
      const next = new Set(previous);
      if (active) next.add(id);
      else next.delete(id);
      return next;
    });
  }, []);
  const offsets = useMemo(() => {
    void measureRevision;
    const result = [0];
    for (const entry of entries)
      result.push(
        result[result.length - 1] + (heights.current.get(entry.key) ?? (entry.session ? 36 : 32)),
      );
    return result;
    // Measurements are external geometry, revision changes when they change.
  }, [entries, measureRevision]);
  const [{ start, end }, setRange] = useState(() => visibleRange(offsets, 0, 600));
  const indices = useMemo(
    () =>
      entries.flatMap((entry, index) =>
        (index >= start && index < end) || retained.has(entry.key) || focused === entry.key
          ? [index]
          : [],
      ),
    [entries, start, end, retained, focused],
  );

  const updateRange = useCallback((root: HTMLElement, host: HTMLElement) => {
    const next = visibleRange(
      measurement.current.offsets,
      timelineTop(root, host),
      host.clientHeight || 600,
    );
    setRange((current) =>
      current.start === next.start && current.end === next.end ? current : next,
    );
  }, []);

  useLayoutEffect(() => {
    measurement.current = { entries, offsets };
    const root = rootRef.current;
    const host = root?.closest<HTMLElement>('#recentsPanel');
    if (root && host) updateRange(root, host);
  }, [entries, offsets, updateRange]);

  useLayoutEffect(() => {
    const root = rootRef.current;
    const host = root?.closest<HTMLElement>('#recentsPanel');
    if (!root || !host) return undefined;
    let frame = 0;
    const update = () => {
      frame = 0;
      updateRange(root, host);
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    host.addEventListener('scroll', schedule, { passive: true });
    const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(schedule) : null;
    observer?.observe(host);
    return () => {
      host.removeEventListener('scroll', schedule);
      observer?.disconnect();
      if (frame) cancelAnimationFrame(frame);
    };
  }, [updateRange]);

  useLayoutEffect(() => {
    const root = rootRef.current;
    const host = root?.closest<HTMLElement>('#recentsPanel');
    if (!root || !host || typeof ResizeObserver !== 'function') return undefined;
    const observed = observedRows.current;
    const observer = new ResizeObserver((changes) => {
      const { entries, offsets } = measurement.current;
      const top = timelineTop(root, host);
      let changed = false;
      let correction = 0;
      for (const change of changes) {
        const element = change.target as HTMLElement;
        if (!observed.has(element)) continue;
        const index = Number(element.dataset.timelineIndex);
        const key = entries[index]?.key;
        const height =
          change.borderBoxSize?.[0]?.blockSize ?? element.getBoundingClientRect().height;
        if (!key || key !== element.dataset.timelineKey || height <= 0) continue;
        const previous = heights.current.get(key) ?? offsets[index + 1] - offsets[index];
        if (Math.abs(previous - height) < 0.5) continue;
        heights.current.set(key, height);
        if (offsets[index + 1] <= top) correction += height - previous;
        changed = true;
      }
      if (changed) {
        if (correction) host.scrollTop += correction;
        setMeasureRevision((revision) => revision + 1);
      }
    });
    rowObserver.current = observer;
    return () => {
      observer.disconnect();
      rowObserver.current = null;
      observed.clear();
    };
  }, []);

  useLayoutEffect(() => {
    const live = new Set(entries.map((entry) => entry.key));
    for (const key of heights.current.keys()) if (!live.has(key)) heights.current.delete(key);
  }, [entries]);

  useLayoutEffect(() => {
    const observer = rowObserver.current;
    if (!observer || !rootRef.current) return;
    const observed = observedRows.current;
    const next = new Set(rootRef.current.querySelectorAll<HTMLElement>('[data-timeline-index]'));
    for (const element of observed) {
      if (next.has(element)) continue;
      observer.unobserve(element);
      observed.delete(element);
    }
    for (const element of next) {
      if (observed.has(element)) continue;
      observer.observe(element);
      observed.add(element);
    }
  }, [indices]);

  let previousEnd = 0;
  return (
    <div
      ref={rootRef}
      className="recents-list-content recents-list-window"
      onFocusCapture={(event) => {
        setFocused(
          (event.target as HTMLElement).closest<HTMLElement>('[data-timeline-key]')?.dataset
            .timelineKey ?? null,
        );
      }}
      onBlurCapture={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setFocused(null);
      }}
    >
      {indices.map((index) => {
        const entry = entries[index];
        const gap = offsets[index] - previousEnd;
        previousEnd = offsets[index + 1];
        return (
          <Fragment key={entry.key}>
            {gap > 0 ? <div aria-hidden="true" style={{ height: gap, flexShrink: 0 }} /> : null}
            <div
              data-timeline-index={index}
              data-timeline-key={entry.key}
              className="recents-window-row"
            >
              {entry.session ? (
                renderSession(entry.session, retain)
              ) : (
                <SessionGroupHeading label={entry.heading ?? ''} project={entry.project} />
              )}
            </div>
          </Fragment>
        );
      })}
      {offsets[entries.length] > previousEnd ? (
        <div
          aria-hidden="true"
          style={{ height: offsets[entries.length] - previousEnd, flexShrink: 0 }}
        />
      ) : null}
    </div>
  );
}
