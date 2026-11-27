import { useId } from 'react';
import { Icon } from '../../legacy/Icon';
import { categoryIcon } from '../../legacy/icons/toolIcons.ts';
import { toolCategory } from '../../render/toolCategory.ts';
import { useLocaleRefresh, WebUiTheme } from '../rn/WebUiTheme';
import { ToolRunRow } from './ToolRunRow';
import { useToolRunDisclosure } from './ToolRunDisclosure';
import { Button } from '../ui/shadcn/button';
import { groupViewOf, type ToolCallRecord, type TurnSegment } from './toolRunModel';

interface ToolRunGroupRowProps {
  calls: ReadonlyArray<ToolCallRecord>;
  messageId: string;
  readOnly?: boolean;
  live: boolean;
}

/**
 * A compact disclosure for a consecutive burst of tool calls.
 *
 * The group owns only the summary row. Each original call remains a normal
 * ToolRunRow underneath it, preserving per-call identity, output and
 * disclosure state. Only completed, non-agent bursts are grouped; active,
 * failed and approval entries remain independent rows.
 */
export function ToolRunGroupRow({ calls, messageId, readOnly, live }: ToolRunGroupRowProps) {
  useLocaleRefresh();
  const firstCall = calls[0];
  const groupId = `tool-group:${firstCall?.id || 'unknown'}`;
  const disclosure = useToolRunDisclosure(groupId);
  const bodyId = useId();

  const categories = new Set(calls.map((call) => toolCategory(call.name)));
  const category = categories.size === 1 ? [...categories][0] : 'mixed';

  const segment: Extract<TurnSegment, { kind: 'group' }> = {
    kind: 'group',
    category,
    calls: [...calls],
    members: [...calls],
    running: [],
    state: 'done',
  };
  const view = groupViewOf(segment);
  const label = view.label;
  // Group duration is the sum of member durations in the view model. That is
  // not wall-clock time for parallel calls, so expose only the action count.
  const meta = view.meta.slice(0, 1);

  return (
    <div
      className="tool-run-group"
      data-group-id={firstCall?.id}
      data-state="done"
      data-count={calls.length}
    >
      <WebUiTheme>
        <Button
          variant="surface"
          type="button"
          className="tool-run-group-trigger"
          data-testid={`tool-group-${firstCall?.id || 'unknown'}`}
          aria-expanded={disclosure.open}
          aria-controls={bodyId}
          onClick={() => disclosure.setOpen(!disclosure.open)}
        >
          {category === 'search' ? (
            <Icon name="search" size={16} className="activity-step-glyph" />
          ) : (
            <span
              className="tool-inline-tool-icon tool-run-group-icon"
              aria-hidden="true"
              dangerouslySetInnerHTML={{ __html: categoryIcon(category) }}
            />
          )}
          <span className="tool-run-group-label">{label}</span>
          {meta.length ? <span className="tool-run-group-meta">{meta.join(' · ')}</span> : null}
          <Icon name={disclosure.open ? 'chevronUp' : 'chevronDown'} size={16} />
        </Button>
      </WebUiTheme>
      <div
        id={bodyId}
        className="tool-run-group-body"
        hidden={!disclosure.open}
        aria-hidden={!disclosure.open}
        inert={!disclosure.open}
      >
        {disclosure.open
          ? calls.map((call) => (
              <ToolRunRow
                key={call.id}
                call={call}
                messageId={messageId}
                readOnly={readOnly}
                live={live}
                approvalOutside
              />
            ))
          : null}
      </div>
    </div>
  );
}

export default ToolRunGroupRow;
