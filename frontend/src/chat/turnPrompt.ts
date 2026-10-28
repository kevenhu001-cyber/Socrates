import { getReasoningEffort } from '../ui/effortPicker.js';
import { appendClientContextMessages, thinkingSuffix, toneVoiceSuffix, type PromptMessage } from './promptSuffixes.ts';
import { injectTemplateSystemPrompt } from './templateSystemPrompt.ts';
import { languageDirectiveFor } from './lang.ts';
import { CHAT_CONCISE_PROMPT, CHAT_SYSTEM_PROMPT } from './systemPrompts.ts';
import type { HistoryEntry } from './history.ts';
import { reportSwallow } from '../util/reportSwallow.ts';

export interface ChatPromptMessage {
  role: string;
  content: unknown;
}

interface PromptWindow extends Window {
  extensiveThinkingOn?: boolean;
}

export function buildChatTurnMessages(input: {
  userText: string;
  topic: string;
  userMessage: string;
  userContent: unknown;
  history: HistoryEntry[];
  pageBlocks: string[];
  mentionedSite: boolean;
}): ChatPromptMessage[] {
  const language = languageDirectiveFor(input.userText || input.topic);
  const highEffort = getReasoningEffort() === 'high';
  try { (window as PromptWindow).extensiveThinkingOn = highEffort; }
  catch (error) { reportSwallow(error, 'chat/turnController.askChatTurn#9'); }

  const prompt = highEffort ? CHAT_SYSTEM_PROMPT : CHAT_CONCISE_PROMPT;
  const thinking = highEffort ? thinkingSuffix() : '';
  const systemMessages: PromptMessage[] = [{
    role: 'system',
    content: '[Assistant mode instructions]\n' + language + prompt + toneVoiceSuffix() + thinking,
  }];
  const contextual = appendClientContextMessages(systemMessages);
  let messages = injectTemplateSystemPrompt(contextual) as ChatPromptMessage[];
  const history = input.history.length && input.history[input.history.length - 1].role === 'user'
    ? input.history.slice(0, -1)
    : input.history;
  messages = messages.concat(history);

  if (input.pageBlocks.length) {
    const pagesText = input.userMessage + '\n\n' + input.pageBlocks.join('\n\n');
    const content = Array.isArray(input.userContent)
      ? input.userContent.concat({ type: 'text', text: pagesText })
      : pagesText;
    messages.push({ role: 'user', content });
  } else if (input.mentionedSite) {
    const hintText = input.userMessage + '\n\n[System] The user appears to be referring to a website, but no complete URL was provided in this turn (the system only auto-fetches text that contains a full http(s):// link or a recognizable bare domain like example.com / www.foo.bar). Reply briefly asking them to paste the full URL, including the https:// prefix, so you can read the page. Do NOT invent or guess the page contents.';
    const content = Array.isArray(input.userContent)
      ? input.userContent.concat({ type: 'text', text: hintText })
      : hintText;
    messages.push({ role: 'user', content });
  } else {
    messages.push({ role: 'user', content: input.userContent });
  }

  return messages;
}
