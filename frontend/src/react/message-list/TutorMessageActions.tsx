import { DeferredMenu } from '../menu/DeferredMenu';
import { i18n } from '../legacy/gateway';
import { useState } from 'react';
import { Button } from '../ui/shadcn/button';
import { reportSwallow } from '../../util/reportSwallow';
import type { LegacyChatMessage } from '../types/domain';

const ACTIONS = new Set(['explain', 'skip', 'retry', 'hint', 'mistake']);

export function TutorMessageActions({ message, messageId, isLatest }: { message: LegacyChatMessage; messageId: string; isLatest?: boolean }) {
  const [pending, setPending] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  if (!isLatest || message.role !== 'assistant' || message.type !== 'suggest') return null;
  const actions = message.actions;
  if (!Array.isArray(actions)) return null;
  const choices = actions.filter((choice): choice is { action: string; text: string; primary?: boolean } => (
    choice && typeof choice.action === 'string' && ACTIONS.has(choice.action) && typeof choice.text === 'string'
  ));
  if (!choices.length) return null;

  const preferred = choices.find(choice => choice.primary) || choices[0];
  const visible = [preferred, ...choices.filter(choice => choice !== preferred)].slice(0, 2);
  const overflow = choices.filter(choice => !visible.includes(choice));

  async function select(action: string) {
    setMoreOpen(false);
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
    <div className="quick-opts flex flex-wrap items-center gap-2 py-2" role="group" aria-label={i18n('tutor.helpActions', 'Learning support')}>
      {visible.map((choice) => (
        <Button key={choice.action} size="sm" variant={choice.primary ? 'default' : 'outline'}
          disabled={pending} data-tutor-action={choice.action} onClick={() => { void select(choice.action); }}>
          {choice.text}
        </Button>
      ))}
      {overflow.length ? <DeferredMenu className="tutor-help-menu" open={moreOpen} onOpenChange={setMoreOpen}
        label={i18n('tutor.moreHelp', 'More support')}
        trigger={<Button size="sm" variant="ghost" disabled={pending}>{i18n('tutor.moreHelp', 'More support')}</Button>}>
        {({ FoundationMenuItem }) => overflow.map(choice => <FoundationMenuItem key={choice.action}
          disabled={pending} data-tutor-action={choice.action} onClick={() => { void select(choice.action); }}>{choice.text}</FoundationMenuItem>)}
      </DeferredMenu> : null}
    </div>
  );
}
