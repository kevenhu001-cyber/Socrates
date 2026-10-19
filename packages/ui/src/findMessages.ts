import type { Message } from '@socrates/contracts';

export interface FindMessageMatch {
  messageIndex: number;
  offset: number;
}

const normalizedText = new WeakMap<Message, { source: string; lowercase: string }>();
function textFor(message: Message): string {
  const source = message.rawText || message.content || '';
  const cached = normalizedText.get(message);
  if (cached?.source === source) return cached.lowercase;
  const lowercase = source.toLocaleLowerCase();
  normalizedText.set(message, { source, lowercase });
  return lowercase;
}

/** Count non-overlapping, case-insensitive matches like the web find bar. */
export function countFindMatches(text: string, query: string): number {
  const needle = query.trim().toLocaleLowerCase();
  if (!needle) return 0;
  const haystack = text.toLocaleLowerCase();
  let count = 0;
  let cursor = 0;
  while (cursor <= haystack.length - needle.length) {
    const index = haystack.indexOf(needle, cursor);
    if (index < 0) break;
    count++;
    cursor = index + needle.length;
  }
  return count;
}

/** Build hits and each row's global hit offset together, reusing unchanged text. */
export function buildMessageFindIndex(messages: Message[], query: string): { matches: FindMessageMatch[]; offsets: number[] } {
  const needle = query.trim().toLocaleLowerCase();
  const matches: FindMessageMatch[] = [];
  const offsets: number[] = [];
  // Most streaming turns have no active search: do not visit the transcript.
  if (!needle) return { matches, offsets };
  messages.forEach((message, messageIndex) => {
    offsets.push(matches.length);
    const text = textFor(message);
    let cursor = 0;
    while (cursor <= text.length - needle.length) {
      const offset = text.indexOf(needle, cursor);
      if (offset < 0) break;
      matches.push({ messageIndex, offset });
      cursor = offset + needle.length;
    }
  });
  return { matches, offsets };
}

/** Build the ordered match list for the visible transcript. */
export function findMessageMatches(messages: Message[], query: string): FindMessageMatch[] {
  return buildMessageFindIndex(messages, query).matches;
}
