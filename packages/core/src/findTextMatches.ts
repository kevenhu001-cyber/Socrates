/** Find non-overlapping, case-insensitive match ranges for a pre-normalized query. */
export function findTextMatches(text: string, normalizedQuery: string): Array<[number, number]> {
  if (!normalizedQuery) return [];
  const normalizedText = text.toLocaleLowerCase();
  const matches: Array<[number, number]> = [];
  let cursor = 0;
  let offset = normalizedText.indexOf(normalizedQuery);
  while (offset >= 0) {
    matches.push([offset, offset + normalizedQuery.length]);
    cursor = offset + normalizedQuery.length;
    offset = normalizedText.indexOf(normalizedQuery, cursor);
  }
  return matches;
}
