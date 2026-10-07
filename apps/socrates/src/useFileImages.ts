import { useEffect, useMemo, useRef, useState } from 'react';
import type { Message } from '@socrates/contracts';
import { storedFileIdsInText } from '@socrates/ui';
import { resolveStoredImage, type FileAccessTarget, type FileImageSource } from './fileAccess';

/* Resolves every stored file referenced by the rendered transcript
 * (`![alt](/api/files/<id>/raw)` and file-backed attachments) into a
 * platform image source, fetching each id once and revoking web blob URLs on
 * unmount. Unresolvable ids simply keep their alt text. */

export function storedFileIdsOfMessage(message: Pick<Message, 'rawText' | 'content' | 'attachments' | 'toolCalls'>): string[] {
  const ids = new Set<string>(storedFileIdsInText(message.rawText || message.content || ''));
  for (const attachment of message.attachments || []) if (attachment.fileId) ids.add(attachment.fileId.toLowerCase());
  for (const call of message.toolCalls || []) {
    for (const raw of call.artifacts || []) {
      // Persisted rows carry {id,…}; live frames can still send bare ids.
      const entry = raw as unknown as string | { id?: string } | null;
      const id = typeof entry === 'string' ? entry : entry?.id;
      if (id) ids.add(String(id).toLowerCase());
    }
  }
  return [...ids];
}

export function useFileImages(messages: Message[] | undefined, target: FileAccessTarget): Record<string, FileImageSource> {
  const [sources, setSources] = useState<Record<string, FileImageSource>>({});
  const cache = useRef(new Map<string, FileImageSource>());
  const ids = useMemo(() => {
    const all = new Set<string>();
    for (const message of messages || []) for (const id of storedFileIdsOfMessage(message)) all.add(id);
    return [...all].sort();
  }, [messages]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      for (const id of ids) {
        if (cache.current.has(id)) continue;
        try {
          const source = await resolveStoredImage(id, target);
          if (!source) continue;
          cache.current.set(id, source);
          if (!cancelled) setSources((prev) => (prev[id] ? prev : { ...prev, [id]: source }));
        } catch { /* unreachable file keeps its alt text */ }
      }
    })();
    return () => { cancelled = true; };
  }, [ids, target]);

  useEffect(() => () => {
    for (const source of cache.current.values()) source.revoke?.();
    cache.current.clear();
  }, []);

  return sources;
}
