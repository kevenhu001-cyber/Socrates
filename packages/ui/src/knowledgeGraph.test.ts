import assert from 'node:assert/strict';
import test from 'node:test';
import { knowledgeNodeRadius, layoutKnowledgeGraph } from './knowledgeGraph.ts';

test('knowledge graph layout is stable and returns points within its view box', () => {
  const nodes = [{ questions: 0 }, { questions: 3 }, { questions: 12 }, { questions: 1 }];
  const first = layoutKnowledgeGraph(nodes);
  const second = layoutKnowledgeGraph(nodes);
  assert.deepEqual(first, second);
  assert.equal(first.length, nodes.length);
  for (const point of first) {
    assert.ok(point.x >= 26 && point.x <= 294);
    assert.ok(point.y >= 26 && point.y <= 214);
    assert.ok(Number.isFinite(point.x) && Number.isFinite(point.y));
  }
});

test('knowledge graph handles empty and single-node graphs and scales node size sub-linearly', () => {
  assert.deepEqual(layoutKnowledgeGraph([]), []);
  assert.deepEqual(layoutKnowledgeGraph([{}]), [{ x: 160, y: 120 }]);
  assert.equal(knowledgeNodeRadius({}), 7);
  assert.equal(knowledgeNodeRadius({ questions: 4 }), 15);
  assert.equal(knowledgeNodeRadius({ questions: 100 }), 22);
});
