/** Footer actions: the host decides which commands exist for the current mode. */
import { S } from '../look';
import { UiButton } from '../primitives/UiButton';
import type { ExamAction, ExamCommandHandler } from './model';

export function ExamFooter({
  actions,
  onCommand,
}: {
  actions: readonly ExamAction[];
  onCommand: ExamCommandHandler;
}) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'row',
        flexWrap: 'wrap',
        justifyContent: 'flex-end',
        gap: S[75],
      }}
    >
      {actions.map((action) => (
        <UiButton
          key={`${action.command}-${action.label}`}
          label={action.label}
          variant={action.tone === 'solid' ? 'primary' : 'secondary'}
          onPress={() => onCommand(action.command)}
        />
      ))}
    </div>
  );
}
