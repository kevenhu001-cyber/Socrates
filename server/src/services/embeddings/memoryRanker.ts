/** Bounded lexical retrieval for account memories. No extra model/embedding call.
 * Rank only rows already filtered by owner, enabled state and project scope. */
const STOP = new Set(
  'a an the i me my you your we our is are was were be to of in on for with and or do does did can could would please what how why when which this that it have has tell about want need'.split(
    ' ',
  ),
);

function tokens(text: string): Set<string> {
  const result = new Set<string>();
  const lower = text.normalize('NFKC').toLowerCase();
  for (const word of lower.match(/[a-z0-9][a-z0-9_+.-]*/g) || []) {
    if (!STOP.has(word) && word.length > 1) result.add(word);
  }
  for (const run of lower.match(
    /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]+/gu,
  ) || []) {
    const chars = [...run];
    for (let i = 0; i + 1 < chars.length; i++) result.add(chars[i] + chars[i + 1]);
  }
  return result;
}

export function memoryQuery(messages: readonly { role?: unknown; content?: unknown }[]): string {
  const users = messages.filter((m) => m.role === 'user');
  const plain = (m: (typeof users)[number] | undefined) => {
    if (typeof m?.content === 'string') return m.content;
    if (!Array.isArray(m?.content)) return '';
    return m.content
      .filter((p) => p?.type === 'text' && typeof p.text === 'string')
      .map((p) => p.text)
      .join(' ');
  };
  const current = plain(users.at(-1)).trim();
  if (
    !current ||
    /^(?:hi|hello|hey|thanks|thank you|你好|您好|谢谢|嗨)[!！。,.，\s]*$/i.test(current)
  )
    return '';
  const prior =
    current.length < 60 &&
    /^(?:继续|接着|还有|那|这个|刚才|上次|continue|and |what about|that|it\b)/i.test(current)
      ? plain(users.at(-2)).slice(0, 1500)
      : '';
  return (current.slice(0, 2000) + ' ' + prior).trim();
}

export function rankMemoryTexts(
  rows: readonly { text: string }[],
  query: string,
  limit = 6,
): { text: string }[] {
  if (!query.trim()) return [];
  const terms = tokens(query);
  const candidates = [...new Set(rows.map((r) => String(r.text || '').trim()).filter(Boolean))].map(
    (text, index) => ({ text, index, terms: tokens(text) }),
  );
  const df = new Map<string, number>();
  for (const row of candidates)
    for (const token of row.terms) df.set(token, (df.get(token) || 0) + 1);
  const recallAll =
    /你.{0,6}(?:记得|记住|了解)我|我的(?:记忆|个人信息)|what do you (?:remember|know) about me|saved memor/i.test(
      query,
    );
  const ranked = candidates.map((row) => {
    let score = 0;
    for (const token of terms)
      if (row.terms.has(token)) score += Math.log(1 + candidates.length / (df.get(token) || 1));
    // Prefer explicit response/language preferences without carrying unrelated biography.
    const preference =
      /^(?:response (?:style|language)|preferred (?:language|answer format)|回复语言|回答风格|输出格式)\s*[:：]/i.test(
        row.text,
      );
    return {
      ...row,
      score: score / Math.sqrt(Math.max(1, row.terms.size)) + (preference ? 0.5 : 0),
    };
  });
  return ranked
    .filter((r) => recallAll || r.score > 0)
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .slice(0, recallAll ? Math.max(limit, 12) : limit)
    .map(({ text }) => ({ text }));
}
