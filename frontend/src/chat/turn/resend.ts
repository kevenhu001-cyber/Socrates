import { t } from '../../i18n/index.ts';
import { sessionStore } from '../../store/index.ts';
import { showToast } from '../../legacy/toast.ts';
import { reportSwallow } from '../../util/reportSwallow.ts';
import { buildUserContentParts } from '../history.ts';
import { askChatTurn } from './controller.ts';
import { quietTurn } from './ui.ts';

function latestUserMessage() {
  const messages = sessionStore.getState().messages;
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    if (messages[index]?.role === 'user') return messages[index];
  }
  return null;
}

/** Start a fresh answer using the latest user message and its stored attachments. */
export function resendLastUserMessage(): boolean {
  const latestUser = latestUserMessage();
  const text =
    latestUser?.rawText || (typeof latestUser?.content === 'string' ? latestUser.content : '');
  if (!latestUser || !text) {
    try {
      showToast(t('toast.noRetryTarget'));
    } catch (error) {
      reportSwallow(error, 'chat/turn/resend.noTarget');
    }
    return false;
  }

  let parts: ReturnType<typeof buildUserContentParts> = null;
  try {
    parts = buildUserContentParts(text, latestUser.attachments);
  } catch (error) {
    reportSwallow(error, 'chat/turn/resend.buildContent');
  }
  quietTurn(askChatTurn(text, parts));
  return true;
}
