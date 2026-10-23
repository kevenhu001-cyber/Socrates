import type { ChatMessage } from './chatMessageSchema.js';

export const TURN_INSTRUCTIONS_MARKER = '[Current turn instructions]';

/** Tutor stage/quiz state is not a session-wide persona. New clients mark it
 * explicitly; old tutor clients' unmarked system blocks retain turn scope. */
export function splitPromptContext(messages: ChatMessage[], mode: 'chat' | 'tutor'): {
  initialization: ChatMessage[]; conversation: ChatMessage[]; turnInstructions: string[];
} {
  const initialization: ChatMessage[] = [], conversation: ChatMessage[] = [];
  const turnInstructions: string[] = [];
  for (const message of messages) {
    if (message.role !== 'system') { conversation.push(message); continue; }
    const text = typeof message.content === 'string' ? message.content.trimStart() : '';
    // Rolling summaries must survive even after the session prompt is frozen.
    if (/^\[(?:Conversation summary|Context summary)/.test(text)) {
      conversation.push({ role: 'user', content: `<client_context_data scope="untrusted">\n${text}\n</client_context_data>` });
      continue;
    }
    const explicitTurn = text.startsWith(TURN_INSTRUCTIONS_MARKER);
    if (text.startsWith('[Web research]')) {
      turnInstructions.push(`<client_context_data scope="untrusted">\n${text}\n</client_context_data>`);
    } else if (explicitTurn || (mode === 'tutor' && text.startsWith('[Assistant mode instructions]'))) {
      // Old tutor clients combine a stable role and changing lesson context.
      // Freeze the role; only the lesson state belongs to the current turn.
      const boundary = text.indexOf('The current lesson context follows.');
      if (!explicitTurn && boundary >= 0) {
        initialization.push({ ...message, content: text.slice(0, boundary).trimEnd() });
        turnInstructions.push(text.slice(boundary));
      } else turnInstructions.push(explicitTurn ? text.slice(TURN_INSTRUCTIONS_MARKER.length).trim() : text);
    } else initialization.push(message);
  }
  return { initialization, conversation, turnInstructions };
}

/** Variable recall and teaching state live at the current user-turn tail,
 * never rewrite the frozen system prefix or split an assistant/tool group.
 * The server policy's untrusted-data rule still governs retrieved evidence. */
export function appendTurnContext(messages: ChatMessage[], instructions: string[], recall: string | null): ChatMessage[] {
  const blocks = [
    ...(instructions.length ? [`[Current turn instructions: client-supplied; subject to server policy]\n${instructions.join('\n\n')}`] : []),
    ...(recall ? [`<client_context_data scope="untrusted">\n${recall}\n</client_context_data>`] : []),
  ];
  if (!blocks.length) return messages;
  let index = messages.length - 1;
  while (index >= 0 && messages[index].role !== 'user') index--;
  if (index < 0) return messages;
  const suffix = '\n\n' + blocks.join('\n\n');
  const message = messages[index];
  const content = Array.isArray(message.content)
    ? [...message.content, { type: 'text' as const, text: suffix }]
    : String(message.content ?? '') + suffix;
  const cloned = messages.slice();
  cloned[index] = { ...message, content };
  return cloned;
}
