import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Message } from '@socrates/contracts';
import { findMessageMatches } from '@socrates/ui';

interface UseConversationFindOptions {
  messages: Message[];
  activeId: string | null;
  isChatScreen: boolean;
}

/** Owns transcript search state and keeps it scoped to the current chat view. */
export function useConversationFind({ messages, activeId, isChatScreen }: UseConversationFindOptions) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(-1);
  const matches = useMemo(() => findMessageMatches(messages, query), [messages, query]);

  const close = useCallback(() => {
    setOpen(false);
    setQuery('');
    setActiveIndex(-1);
  }, []);

  const openFind = useCallback(() => {
    setQuery('');
    setActiveIndex(-1);
    setOpen(true);
  }, []);

  const next = useCallback(() => {
    setActiveIndex((current) => matches.length ? (current < 0 ? 0 : (current + 1) % matches.length) : -1);
  }, [matches.length]);

  const previous = useCallback(() => {
    setActiveIndex((current) => matches.length ? (current < 0 ? matches.length - 1 : (current - 1 + matches.length) % matches.length) : -1);
  }, [matches.length]);

  const updateQuery = useCallback((value: string) => {
    setQuery(value);
    setActiveIndex(value.trim() ? 0 : -1);
  }, []);

  useEffect(() => { close(); }, [activeId, close]);
  useEffect(() => { if (!isChatScreen) close(); }, [isChatScreen, close]);

  return { open, query, activeIndex, matches, openFind, next, previous, close, updateQuery };
}
