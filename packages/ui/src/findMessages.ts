import type { Message } from '@socrates/contracts';

export interface FindMessageMatch {
  messageIndex: number;
  offset: number;
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

/** Build the ordered match list for the visible transcript. */
export function findMessageMatches(messages: Message[], query: string): FindMessageMatch[] {
  const needle = query.trim().toLocaleLowerCase();
  if (!needle) return [];
  const matches: FindMessageMatch[] = [];
  messages.forEach((message, messageIndex) => {
    const text = (message.rawText || message.content || '').toLocaleLowerCase();
    let cursor = 0;
    while (cursor <= text.length - needle.length) {
      const offset = text.indexOf(needle, cursor);
      if (offset < 0) break;
      matches.push({ messageIndex, offset });
      cursor = offset + needle.length;
    }
  });
  return matches;
}
