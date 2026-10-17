/** One option of a cold-start diagnostic question. */
export interface DiagnosticOption {
  level?: string;
  [key: string]: unknown;
}

export interface DiagnosticQuestion {
  opts: DiagnosticOption[];
  nodeIdx?: number;
  knowledgePoint?: string;
  subarea?: string;
  [key: string]: unknown;
}

export interface KbHistoryEntry {
  date: string;
  from?: string;
  to: string;
  reason: string;
}

export interface DiagnosticKbNode {
  name: string;
  status?: string;
  history?: KbHistoryEntry[];
  system_note?: string;
  [key: string]: unknown;
}

/** The tutor-store slice the diagnostic writes back into. */
export interface DiagnosticState {
  kbNodes?: DiagnosticKbNode[] | null;
  diagQuestions: DiagnosticQuestion[];
  diagAnswers: Array<number | undefined>;
}

export function applyDiagnosticResults(state: DiagnosticState): DiagnosticKbNode[] {
  const kbNodes: DiagnosticKbNode[] = (state.kbNodes || []).map((node) => Object.assign({}, node, {
    history: Array.isArray(node.history) ? node.history.slice() : node.history,
  }));
  state.diagQuestions.forEach((q, i) => {
    const ans = state.diagAnswers[i];
    if (ans === undefined || ans === -1) return;
    const level = q.opts[ans].level;
    const nodeIdx = typeof q.nodeIdx === 'number' ? Math.max(0, Math.min(q.nodeIdx, kbNodes.length - 1)) : i;
    const node = kbNodes[nodeIdx];
    if (!node) return;
    const newStatus = level === 'blank' ? 'blank' : 'fuzzy';
    if (node.status !== newStatus) {
      node.history = node.history || [];
      node.history.push({
        date: new Date().toISOString().slice(0, 10),
        from: node.status,
        to: newStatus,
        reason: 'cold-start diagnostic (baseline, not mastery)',
      });
      node.status = newStatus;
    }
    if (q.knowledgePoint) {
      const kpNote = 'Tested knowledge point: ' + q.knowledgePoint + ' (baseline: ' + newStatus + '). ';
      node.system_note = (node.system_note || '') + kpNote;
    }
    if (q.subarea && i < 2 && node.name.indexOf(q.subarea) === -1 && q.subarea !== 'Sub-area ' + (i + 1)) {
      node.system_note = (node.system_note || '') + 'Sub-area: ' + q.subarea + '. ';
    }
  });
  return kbNodes;
}
