import { useCallback, useEffect, useId, useMemo, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

import type { ToolRunView } from './toolRunModel.js';
import {
  type ToolRunGroupSegment,
  type ToolRunSheetRequest,
  ToolRunSheetContext,
  toolRunGroupId,
} from './ToolRunSheetContext.js';
import { ToolRunSheetContent } from './ToolRunSheetContent.js';
import { useToolRunSheetA11y } from './useToolRunSheetA11y.js';

function narrowViewport(): boolean {
  return typeof window !== 'undefined'
    && typeof window.matchMedia === 'function'
    && window.matchMedia('(max-width: 760px)').matches;
}

function useIsNarrowViewport(): boolean {
  const [narrow, setNarrow] = useState(narrowViewport);

  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return undefined;
    const media = window.matchMedia('(max-width: 760px)');
    const update = () => setNarrow(media.matches);
    update();
    if (typeof media.addEventListener === 'function') {
      media.addEventListener('change', update);
      return () => media.removeEventListener('change', update);
    }
    media.addListener(update);
    return () => media.removeListener(update);
  }, []);

  return narrow;
}

function sameCalls(left: readonly { id: string }[], right: readonly { id: string }[]): boolean {
  return left.length === right.length && left.every((call, index) => call === right[index]);
}

function sameToolView(left: ToolRunView, right: ToolRunView): boolean {
  if (left === right) return true;
  try { return JSON.stringify(left) === JSON.stringify(right); } catch (_) { return false; }
}

export function ToolRunSheetProvider({ children }: { children: ReactNode }) {
  const isNarrowViewport = useIsNarrowViewport();
  const [sheet, setSheet] = useState<ToolRunSheetRequest | null>(null);
  const generatedId = useId().replace(/:/g, '');
  const headingId = `tool-run-sheet-title-${generatedId}`;

  const openGroup = useCallback((
    segment: ToolRunGroupSegment,
    messageId: string | undefined,
    readOnly: boolean | undefined,
    trigger: HTMLElement,
  ) => {
    const id = toolRunGroupId(segment);
    if (!id) return;
    setSheet({ kind: 'group', id, segment, messageId, readOnly, trigger });
  }, []);

  const openTool = useCallback((
    view: ToolRunView,
    messageId: string | undefined,
    readOnly: boolean | undefined,
    trigger: HTMLElement,
  ) => {
    setSheet({ kind: 'tool', id: view.id, view, messageId, readOnly, trigger });
  }, []);

  const refreshGroup = useCallback((segment: ToolRunGroupSegment) => {
    const id = toolRunGroupId(segment);
    setSheet((current) => current?.kind === 'group'
      && current.id === id
      && current.segment !== segment
      && (current.segment.state !== segment.state
        || current.segment.category !== segment.category
        || !sameCalls(current.segment.members, segment.members)
        || !sameCalls(current.segment.running, segment.running))
      ? { ...current, segment }
      : current);
  }, []);

  const refreshTool = useCallback((view: ToolRunView) => {
    setSheet((current) => current?.kind === 'tool'
      && current.id === view.id
      && current.view !== view
      && !sameToolView(current.view, view)
      ? { ...current, view }
      : current);
  }, []);

  const context = useMemo(() => ({
    isNarrowViewport,
    sheet,
    openGroup,
    openTool,
    refreshGroup,
    refreshTool,
  }), [isNarrowViewport, sheet, openGroup, openTool, refreshGroup, refreshTool]);

  const close = useCallback(() => setSheet(null), []);
  const { closeRef, panelRef } = useToolRunSheetA11y(sheet, close);
  const portal = sheet && typeof document !== 'undefined'
    ? createPortal(
      <ToolRunSheetContent
        request={sheet}
        headingId={headingId}
        closeRef={closeRef}
        panelRef={panelRef}
        onClose={close}
      />,
      document.body,
    )
    : null;

  return (
    <ToolRunSheetContext.Provider value={context}>
      {children}
      {portal}
    </ToolRunSheetContext.Provider>
  );
}

export default ToolRunSheetProvider;
