import { STROKE_ICONS } from '../../ui/icons/toolIcons.js';
import { ToolActivityIcon } from './ToolActivityIcon';
import { formatSeconds, translate } from './labels.js';
import type { ToolRunView } from './toolRunModel.js';

function isDurationMeta(value: string): boolean {
  return /^\d+(?:\.\d+)?s$/i.test(value.trim());
}

export function ToolRunRowHead({ view, elapsedMs }: { view: ToolRunView; elapsedMs: number }) {
  // Keep useful result facts (source counts, outcomes) in the activity row, but
  // move settled per-tool duration out of the primary transcript layer. The
  // turn-level work disclosure owns elapsed-time emphasis; execution details
  // remain available after expansion.
  const parts = view.meta.filter((part) => view.state !== 'done' || !isDurationMeta(part));
  if (view.state === 'running') {
    const elapsed = formatSeconds(elapsedMs);
    if (elapsed) parts.push(elapsed);
  }
  const meta = parts.join(' · ');
  const hosts = view.hosts || [];

  // `mono` currently identifies command-shaped labels such as `$ npm test`.
  // Keep the command itself in the existing Arguments/technical disclosure;
  // the transcript-level activity row should describe the action, not expose a
  // shell log. This preserves the underlying model and avoids duplicating data.
  const displayLabel = view.mono
    ? (view.state === 'running'
      ? translate('tool.runningCommand', 'Running a command…')
      : view.state === 'done'
        ? translate('tool.ranCommand', 'Ran a command')
        : view.label)
    : view.label;

  return (
    <>
      <ToolActivityIcon name={view.name} />
      <span
        className="tool-inline-label"
        title={displayLabel}
      >
        {displayLabel}
      </span>
      <span
        className="tool-inline-chev"
        aria-hidden="true"
        dangerouslySetInnerHTML={{ __html: STROKE_ICONS.chevronRight }}
      />
      {/* Provenance remains a quiet fact beside the activity; technical
          arguments/stdout stay behind the row disclosure. */}
      {hosts.length > 0 ? (
        <span className="tool-inline-hosts">
          {hosts.map((host) => (
            <span key={host} className="tool-inline-host" title={host}>{host}</span>
          ))}
        </span>
      ) : null}
      <span className="sr-only" role="status">
        {view.state === 'awaiting' ? translate('tool.awaitingApproval', 'Waiting for your decision')
          : view.state === 'running' ? translate('tool.statusRunning', 'Running')
            : view.state === 'error' ? translate('tool.statusFailed', 'Failed')
              : view.state === 'stopped' ? translate('tool.statusStopped', 'Stopped')
                : translate('tool.statusDone', 'Done')}
      </span>
      {meta ? <span className="tool-inline-meta is-visible">{meta}</span> : null}
    </>
  );
}
