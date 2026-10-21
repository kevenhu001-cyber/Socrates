import { Fragment, useCallback, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { SessionItem } from './types';

export type TimelineEntry = { key: string; session?: SessionItem; heading?: string; project?: boolean };
const OVERSCAN = 8;

/** Variable-height window with sparse retained rows for menus, rename and drag.
 * Gaps stay in normal flow, so retained rows never move or remount on scroll. */
export function VirtualSessionTimeline({ entries, renderSession }: {
  entries: TimelineEntry[];
  renderSession: (session: SessionItem, retain: (id: string, active: boolean) => void) => ReactNode;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const heights = useRef(new Map<string, number>());
  const [measureRevision, setMeasureRevision] = useState(0);
  const [viewport, setViewport] = useState({ top: 0, height: 600 });
  const [retained, setRetained] = useState<ReadonlySet<string>>(new Set());
  const [focused, setFocused] = useState<string | null>(null);
  const retain = useCallback((id: string, active: boolean) => {
    setRetained((previous) => {
      if (previous.has(id) === active) return previous;
      const next = new Set(previous);
      if (active) next.add(id); else next.delete(id);
      return next;
    });
  }, []);
  const offsets = useMemo(() => {
    void measureRevision;
    const result = [0];
    for (const entry of entries) result.push(result[result.length - 1] + (heights.current.get(entry.key) ?? (entry.session ? 36 : 32)));
    return result;
    // Measurements are external geometry, revision changes when they change.
  }, [entries, measureRevision]);
  const indexAt = (position: number) => {
    let low = 0, high = entries.length;
    while (low < high) {
      const mid = (low + high) >>> 1;
      if (offsets[mid + 1] <= position) low = mid + 1; else high = mid;
    }
    return Math.min(low, entries.length - 1);
  };
  const start = Math.max(0, indexAt(viewport.top) - OVERSCAN);
  const end = Math.min(entries.length, indexAt(viewport.top + viewport.height) + OVERSCAN + 1);
  const indices: number[] = [];
  entries.forEach((entry, index) => {
    if ((index >= start && index < end) || retained.has(entry.key) || focused === entry.key) indices.push(index);
  });

  useLayoutEffect(() => {
    const root = rootRef.current;
    const host = root?.closest<HTMLElement>('#recentsPanel');
    if (!root || !host) return undefined;
    let frame = 0;
    const update = () => {
      frame = 0;
      const top = Math.max(0, host.scrollTop - (root.getBoundingClientRect().top - host.getBoundingClientRect().top + host.scrollTop));
      const height = host.clientHeight || 600;
      setViewport((previous) => previous.top === top && previous.height === height ? previous : { top, height });
    };
    const schedule = () => { if (!frame) frame = requestAnimationFrame(update); };
    host.addEventListener('scroll', schedule, { passive: true });
    const observer = new ResizeObserver(schedule);
    observer.observe(host);
    update();
    return () => {
      host.removeEventListener('scroll', schedule);
      observer.disconnect();
      if (frame) cancelAnimationFrame(frame);
    };
  }, []);

  useLayoutEffect(() => {
    const root = rootRef.current;
    const host = root?.closest<HTMLElement>('#recentsPanel');
    if (!root || !host) return undefined;
    const live = new Set(entries.map((entry) => entry.key));
    for (const key of heights.current.keys()) if (!live.has(key)) heights.current.delete(key);
    const observer = new ResizeObserver((changes) => {
      let changed = false, correction = 0;
      for (const change of changes) {
        const element = change.target as HTMLElement;
        const index = Number(element.dataset.timelineIndex);
        const key = entries[index]?.key;
        const height = change.borderBoxSize?.[0]?.blockSize ?? element.getBoundingClientRect().height;
        if (!key || height <= 0) continue; // hidden mobile drawer
        const previous = offsets[index + 1] - offsets[index];
        if (Math.abs(previous - height) < 0.5) continue;
        heights.current.set(key, height);
        if (offsets[index + 1] <= viewport.top) correction += height - previous;
        changed = true;
      }
      if (changed) {
        if (correction) host.scrollTop += correction;
        setMeasureRevision((revision) => revision + 1);
      }
    });
    root.querySelectorAll<HTMLElement>('[data-timeline-index]').forEach((node) => observer.observe(node));
    return () => observer.disconnect();
  }, [entries, offsets, start, end, retained, focused, viewport.top]);

  let previousEnd = 0;
  return <div ref={rootRef} className="recents-list-content recents-list-window" onFocusCapture={(event) => {
    setFocused((event.target as HTMLElement).closest<HTMLElement>('[data-timeline-key]')?.dataset.timelineKey ?? null);
  }} onBlurCapture={(event) => {
    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setFocused(null);
  }}>
    {indices.map((index) => {
      const entry = entries[index];
      const gap = offsets[index] - previousEnd;
      previousEnd = offsets[index + 1];
      return <Fragment key={entry.key}>
        {gap > 0 ? <div aria-hidden="true" style={{ height: gap, flexShrink: 0 }} /> : null}
        <div data-timeline-index={index} data-timeline-key={entry.key} className="recents-window-row">
          {entry.session ? renderSession(entry.session, retain) : <div className={entry.project ? 'recents-project-label' : 'recents-time-label'} role="heading" aria-level={3}>{entry.heading}</div>}
        </div>
      </Fragment>;
    })}
    {offsets[entries.length] > previousEnd ? <div aria-hidden="true" style={{ height: offsets[entries.length] - previousEnd, flexShrink: 0 }} /> : null}
  </div>;
}
