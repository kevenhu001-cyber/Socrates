/**
 * RN-6 — AI-written content for the knowledge map: a definition on every
 * node and, on each link, a sentence on why the two ideas are connected
 * (a real conceptual relation, not the order of the lesson).
 *
 * Generated once with the session's knowledge dimensions (see
 * chat/topicKbNodes.ts) and again on demand when the learner picks
 * "See connections" in a session, using the conversation so far. The model
 * output goes through the shared normalizer (@socrates/core/learningBlocks);
 * nothing is shown that the model did not write.
 *
 * Storage stays inside `kbNodes`, so it persists with the session as is:
 *   node.definition  string            AI definition of the node
 *   node.links       ConceptLinkRecord AI links that start at this node
 * Old sessions have neither and the map shows what it showed before.
 */
import { normalizeConceptMap, stripNextQuestions, type ConceptMapResult } from '@socrates/core/learningBlocks';
import { callAPI, type ChatRequestMessage } from '../chat/api.ts';
import { stateStore } from '../state/store.ts';
import { getCurrentLanguage } from '../i18n/languageState.ts';
import { saveCurrentSession } from '../session/persistence.ts';
import { reportSwallow } from '../util/reportSwallow.ts';
import type { KbNode } from '../state/kb.ts';

export interface ConceptLinkRecord {
  target: string;
  relation?: string;
  why: string;
}

const LANG_NAMES: Record<string, string> = { zh: 'Chinese', ja: 'Japanese', ko: 'Korean', ru: 'Russian', ar: 'Arabic', en: 'English' };
export const CONCEPT_MAP_MAX_NODES = 8;

export function languageName(language: string): string {
  return LANG_NAMES[language] || 'English';
}

/** The JSON contract both concept-map prompts share. */
export const CONCEPT_MAP_FORMAT =
  'Output ONLY one JSON object, no code fences, no other text:\n' +
  '{"nodes":[{"name":"exact node name","definition":"one or two sentences"}],' +
  '"links":[{"from":"node name","to":"node name","relation":"2 to 6 words","why":"one sentence"}]}\n' +
  'Rules:\n' +
  '- "definition" says what the idea is, precisely, in plain words a learner can hold on to. No circular definitions.\n' +
  '- A link names a real conceptual relation (depends on, is a special case of, generalizes, is the inverse of, explains, contrasts with, is an application of). ' +
  '"why" says in one sentence why that relation holds for these two ideas. Never describe the order of the lesson or "comes next" as a relation.\n' +
  '- Only link ideas that are genuinely related; skip a pair rather than invent a link. Each node should have at least one link when an honest one exists.\n' +
  '- Inside strings never use ASCII double quotes; use 「」 for CJK or no quotes.';

/** Write a normalized concept map onto the session's nodes. Returns the new list. */
export function applyConceptMap(nodes: readonly KbNode[], map: ConceptMapResult, opts: { replaceDefinitions?: boolean } = {}): KbNode[] {
  if (map.status !== 'ok') return nodes.slice();
  const out: KbNode[] = map.nodes.map((entry, index) => {
    const existing = nodes[index];
    const base: KbNode = existing ? { ...existing } : { name: entry.name, status: 'blank', questions: 0, system_note: '', user_note: '', confidence_score: 0, history: [] };
    if (entry.definition && (opts.replaceDefinitions || typeof base.definition !== 'string' || !base.definition)) {
      base.definition = entry.definition;
    }
    return base;
  });
  const linksByNode = new Map<number, ConceptLinkRecord[]>();
  for (const link of map.links) {
    const record: ConceptLinkRecord = { target: map.nodes[link.to]!.name, why: link.why };
    if (link.relation) record.relation = link.relation;
    const list = linksByNode.get(link.from) ?? [];
    list.push(record);
    linksByNode.set(link.from, list);
  }
  if (map.links.length) {
    /* A fresh set of links replaces the old one as a whole: links are judged
       together, so mixing generations would keep links the model dropped. */
    out.forEach((node, index) => {
      const list = linksByNode.get(index);
      if (list) node.links = list;
      else delete node.links;
    });
  }
  return out;
}

/* --------------------------------------------------------- on-demand refresh */

export type ConceptMapStatus = 'idle' | 'loading' | 'error';
let status: ConceptMapStatus = 'idle';
const listeners = new Set<() => void>();

function setStatus(next: ConceptMapStatus): void {
  if (next === status) return;
  status = next;
  listeners.forEach((listener) => listener());
}

export function getConceptMapStatus(): ConceptMapStatus {
  return status;
}

export function subscribeConceptMapStatus(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function conversationExcerpt(limit = 8, perMessage = 700): string {
  const messages = (stateStore.read('messages') || []) as ReadonlyArray<{ role?: string; rawText?: string }>;
  return messages
    .filter((message) => (message.role === 'user' || message.role === 'assistant') && typeof message.rawText === 'string' && message.rawText.trim())
    .slice(-limit)
    .map((message) => {
      const text = stripNextQuestions(message.rawText!).replace(/\s+/g, ' ').trim();
      const clipped = Array.from(text).length > perMessage ? Array.from(text).slice(0, perMessage).join('') + '…' : text;
      return (message.role === 'user' ? 'Learner: ' : 'Tutor: ') + clipped;
    })
    .join('\n');
}

let inflight: Promise<boolean> | null = null;

/**
 * Ask the model to add or update the map's definitions and links from the
 * conversation so far. Resolves true when the map changed. One refresh runs
 * at a time; a second request while one is running joins it.
 */
export function refreshConceptMap(_reason: 'conversation' = 'conversation'): Promise<boolean> {
  if (inflight) return inflight;
  inflight = (async () => {
    const sessionId = stateStore.read('currentSessionId');
    const nodes = (stateStore.read('kbNodes') || []) as KbNode[];
    if (!nodes.length) return false;
    setStatus('loading');
    try {
      const names = nodes.map((node) => node.name);
      const topic = String(stateStore.read('domain') || stateStore.read('topic') || '');
      const prompt =
        'You maintain a learner\'s knowledge map for the topic: ' + topic + '.\n' +
        'Current nodes, in order: ' + JSON.stringify(names) + '.\n' +
        'Using the conversation excerpt, write or improve the definition of every current node, add at most ' +
        Math.max(0, CONCEPT_MAP_MAX_NODES - names.length) + ' new nodes only for central ideas the conversation introduced that the map lacks ' +
        '(reuse the exact names above for existing nodes), and write the links between all nodes.\n' +
        'Write every definition, relation and why in ' + languageName(getCurrentLanguage()) + ', matching the language of the conversation.\n' +
        CONCEPT_MAP_FORMAT;
      const msgs: ChatRequestMessage[] = [
        { role: 'system', content: prompt },
        { role: 'user', content: 'Conversation excerpt:\n' + (conversationExcerpt() || '(no messages yet)') },
      ];
      const resp = await callAPI(msgs, 3000);
      if (stateStore.read('currentSessionId') !== sessionId) return false;
      const map = normalizeConceptMap(typeof resp === 'string' ? resp : '', names, CONCEPT_MAP_MAX_NODES);
      if (map.status !== 'ok') {
        setStatus('error');
        return false;
      }
      const latest = (stateStore.read('kbNodes') || []) as KbNode[];
      stateStore.dispatch({ type: 'state/set', key: 'kbNodes', value: applyConceptMap(latest, map, { replaceDefinitions: true }) });
      try { saveCurrentSession(); } catch (error) { reportSwallow(error, 'tutor/conceptMap.save'); }
      setStatus('idle');
      return true;
    } catch (error) {
      reportSwallow(error, 'tutor/conceptMap.refresh');
      setStatus('error');
      return false;
    } finally {
      inflight = null;
    }
  })();
  return inflight;
}
