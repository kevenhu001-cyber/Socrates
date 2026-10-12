const OPEN = '<think>';
const CLOSE = '</think>';

function trailingTagPrefixLength(value: string, tag: string): number {
  const max = Math.min(value.length, tag.length - 1);
  for (let length = max; length > 0; length -= 1) {
    if (value.slice(-length).toLowerCase() === tag.slice(0, length)) return length;
  }
  return 0;
}

/**
 * Routes inline `<think>…</think>` segments without allowing a tag split across
 * SSE frames to leak into assistant Markdown. Ordinary content is emitted as
 * soon as it cannot still be the start of a tag; an unfinished thought is
 * surfaced on finish, matching the Web stream parser's truncation behavior.
 */
export function createInlineThinkRouter(
  onText?: (text: string) => void,
  onThinking?: (text: string) => void,
) {
  let pending = '';
  let thinking = '';
  let insideThink = false;
  let finished = false;

  const emitThinking = (text: string) => {
    if (text) onThinking?.(text);
  };

  const push = (delta: string) => {
    if (!delta || finished) return;
    let probe = pending + delta;
    pending = '';

    while (probe.length) {
      const lower = probe.toLowerCase();
      if (!insideThink) {
        const openAt = lower.indexOf(OPEN);
        if (openAt < 0) {
          const keep = trailingTagPrefixLength(probe, OPEN);
          const visibleLength = probe.length - keep;
          if (visibleLength > 0) onText?.(probe.slice(0, visibleLength));
          pending = probe.slice(visibleLength);
          return;
        }
        if (openAt > 0) onText?.(probe.slice(0, openAt));
        probe = probe.slice(openAt + OPEN.length);
        insideThink = true;
        thinking = '';
        continue;
      }

      const closeAt = lower.indexOf(CLOSE);
      if (closeAt < 0) {
        const keep = trailingTagPrefixLength(probe, CLOSE);
        const safeLength = probe.length - keep;
        thinking += probe.slice(0, safeLength);
        pending = probe.slice(safeLength);
        if (thinking.length >= 200) {
          emitThinking(thinking);
          thinking = '';
        }
        return;
      }

      thinking += probe.slice(0, closeAt);
      emitThinking(thinking);
      thinking = '';
      probe = probe.slice(closeAt + CLOSE.length);
      insideThink = false;
    }
  };

  const finish = () => {
    if (finished) return;
    finished = true;
    if (insideThink) {
      emitThinking(thinking + pending);
    } else if (pending && trailingTagPrefixLength(pending, OPEN) !== pending.length) {
      // Only an unresolved opening-tag prefix is intentionally dropped.
      onText?.(pending);
    }
    pending = '';
    thinking = '';
    insideThink = false;
  };

  return { push, finish };
}
