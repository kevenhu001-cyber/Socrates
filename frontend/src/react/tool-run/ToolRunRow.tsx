/**
 * react/tool-run/ToolRunRow.tsx — one tool call (RN-2).
 *
 * Activity layer: a single RN row (icon · verb · object · status · time)
 * that opens the call's detail as a right drawer (desktop) or bottom sheet
 * (phone). Transcript layer (`actionsOnly`): the readable error with Retry
 * and any pending approval, which must stay visible outside the collapsed
 * activity surface.
 *
 * The DOM wrapper keeps `data-tcid` / `data-state` so legacy hooks (viewport
 * anchoring, persisted extras) and tests still find the call.
 */
import { useRef } from 'react';
import { ToolCallRow, ToolDetailSheet, ToolErrorNotice, STATUS_COPY, formatDurationMs, toolTargetOf, toolVerbOf, type ToolCardStatus } from '@socrates/ui/turn';
import { translate } from '../../ui/toolPresentationModel.ts';
import { WebUiTheme } from '../rn/WebUiTheme';
import { ToolActivityIcon } from './ToolActivityIcon';
import { ToolRunApproval } from './ToolRunApproval.js';
import { ToolRunAgentSteps } from './ToolRunAgentSteps.js';
import { ToolRunDetail } from './ToolRunDetail.js';
import { useToolRunDisclosure } from './ToolRunDisclosure';
import { agentRunStateOf, type ToolCallRecord, type ToolRunView } from './toolRunModel';
import { useElapsed } from './useElapsed.js';

export interface ToolRunRowProps {
  view: ToolRunView;
  /** The record behind `view`: input for the object, outputs for images. */
  call?: ToolCallRecord;
  startedAt?: number;
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

export function statusLabelOf(status: ToolCardStatus): string {
  const copy = STATUS_COPY[status];
  return translate(copy.key, copy.fallback);
}

function isDurationMeta(value: string): boolean {
  return /^\d+(?:\.\d+)?m?s$/i.test(value.trim());
}

export function toolRowCopy(view: ToolRunView, call: ToolCallRecord | undefined) {
  const verb = toolVerbOf(view.name);
  const input = call ? (call as { input?: unknown }).input : undefined;
  const target = toolTargetOf(view.name, input) || (view.hosts && view.hosts[0]) || '';
  return { verb: translate(verb.key, verb.fallback), target };
}

function rowDuration(inFlight: boolean, startedAt: number | undefined, elapsedMs: number, call: ToolCallRecord | undefined): string {
  if (inFlight) return startedAt ? formatDurationMs(elapsedMs) : '';
  return formatDurationMs(callDurationMs(call));
}

function hasDetail(view: ToolRunView): boolean {
  return Boolean(view.sections.length || view.tech.length || view.livePreview || view.liveOutput || view.approval);
}

function ToolRunActivity({ view, call, startedAt, readOnly, nested }: ToolRunRowProps) {
  const { open, setOpen } = useToolRunDisclosure(view.id);
  const inFlight = view.state === 'running' || view.state === 'awaiting';
  const elapsedMs = useElapsed(startedAt || 0, inFlight);
  const status = view.state as ToolCardStatus;
  const duration = rowDuration(inFlight, startedAt, elapsedMs, call);
  const { verb, target } = toolRowCopy(view, call);
  const facts = view.meta.filter((part) => !isDurationMeta(part));
  const expandable = hasDetail(view);
  return (
    <div
      className={`rn-tool-row${inFlight ? ' is-live' : ''}`}
      data-tcid={view.id}
      data-tool={view.name}
      data-state={view.state}
      data-nested={nested ? '1' : undefined}
      data-react-owned="1"
      data-error={view.state === 'error' ? '1' : undefined}
    >
      <WebUiTheme>
        <ToolCallRow
          id={view.id}
          icon={<ToolActivityIcon name={view.name} />}
          verb={verb}
          target={target}
          status={status}
          statusLabel={statusLabelOf(status)}
          duration={duration}
          onPress={expandable ? () => setOpen(true) : undefined}
        />
        <ToolDetailSheet
          visible={open && expandable}
          onClose={() => setOpen(false)}
          title={target ? `${verb} · ${target}` : verb}
          subtitle={[statusLabelOf(status), ...facts].join(' · ')}
          status={duration}
          closeLabel={translate('common.close', 'Close')}
        >
          <ToolRunDetail view={view} call={call} inFlight={inFlight} readOnly={readOnly} />
        </ToolDetailSheet>
      </WebUiTheme>
      {view.agentRun ? (
        <ToolRunAgentSteps run={view.agentRun} live={inFlight} state={agentRunStateOf(view.state)} />
      ) : null}
    </div>
  );
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

export function ToolRunRow(props: ToolRunRowProps) {
  return (
    <>
      {!props.actionsOnly ? <ToolRunActivity {...props} /> : null}
      {!props.activityOnly ? <ToolRunActions {...props} /> : null}
    </>
  );
}

export default ToolRunRow;
