import { callAPI } from './api.ts';
import type { ChatRequestMessage } from './api.ts';

const LANG_NAMES: Record<string, string> = {
  zh: 'Chinese',
  ja: 'Japanese',
  ko: 'Korean',
  ru: 'Russian',
  ar: 'Arabic',
  en: 'English',
};

export async function generateTopicKBNodes(topic: string, language: string): Promise<string[] | null> {
  const langName = LANG_NAMES[language] || 'English';
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
  const msgs: ChatRequestMessage[] = [
    { role: 'system', content: prompt },
    { role: 'user', content: 'Topic: ' + topic },
  ];
  try {
    const resp = await callAPI(msgs, 2000);
    if (!resp) return null;
    let raw = String(resp).replace(/<think>[\s\S]*?<\/think>/gi, '').replace(/<think>[\s\S]*$/gi, '');
    raw = raw.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();
    const start = raw.indexOf('[');
    const end = raw.lastIndexOf(']');
    if (start < 0 || end <= start) return null;
    const parsed: unknown = JSON.parse(raw.slice(start, end + 1));
    if (!Array.isArray(parsed) || parsed.length < 3) return null;
    const arr: unknown[] = parsed;
    while (arr.length < 5) arr.push('Dimension ' + arr.length);
    return arr.slice(0, 5)
      .map((s) => String(s).trim())
      .filter((s) => s.length > 0);
  } catch {
    return null;
  }
}
