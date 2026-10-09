import { STROKE_ICONS, toolIcon } from '../../ui/icons/toolIcons.js';
import { formatSeconds } from './labels.js';
import type { ToolRunView } from './toolRunModel.js';

export function ToolRunRowHead({ view, elapsedMs }: { view: ToolRunView; elapsedMs: number }) {
  const parts = view.meta.slice();
  if (view.state === 'running') {
    const elapsed = formatSeconds(elapsedMs);
    if (elapsed) parts.push(elapsed);
  }
  const meta = parts.join(' · ');
  const running = view.state === 'running';

  return (
    <>
      <span
        className="tool-inline-tool-icon"
        aria-hidden="true"
        dangerouslySetInnerHTML={{ __html: toolIcon(view.name) }}
      />
      <span
        className={`tool-inline-label${running ? ' shimmer-text' : ''}${view.mono ? ' is-mono' : ''}`}
        title={view.label}
      >
        {view.label}
      </span>
      {meta ? <span className="tool-inline-meta is-visible">{meta}</span> : null}
      {running ? null : (
        <span
          className="tool-inline-chev"
          aria-hidden="true"
          dangerouslySetInnerHTML={{ __html: STROKE_ICONS.chevronRight }}
        />
      )}
    </>
  );
}
