import { STROKE_ICONS, toolIcon } from '../../ui/icons/toolIcons.js';
import { formatSeconds, translate } from './labels.js';
import type { ToolRunView } from './toolRunModel.js';

export function ToolRunRowHead({ view, elapsedMs }: { view: ToolRunView; elapsedMs: number }) {
  const parts = view.meta.slice();
  if (view.state === 'running') {
    const elapsed = formatSeconds(elapsedMs);
    if (elapsed) parts.push(elapsed);
  }
  const meta = parts.join(' · ');
  const hosts = view.hosts || [];

  return (
    <>
      <span
        className="tool-inline-tool-icon"
        aria-hidden="true"
        dangerouslySetInnerHTML={{ __html: toolIcon(view.name) }}
      />
      <span
        className={`tool-inline-label${view.mono ? ' is-mono' : ''}`}
        title={view.label}
      >
        {view.label}
      </span>
      <span
        className="tool-inline-chev"
        aria-hidden="true"
        dangerouslySetInnerHTML={{ __html: STROKE_ICONS.chevronRight }}
      />
      {/* Provenance between the label and the meta. It sits left of the meta
          (which is right-aligned via margin-left:auto) so the two never
          collide, and it wraps off rather than truncating the label. */}
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
