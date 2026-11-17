/**
 * Request-body readers shared by the stream pipeline stages.
 */
export function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export function requestMessages(body: unknown): Record<string, unknown>[] {
  const rawMessages = isRecord(body) ? body.messages : undefined;
  return Array.isArray(rawMessages) ? rawMessages.filter(isRecord) : [];
}

export function contentText(content: unknown): string {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  return content
    .flatMap((part): string[] => {
      if (!isRecord(part) || part.type !== 'text' || typeof part.text !== 'string') return [];
      return [part.text];
    })
    .join('\n');
}
