import { normalizeConceptMap, type ConceptMapResult } from '@socrates/core/learningBlocks';
import { callAPI } from './api.ts';
import type { ChatRequestMessage } from './api.ts';
import { CONCEPT_MAP_FORMAT, languageName } from '../tutor/conceptMap.ts';

export interface TopicKnowledgeMap {
  /** The dimension names, in learning order (3 to 5). */
  names: string[];
  /** RN-6: the same nodes with AI definitions and "why connected" links.
   * `status` is not 'ok' when the model returned names only (legacy shape). */
  map: ConceptMapResult;
}

export async function generateTopicKBNodes(topic: string, language: string): Promise<TopicKnowledgeMap | null> {
  const langName = languageName(language);
  const prompt = 'You are an expert curriculum designer. For the topic "' + topic + '", generate exactly 5 knowledge dimensions that systematically cover the subject.\n' +
    'The 5 dimensions MUST follow this structure (adapt the specific content to the topic):\n' +
    '0. Basic concepts - foundational definitions, key terms, vocabulary\n' +
    '1. Core principles - underlying mechanisms, derivations, causal logic\n' +
    '2. Practical applications - concrete real-world cases, problem-solving scenarios\n' +
    '3. Common problems and pitfalls - frequent mistakes, edge cases, misconceptions\n' +
    '4. Critical analysis and advanced topics - comparison, synthesis, deeper connections\n' +
    'Write ALL names, definitions, relations and reasons in ' + langName + '. Each name should be specific to the topic (not generic), at most 12 words.\n' +
    'List the 5 nodes in the order above, then the links between them.\n' +
    CONCEPT_MAP_FORMAT;
  const msgs: ChatRequestMessage[] = [
    { role: 'system', content: prompt },
    { role: 'user', content: 'Topic: ' + topic },
  ];
  try {
    const resp = await callAPI(msgs, 3000);
    if (!resp) return null;
    const map = normalizeConceptMap(String(resp), [], 5);
    if (map.nodes.length < 3) return null;
    return { names: map.nodes.map((node) => node.name), map };
  } catch {
    return null;
  }
}
