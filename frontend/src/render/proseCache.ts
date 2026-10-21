export type ProseHtml = { __html: string };

/** Character budget includes retained keys AND HTML. Entry count also bounds
 * object/Map overhead for very short replies. Oversized entries pass through. */
export function createProseCache(maxChars: number, maxEntries: number) {
  const entries = new Map<string, { html: ProseHtml; chars: number }>();
  let chars = 0;
  const remove = (key: string) => {
    const entry = entries.get(key);
    if (!entry) return;
    chars -= entry.chars;
    entries.delete(key);
  };
  return {
    get(key: string): ProseHtml | undefined {
      const entry = entries.get(key);
      if (!entry) return undefined;
      entries.delete(key);
      entries.set(key, entry);
      return entry.html;
    },
    set(key: string, html: ProseHtml): void {
      remove(key);
      const weight = key.length + html.__html.length;
      if (weight > maxChars || maxEntries <= 0) return;
      while (entries.size && (chars + weight > maxChars || entries.size >= maxEntries)) {
        remove(entries.keys().next().value!);
      }
      entries.set(key, { html, chars: weight });
      chars += weight;
    },
    clear(): void { entries.clear(); chars = 0; },
    stats: () => ({ chars, entries: entries.size }),
  };
}

export const sharedFinalProseCache = createProseCache(8_000_000, 256);
export function clearSharedProseCache(): void { sharedFinalProseCache.clear(); }

/** Hold exactly the current settled prefix, independent of the lookup LRU.
 * Append-only updates paint only new blocks. Comparing retained text handles
 * replacement, truncation and abandoned/replayed React renders as well. */
export function createSettledProseCache() {
  let previousText: readonly string[] = [];
  let previousHtml: ProseHtml[] = [];
  let previousPaint: ((text: string) => ProseHtml) | null = null;
  return (blocks: readonly string[], paint: (text: string) => ProseHtml): ProseHtml[] => {
    let common = 0;
    if (paint === previousPaint) {
      while (common < blocks.length && common < previousText.length && blocks[common] === previousText[common]) common++;
    }
    if (common === blocks.length && common === previousText.length && paint === previousPaint) return previousHtml;
    const html = previousHtml.slice(0, common);
    for (let index = common; index < blocks.length; index++) html.push(paint(blocks[index]));
    previousText = blocks.slice();
    previousHtml = html;
    previousPaint = paint;
    return html;
  };
}
