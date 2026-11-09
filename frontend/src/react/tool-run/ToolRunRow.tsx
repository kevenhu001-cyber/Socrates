/**
 * react/tool-run/ToolRunRow.tsx — the transcript half of a tool call (RN-2).
 *
 * The row itself lives in the turn's activity rail (TurnActivitySurface);
 * what must stay in the prose flow is the readable error with Retry and any
 * pending approval, which cannot be hidden behind a collapsed surface.
 *
 * The DOM wrapper keeps `data-tcid` / `data-state` so legacy hooks (viewport
 * anchoring, persisted extras) and tests still find the call.
 */
import { useRef } from 'react';
import { ToolErrorNotice } from '@socrates/ui/turn';
import { translate } from '../../ui/toolPresentationModel.ts';
import { WebUiTheme } from '../rn/WebUiTheme';
import { ToolRunApproval } from './ToolRunApproval.js';
import type { ToolCallRecord, ToolRunView } from './toolRunModel';

export interface ToolRunRowProps {
  view: ToolRunView;
  /** The record behind `view`: input for the object, outputs for images. */
  call?: ToolCallRecord;
  messageId?: string;
  readOnly?: boolean;
  nested?: boolean;
  activityOnly?: boolean;
  actionsOnly?: boolean;
}

export function callDurationMs(call: ToolCallRecord | undefined): number | null {
  if (!call) return null;
  const record = call as ToolCallRecord & { durationMs?: number };
  if (typeof record.durationMs === 'number') return record.durationMs;
  const run = call._run;
  if (run && typeof run.durationMs === 'number') return run.durationMs;
  if (run && typeof run.startedAt === 'number' && typeof run.endedAt === 'number') return run.endedAt - run.startedAt;
  return null;
}

function errorMessageOf(view: ToolRunView, call: ToolCallRecord | undefined): string {
  const friendly = call && typeof call.userMessage === 'string' ? call.userMessage.trim() : '';
  if (friendly) return friendly;
  const error = view.sections.find((section) => section.kind === 'error');
  return error?.kind === 'error' ? error.text.trim().split('\n')[0].slice(0, 180) : '';
}

function ToolRunActions({ view, call, messageId, readOnly }: ToolRunRowProps) {
  const host = useRef<HTMLDivElement>(null);
  const message = errorMessageOf(view, call);
  const retry = !readOnly ? view.retry : undefined;
  if (!message && !retry && !view.approval) return null;
  return (
    <div className="rn-tool-actions" ref={host} data-tool-actions={view.id}>
      {message || retry ? (
        <WebUiTheme>
          <ToolErrorNotice
            message={message || translate('tool.statusFailed', 'Failed')}
            retryLabel={retry ? translate('tool.retry', 'Retry search') : undefined}
            onRetry={retry ? () => {
              /* Same event the delegated listener in liveTurn already handles. */
              host.current?.dispatchEvent(new CustomEvent('tool-retry', { bubbles: true, detail: retry }));
            } : undefined}
          />
        </WebUiTheme>
      ) : null}
      {view.approval ? (
        <ToolRunApproval view={view.approval} messageId={messageId || ''} toolCallId={view.id} readOnly={readOnly} />
      ) : null}
    </div>
  );
}

export function ToolRunRow({ view, call, messageId, readOnly }: ToolRunRowProps) {
  return <ToolRunActions view={view} call={call} messageId={messageId} readOnly={readOnly} />;
}

export default ToolRunRow;
