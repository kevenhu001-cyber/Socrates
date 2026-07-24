export interface KBNode {
  name: string;
  status: string;
  questions?: number;
  system_note?: string;
  user_note?: string;
  confidence_score?: number;
  history?: Array<{ date: string; from: string; to: string; reason: string }>;
  [key: string]: unknown;
}

export interface DiagOpt {
  letter: string;
  text: string;
  level: string;
}

export interface DiagQuestion {
  q: string;
  opts: DiagOpt[];
  nodeIdx?: number;
  knowledgePoint?: string;
  subarea?: string;
}

export interface DiagState {
  diagQuestions: DiagQuestion[];
  diagAnswers: (number | undefined)[];
  kbNodes: KBNode[];
}

export function applyDiagnosticResults(state: DiagState): void {
  state.diagQuestions.forEach(function (q: DiagQuestion, i: number) {
    const ans = state.diagAnswers[i];
    if (ans === undefined || ans === -1) return;
    const level = q.opts[ans].level;
    const nodeIdx = typeof q.nodeIdx === 'number' ? Math.max(0, Math.min(q.nodeIdx, state.kbNodes.length - 1)) : i;
    const node = state.kbNodes[nodeIdx];
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
}
