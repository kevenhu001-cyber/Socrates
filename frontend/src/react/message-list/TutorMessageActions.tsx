import { useState } from 'react';
import { Button } from '../ui/shadcn/button';
import { reportSwallow } from '../../util/reportSwallow';
import type { LegacyChatMessage } from '../types/domain';

const ACTIONS = new Set(['explain', 'skip', 'retry', 'hint', 'mistake']);

export function TutorMessageActions({ message, messageId, isLatest }: { message: LegacyChatMessage; messageId: string; isLatest?: boolean }) {
  const [pending, setPending] = useState(false);
  if (!isLatest || message.role !== 'assistant' || message.type !== 'suggest') return null;
  const actions = message.actions;
  if (!Array.isArray(actions)) return null;
  const choices = actions.filter((choice): choice is { action: string; text: string; primary?: boolean } => (
    choice && typeof choice.action === 'string' && ACTIONS.has(choice.action) && typeof choice.text === 'string'
  ));
  if (!choices.length) return null;

  async function select(action: string) {
    if (pending) return;
    setPending(true);
    try {
      const { handleQuickAction } = await import('../../chat/quickActions');
      await handleQuickAction(action, messageId);
    } catch (error) {
      reportSwallow(error, 'tutor.messageAction');
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="quick-opts flex flex-wrap gap-2 py-2">
      {choices.map((choice) => (
        <Button key={choice.action} size="sm" variant={choice.primary ? 'default' : 'outline'}
          disabled={pending} data-tutor-action={choice.action} onClick={() => { void select(choice.action); }}>
          {choice.text}
        </Button>
      ))}
    </div>
  );
}
