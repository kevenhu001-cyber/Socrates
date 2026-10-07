import { marked, type Token } from 'marked';
import type { Message } from '@socrates/contracts';

export { plainText, safeImage, safeLink } from './urlSafety';

export function parseMessageContent(message: Pick<Message, 'rawText' | 'content' | 'reasoningContent'>): { text: string; reasoning: string; tokens: Token[] } {
  let text = message.rawText || message.content || '';
  let reasoning = message.reasoningContent || '';
  // Legacy inline thinking appears at the start; fenced examples remain code.
  const legacy = /^\s*<think>([\s\S]*?)(?:<\/think>|$)/i.exec(text);
  if (legacy) { if (!reasoning) reasoning = legacy[1]; text = text.slice(legacy[0].length).trimStart(); }
  return { text, reasoning, tokens: marked.lexer(text, { gfm: true, breaks: true }) };
}
