import { callAPI } from './api.js';

export async function generateTopicKBNodes(topic: string, language: string): Promise<string[] | null> {
  const langNames: Record<string, string> = { zh: 'Chinese', ja: 'Japanese', ko: 'Korean', ru: 'Russian', ar: 'Arabic', en: 'English' };
  const langName: string = langNames[language] || 'English';
  const prompt = 'You are an expert curriculum designer. For the topic "' + topic + '", generate exactly 5 knowledge dimensions that systematically cover the subject.\n' +
    'The 5 dimensions MUST follow this structure (adapt the specific content to the topic):\n' +
    '0. Basic concepts - foundational definitions, key terms, vocabulary\n' +
    '1. Core principles - underlying mechanisms, derivations, causal logic\n' +
    '2. Practical applications - concrete real-world cases, problem-solving scenarios\n' +
    '3. Common problems and pitfalls - frequent mistakes, edge cases, misconceptions\n' +
    '4. Critical analysis and advanced topics - comparison, synthesis, deeper connections\n' +
    'Write ALL dimension names in ' + langName + '. Each name should be specific to the topic (not generic).\n' +
    'Output ONLY a JSON array of 5 strings, no other text:\n' +
    '["dimension 0 name","dimension 1 name","dimension 2 name","dimension 3 name","dimension 4 name"]\n' +
    'Do NOT wrap in code fences. Do NOT add explanation.';
  const msgs = [{ role: 'system' as const, content: prompt }, { role: 'user' as const, content: 'Topic: ' + topic }];
  try {
    const resp = await callAPI(msgs, 2000);
    if (!resp) return null;
    let raw = String(resp).replace(/<think>[\s\S]*?<\/think>/gi, '').replace(/<think>[\s\S]*$/gi, '');
    raw = raw.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();
    const start = raw.indexOf('['), end = raw.lastIndexOf(']');
    if (start < 0 || end <= start) return null;
    const arr: string[] = JSON.parse(raw.slice(start, end + 1));
    if (!Array.isArray(arr) || arr.length < 3) return null;
    while (arr.length < 5) arr.push('Dimension ' + arr.length);
    return arr.slice(0, 5).map(function (s) { return String(s).trim(); }).filter(function (s) { return s.length > 0; });
  } catch (e) {
    return null;
  }
}
