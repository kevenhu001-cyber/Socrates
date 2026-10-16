const safeId = (value) => typeof value === 'string' && /^[A-Za-z0-9._:-]{1,200}$/.test(value);
const offset = (value) => Number.isSafeInteger(value) && value >= 0;

export function normalizeTurnSource(value) {
  if (!value || typeof value !== 'object' || !safeId(value.id) || typeof value.url !== 'string' || value.url.length > 2048) return null;
  try {
    const url = new URL(value.url);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return null;
    return { id: value.id, url: url.href, title: String(value.title || url.hostname).slice(0, 240), snippet: String(value.snippet || '').slice(0, 600) };
  } catch { return null; }
}

export function normalizeTurnCitation(value) {
  return value && safeId(value.id) && safeId(value.sourceId) ? { id: value.id, sourceId: value.sourceId } : null;
}

export function normalizeTurnClaim(value) {
  if (!value || !safeId(value.id) || !offset(value.start) || !offset(value.end) || value.end <= value.start
    || typeof value.quote !== 'string' || value.quote.length > 2000 || value.quote.length !== value.end - value.start
    || !Array.isArray(value.citationIds) || !value.citationIds.length || value.citationIds.length > 8
    || !value.citationIds.every(safeId) || new Set(value.citationIds).size !== value.citationIds.length) return null;
  return { id: value.id, start: value.start, end: value.end, quote: value.quote, citationIds: [...value.citationIds] };
}

/** Reject annotations inside non-prose, including incomplete private/code blocks. */
function protectedTurnRanges(text) {
  const ranges = [];
  const protectedRanges = /<think\b[^>]*>[\s\S]*?(?:<\/think>|$(?![\s\S]))|^([ \t]*)(`{3,}|~{3,})[^\n]*\n[\s\S]*?(?:^\1\2[^\n]*(?:\n|$)|$(?![\s\S]))|(`+)[^`]*?\3|\$\$[\s\S]*?(?:\$\$|$(?![\s\S]))|\$[^\n$]+(?:\$|$(?![\s\S]))|\\\[[\s\S]*?(?:\\\]|$(?![\s\S]))|\\\([\s\S]*?(?:\\\)|$(?![\s\S]))/gim;
  for (const match of text.matchAll(protectedRanges)) {
    ranges.push([match.index, match.index + match[0].length]);
  }
  // Avoid injecting a link inside a markdown link destination or HTML tag.
  for (const match of text.matchAll(/\[[^\]\n]*\]\([^\n)]*\)|<[^>\n]*(?:>|$)/g)) {
    ranges.push([match.index, match.index + match[0].length]);
  }
  return ranges;
}

export function isCitableTurnRange(text, start, end) {
  return offset(start) && offset(end) && end > start && end <= text.length
    && !protectedTurnRanges(text).some(([from, to]) => start < to && end > from);
}

export function citableTurnMatches(text, quote) {
  if (!quote) return [];
  const protectedRanges = protectedTurnRanges(text);
  const positions = [];
  for (let at = text.indexOf(quote); at >= 0 && positions.length <= 1000; at = text.indexOf(quote, at + 1)) {
    if (!protectedRanges.some(([from, to]) => at < to && at + quote.length > from)) positions.push(at);
  }
  return positions;
}

/** Insert only app-authored links; numerical model markers are never a source ID. */
export function annotateTurnProse(text, start, runtime) {
  const sources = runtime?.sources || [];
  const citations = runtime?.citations || [];
  const claims = (runtime?.claims || []).filter((claim) => claim.start >= start && claim.end <= start + text.length
    && text.slice(claim.start - start, claim.end - start) === claim.quote
    && isCitableTurnRange(text, claim.start - start, claim.end - start));
  let result = text;
  for (const claim of [...claims].sort((a, b) => b.end - a.end)) {
    const numbers = claim.citationIds.map((id) => citations.find((entry) => entry.id === id))
      .map((citation) => sources.findIndex((source) => source.id === citation?.sourceId) + 1).filter((number) => number > 0);
    if (!numbers.length) continue;
    const at = claim.end - start;
    result = result.slice(0, at) + ` [${numbers.join(', ')}](#socrates-citation-${claim.id})` + result.slice(at);
  }
  return result;
}
