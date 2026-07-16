export function applyDiagnosticResults(state) {
  state.diagQuestions.forEach(function (q, i) {
    var ans = state.diagAnswers[i];
    if (ans === undefined || ans === -1) return;
    var level = q.opts[ans].level;
    var nodeIdx = typeof q.nodeIdx === 'number' ? Math.max(0, Math.min(q.nodeIdx, state.kbNodes.length - 1)) : i;
    var node = state.kbNodes[nodeIdx];
    if (!node) return;
    var newStatus = level === 'blank' ? 'blank' : 'fuzzy';
    if (node.status !== newStatus) {
      node.history = node.history || [];
      node.history.push({
        date: new Date().toISOString().slice(0, 10),
        from: node.status,
        to: newStatus,
        reason: 'cold-start diagnostic (baseline, not mastery)'
      });
      node.status = newStatus;
    }
    if (q.knowledgePoint) {
      var kpNote = 'Tested knowledge point: ' + q.knowledgePoint + ' (baseline: ' + newStatus + '). ';
      node.system_note = (node.system_note || '') + kpNote;
    }
    if (q.subarea && i < 2 && node.name.indexOf(q.subarea) === -1 && q.subarea !== 'Sub-area ' + (i + 1)) {
      node.system_note = (node.system_note || '') + 'Sub-area: ' + q.subarea + '. ';
    }
  });
}
