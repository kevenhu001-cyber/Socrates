import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildKnowledgeGraph,
  conceptRelations,
  clampZoom,
  diagnosticReport,
  estimateLabelWidth,
  filterMistakeViews,
  fitZoom,
  formatSnapshotDate,
  groupMistakesByTopic,
  knowledgeCounts,
  knowledgeRelations,
  knowledgeSections,
  mistakeEmptyKind,
  mistakeView,
  nextConfidence,
  normalizeKnowledgeStatus,
  normalizeMistakeFilter,
  separateBoxes,
  snapshotHistory,
  truncateLabel,
  type GraphNodeBox,
} from './study/model.ts';

const NODES = [
  { name: 'Limits', status: 'internalized', questions: 9, confidence_score: 5 },
  { name: 'Derivatives', status: 'fuzzy', questions: 4, confidence_score: 2 },
  { name: 'Chain Rule', status: 'fuzzy', questions: 1 },
  { name: 'Integrals', status: 'unknown' },
  { name: 'A very long node name that should be truncated', status: 'internalized', questions: 16 },
];

test('status normalisation folds unknown values into blank', () => {
  assert.equal(normalizeKnowledgeStatus('internalized'), 'internalized');
  assert.equal(normalizeKnowledgeStatus('fuzzy'), 'fuzzy');
  assert.equal(normalizeKnowledgeStatus('weird'), 'blank');
  assert.equal(normalizeKnowledgeStatus(undefined), 'blank');
});

test('labels truncate by character, CJK-safe, and size by script', () => {
  assert.equal(truncateLabel('短名'), '短名');
  assert.equal(truncateLabel('一二三四五六七八九十十一'), '一二三四五六七八九…');
  assert.ok(estimateLabelWidth('导数导数') > estimateLabelWidth('abcd'));
});

test('graph: one pill per node, sequential edges, no overlaps, active flag', () => {
  const graph = buildKnowledgeGraph(NODES, 1);
  assert.equal(graph.nodes.length, 5);
  assert.deepEqual(graph.edges.map((edge) => [edge.from, edge.to]), [[0, 1], [1, 2], [2, 3], [3, 4]]);
  assert.equal(graph.nodes.filter((node) => node.active).map((node) => node.index).join(), '1');
  assert.equal(graph.nodes[4]!.label.endsWith('…'), true);
  assert.equal(graph.nodes[3]!.status, 'blank');
  for (const node of graph.nodes) {
    assert.ok(node.x >= 0 && node.y >= 0 && node.x + node.width <= graph.width && node.y + node.height <= graph.height);
  }
  for (let a = 0; a < graph.nodes.length; a += 1) {
    for (let b = a + 1; b < graph.nodes.length; b += 1) {
      const p = graph.nodes[a]!;
      const q = graph.nodes[b]!;
      const overlap = p.x < q.x + q.width && q.x < p.x + p.width && p.y < q.y + q.height && q.y < p.y + p.height;
      assert.equal(overlap, false, `${p.name} overlaps ${q.name}`);
    }
  }
  assert.deepEqual(buildKnowledgeGraph(NODES, 1), graph, 'layout is deterministic');
  assert.deepEqual(buildKnowledgeGraph([]), { nodes: [], edges: [], edgeKind: 'path', width: 0, height: 0 });
});

test('graph stays legible for a large map', () => {
  const many = Array.from({ length: 24 }, (_, index) => ({ name: `知识点 ${index + 1}`, status: index % 3 ? 'fuzzy' : 'blank' }));
  const graph = buildKnowledgeGraph(many);
  assert.equal(graph.nodes.length, 24);
  assert.equal(graph.edges.length, 23);
  assert.ok(graph.width > 280);
});

test('separateBoxes pushes stacked pills apart', () => {
  const box = (index: number): GraphNodeBox => ({ index, name: '', label: '', status: 'blank', questions: 0, confidence: 0, active: false, x: 0, y: 0, width: 60, height: 28 });
  const [a, b] = separateBoxes([box(0), box(1)]);
  assert.ok(Math.abs(a!.y - b!.y) >= 28 || Math.abs(a!.x - b!.x) >= 60);
});

test('zoom clamps and fits', () => {
  assert.equal(clampZoom(10), 2.5);
  assert.equal(clampZoom(0.1), 0.5);
  assert.equal(fitZoom({ width: 600, height: 400 }, { width: 300, height: 400 }), 0.75);
  assert.equal(fitZoom({ width: 600, height: 400 }, { width: 300, height: 400 }, 0.5), 0.5);
  assert.equal(fitZoom({ width: 400, height: 200 }, { width: 320, height: 280 }), 0.8);
  assert.equal(fitZoom({ width: 200, height: 100 }, { width: 300, height: 400 }), 1);
  assert.equal(fitZoom({ width: 0, height: 0 }, { width: 300, height: 400 }), 1);
});

test('relations are the neighbours on the learning path', () => {
  assert.deepEqual(knowledgeRelations(NODES, 0).map((r) => [r.role, r.name]), [['after', 'Derivatives']]);
  assert.deepEqual(knowledgeRelations(NODES, 2).map((r) => [r.role, r.index, r.status]), [['before', 1, 'fuzzy'], ['after', 3, 'blank']]);
  assert.deepEqual(knowledgeRelations(NODES, 4).map((r) => r.role), ['before']);
});

test('sections keep legacy order and drop empty groups', () => {
  const sections = knowledgeSections(NODES);
  assert.deepEqual(sections.map((s) => [s.status, s.entries.map((e) => e.index)]), [['internalized', [0, 4]], ['fuzzy', [1, 2]], ['blank', [3]]]);
  assert.deepEqual(knowledgeSections([{ name: 'x', status: 'fuzzy' }]).map((s) => s.status), ['fuzzy']);
  assert.deepEqual(knowledgeCounts(NODES), { internalized: 2, fuzzy: 2, blank: 1 });
});

test('snapshot history: newest first, eight max, date fallbacks', () => {
  const history = Array.from({ length: 10 }, (_, index) => ({ date: `2026-09-${String(index + 1).padStart(2, '0')}`, summary: `s${index}` }));
  const rows = snapshotHistory(history);
  assert.equal(rows.length, 8);
  assert.equal(rows[0]!.date, '2026-09-10');
  assert.equal(formatSnapshotDate({ at: Date.UTC(2026, 8, 20) }), '2026-09-20');
  assert.equal(formatSnapshotDate({ at: Number.NaN }), '');
  assert.equal(formatSnapshotDate({}), '');
});

test('confidence toggle clears on the same step', () => {
  assert.equal(nextConfidence(3, 3), 0);
  assert.equal(nextConfidence(3, 4), 4);
});

test('diagnostic report ranks gaps first and keeps learning order', () => {
  const report = diagnosticReport([
    { name: 'A', status: 'fuzzy' },
    { name: 'B', status: 'blank' },
    { name: 'C', status: 'fuzzy' },
    { name: 'D', status: 'blank' },
    { name: 'E', status: 'blank' },
    { name: 'F', status: 'blank' },
  ]);
  assert.equal(report.total, 6);
  assert.equal(report.familiar, 2);
  assert.equal(report.blank, 4);
  assert.equal(report.coverage, 33);
  assert.deepEqual(report.ranked.map((node) => node.name), ['B', 'D', 'E', 'F', 'A', 'C']);
  assert.deepEqual(report.ranked.map((node) => node.rank), [1, 2, 3, 4, 5, 6]);
  assert.equal(report.startsWith, 'A');
  assert.deepEqual(report.focus, ['B', 'D', 'E']);
  assert.deepEqual(diagnosticReport([]), { total: 0, familiar: 0, blank: 0, coverage: 0, ranked: [], startsWith: null, focus: [] });
});

test('mistake view tags options and spells out both answers', () => {
  const quiz = mistakeView({ id: 'm1', type: 'quiz', topic: '导数', q: 'd/dx x²', options: [{ letter: 'A', text: '2x' }, { letter: 'B', text: 'x' }], correct: 'A', userAnswer: 'B', redoCount: 3, resolved: true });
  assert.deepEqual(quiz.options.map((o) => o.tag), ['correct', 'wrong']);
  assert.equal(quiz.yourAnswer, 'B · x');
  assert.equal(quiz.correctAnswer, 'A · 2x');
  assert.equal(quiz.resolved, true);
  assert.equal(quiz.redoCount, 3);

  const practice = mistakeView({ id: 'm2', type: 'practice', q: '∫x dx', options: [], correct: 'x²/2', userAnswer: 'x', isResolved: false, redoCount: -1 });
  assert.equal(practice.yourAnswer, 'x');
  assert.equal(practice.correctAnswer, 'x²/2');
  assert.equal(practice.redoCount, 0);

  const legacy = mistakeView({ id: 'm3', options: ['yes', 'no'], correct: null, judgedAnswer: 'B', userAnswer: null, isResolved: true });
  assert.deepEqual(legacy.options.map((o) => o.letter), ['A', 'B']);
  assert.equal(legacy.correctAnswer, 'B · no');
  assert.equal(legacy.yourAnswer, null);
  assert.equal(legacy.resolved, true);
});

test('mistake filter, empty states and topic groups', () => {
  const rows = [
    mistakeView({ id: '1', topic: '导数', resolved: true }),
    mistakeView({ id: '2', topic: '积分' }),
    mistakeView({ id: '3', topic: '' }),
    mistakeView({ id: '4', topic: '导数' }),
  ];
  assert.equal(normalizeMistakeFilter('resolved'), 'resolved');
  assert.equal(normalizeMistakeFilter('x'), 'all');
  assert.deepEqual(filterMistakeViews(rows, 'unresolved').map((r) => r.id), ['2', '3', '4']);
  assert.deepEqual(filterMistakeViews(rows, 'resolved').map((r) => r.id), ['1']);
  assert.equal(mistakeEmptyKind(0, 0, 'all'), 'empty');
  assert.equal(mistakeEmptyKind(2, 0, 'resolved'), 'filterResolved');
  assert.equal(mistakeEmptyKind(2, 0, 'unresolved'), 'filterOther');
  assert.equal(mistakeEmptyKind(2, 1, 'all'), null);
  assert.deepEqual(groupMistakesByTopic(rows).map((g) => [g.topic, g.items.map((r) => r.id)]), [['导数', ['1', '4']], ['积分', ['2']], ['', ['3']]]);
});

/* RN-6: AI-written concept links, definitions and mistake analysis. */
test('concept links replace the learning path as graph edges and carry their reason', () => {
  const nodes = [
    { name: 'Prior', links: [{ target: 'Posterior', relation: 'feeds into', why: 'The posterior is the prior reweighted by the evidence.' }] },
    { name: 'Likelihood', links: [{ target: 'posterior', why: 'It measures how well each hypothesis explains the data.' }, { target: 'Nowhere', why: 'x' }] },
    { name: 'Posterior', definition: 'Belief after the evidence.' },
  ];
  const graph = buildKnowledgeGraph(nodes);
  assert.equal(graph.edgeKind, 'concept');
  assert.deepEqual(graph.edges.map((edge) => [edge.from, edge.to]), [[0, 2], [1, 2]]);
  const relations = conceptRelations(nodes, 2);
  assert.deepEqual(relations.map((relation) => [relation.index, relation.direction, relation.relation]), [[0, 'in', 'feeds into'], [1, 'in', null]]);
  assert.match(relations[1]!.why, /explains the data/);
  assert.deepEqual(conceptRelations(nodes, 0).map((relation) => relation.index), [2]);
});

test('nodes without concept links keep the learning-path edges (older sessions)', () => {
  const graph = buildKnowledgeGraph([{ name: 'A' }, { name: 'B' }, { name: 'C' }]);
  assert.equal(graph.edgeKind, 'path');
  assert.deepEqual(graph.edges.map((edge) => [edge.from, edge.to]), [[0, 1], [1, 2]]);
  assert.deepEqual(conceptRelations([{ name: 'A' }, { name: 'B' }], 0), []);
});

test('mistake analysis surfaces only what the model wrote', () => {
  const withAnalysis = mistakeView({ id: 'a', q: 'Q', analysis: { whyWrong: ' Confused P(A|B) with P(B|A). ', correctApproach: '' } });
  assert.equal(withAnalysis.whyWrong, 'Confused P(A|B) with P(B|A).');
  assert.equal(withAnalysis.rightWay, null);
  const legacy = mistakeView({ id: 'b', q: 'Q' });
  assert.equal(legacy.whyWrong, null);
  assert.equal(legacy.rightWay, null);
});
