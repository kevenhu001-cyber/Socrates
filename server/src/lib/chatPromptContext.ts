import { escapePromptControlText } from './chatPolicy.js';
import type { ProviderMessage } from './providerMessageSchema.js';

export const TURN_INSTRUCTIONS_MARKER = '[Current turn instructions]';

/** Tutor stage/quiz state is not a session-wide persona. New clients mark it
 * explicitly; old tutor clients' unmarked system blocks retain turn scope. */
export function splitPromptContext(
  messages: ProviderMessage[],
  mode: 'chat' | 'tutor',
): {
  initialization: ProviderMessage[];
  conversation: ProviderMessage[];
  turnInstructions: string[];
} {
  const initialization: ProviderMessage[] = [],
    conversation: ProviderMessage[] = [];
  const turnInstructions: string[] = [];
  for (const message of messages) {
    if (message.role !== 'system') {
      conversation.push(message);
      continue;
    }
    const text = typeof message.content === 'string' ? message.content.trimStart() : '';
    // Rolling summaries must survive even after the session prompt is frozen.
    if (/^\[(?:Conversation summary|Context summary)/.test(text)) {
      conversation.push({
        role: 'user',
        content: `<client_context_data scope="untrusted">\n${escapePromptControlText(text)}\n</client_context_data>`,
      });
      continue;
    }
    const explicitTurn = text.startsWith(TURN_INSTRUCTIONS_MARKER);
    if (text.startsWith('[Web research]')) {
      turnInstructions.push(
        `<client_context_data scope="untrusted">\n${escapePromptControlText(text)}\n</client_context_data>`,
      );
    } else if (
      explicitTurn ||
      (mode === 'tutor' && text.startsWith('[Assistant mode instructions]'))
    ) {
      // Old tutor clients combine a stable role and changing lesson context.
      // Freeze the role; only the lesson state belongs to the current turn.
      const boundary = text.indexOf('The current lesson context follows.');
      if (!explicitTurn && boundary >= 0) {
        initialization.push({ ...message, content: text.slice(0, boundary).trimEnd() });
        turnInstructions.push(text.slice(boundary));
      } else
        turnInstructions.push(
          explicitTurn ? text.slice(TURN_INSTRUCTIONS_MARKER.length).trim() : text,
        );
    } else initialization.push(message);
  }
  return { initialization, conversation, turnInstructions };
}

/* the full style contract lives in the frozen
   system prefix (FINAL OUTPUT CONSTRAINTS), but client turn instructions
   sit closer to generation and can out-compete it on recency. This card
   restates only the handful of defaults users actually notice, at the
   closest possible position: the tail of the last user message. It is a
   reminder, not a second rulebook — keep it under ~450 characters and
   never let it grow into a duplicate of the system policy. */
export const STYLE_REMINDER = `[Server response defaults reminder]\nFollow the shared FINAL OUTPUT CONSTRAINTS and the user's explicit task, including requested language and format. Match depth and structure to the question; explain the missing step rather than restarting. Use natural prose, readable equations and visuals when useful. Preserve structured output contracts.`;

/** Variable recall and teaching state live at the current user-turn tail,
 * never rewrite the frozen system prefix or split an assistant/tool group.
 * The server policy's untrusted-data rule still governs retrieved evidence. */
export function appendTurnContext(
  messages: ProviderMessage[],
  instructions: string[],
  recall: string | null,
  serverTurn: string | null = null,
): ProviderMessage[] {
  const blocks = [
    /* Server-owned turn behavior (RN-6 learning modes) leads, so the
       client-supplied lesson context below is read as subordinate to it. */
    ...(serverTurn ? [serverTurn] : []),
    ...(instructions.length
      ? [
          `[Current turn instructions: client-supplied; subject to server policy]\n${instructions.join('\n\n')}`,
        ]
      : []),
    ...(recall
      ? [
          `<client_context_data scope="untrusted">\n${escapePromptControlText(recall)}\n</client_context_data>`,
        ]
      : []),
    /* The style card goes last: closest to generation, highest recency. */
    ...(serverTurn || instructions.length ? [STYLE_REMINDER] : []),
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
