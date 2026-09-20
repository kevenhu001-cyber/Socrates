import { createContext, useContext } from 'react';

import type { ToolRunView, TurnSegment } from './toolRunModel.js';

export type ToolRunGroupSegment = Extract<TurnSegment, { kind: 'group' }>;

export type ToolRunSheetRequest =
  | {
      kind: 'group';
      id: string;
      segment: ToolRunGroupSegment;
      messageId?: string;
      readOnly?: boolean;
      trigger: HTMLElement;
    }
  | {
      kind: 'tool';
      id: string;
      view: ToolRunView;
      messageId?: string;
      readOnly?: boolean;
      trigger: HTMLElement;
    };

export interface ToolRunSheetContextValue {
  isNarrowViewport: boolean;
  sheet: ToolRunSheetRequest | null;
  openGroup: (
    segment: ToolRunGroupSegment,
    messageId: string | undefined,
    readOnly: boolean | undefined,
    trigger: HTMLElement,
  ) => void;
  openTool: (
    view: ToolRunView,
    messageId: string | undefined,
    readOnly: boolean | undefined,
    trigger: HTMLElement,
  ) => void;
  refreshGroup: (segment: ToolRunGroupSegment) => void;
  refreshTool: (view: ToolRunView) => void;
}

export function toolRunGroupId(segment: ToolRunGroupSegment): string {
  return segment.members[0]?.id || segment.running[0]?.id || '';
}

const NOOP = () => {};

const DEFAULT_CONTEXT: ToolRunSheetContextValue = {
  isNarrowViewport: false,
  sheet: null,
  openGroup: NOOP,
  openTool: NOOP,
  refreshGroup: NOOP,
  refreshTool: NOOP,
};

export const ToolRunSheetContext = createContext<ToolRunSheetContextValue>(DEFAULT_CONTEXT);

export function useToolRunSheet(): ToolRunSheetContextValue {
  return useContext(ToolRunSheetContext);
}
