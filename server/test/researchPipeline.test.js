import test from 'node:test';
import assert from 'node:assert/strict';
import { executeResearch, abortable } from '../src/services/core/researchPipeline.js';
import { researchReportToLatex } from '../src/services/core/researchArtifact.js';

function fixture() {
  const events = [];
  let completions = 0;
  return { events, ports: {
    complete: async () => ++completions === 1 ? '["primary evidence","counter evidence"]' : 'Evidence-based report [1]',
    search: async () => [{ url: 'https://example.org/paper#section', title: 'Paper', content: 'Evidence' }],
    read: async (sources) => sources,
    checkpoint: async (steps, stage) => events.push({ steps, stage }),
  } };
}

test('research keeps a LaTeX companion and escapes report instructions as literal text', () => {
  const source = researchReportToLatex('研究 & 证据', '\\input{private} #1 $value', []);
  assert.match(source, /\\documentclass\[11pt\]\{ctexart\}/);
  assert.ok(source.includes('\\textbackslash{}input\\{private\\}'));
  assert.ok(source.includes('\\#1 \\$value'));
  assert.doesNotMatch(source, /\\input\{/);
});

test('research persists every stage, deduplicates sources and bounds evidence', async () => {
  const { ports, events } = fixture();
  const steps = await executeResearch('question', {}, ports, new AbortController().signal);
  assert.equal(steps.report, 'Evidence-based report [1]');
  assert.deepEqual(events.map((event) => event.stage), ['planning', 'searching', 'searching', 'reading', 'synthesizing', 'synthesizing']);
  assert.equal(steps.sources.length, 1);
  assert.equal(steps.sources[0].url, 'https://example.org/paper');
  assert.equal(events[1].steps.searches.length, 1); // snapshots do not mutate
});

test('research resumes a saved search checkpoint without repeating completed calls', async () => {
  const { ports } = fixture();
  const queries = [];
  ports.search = async (query) => { queries.push(query); return []; };
  ports.complete = async () => 'Recovered report [1]';
  const previous = { plan: ['done', 'remaining'], searches: [[{ url: 'https://example.org', title: 'saved', content: 'saved evidence' }]] };
  const result = await executeResearch('question', previous, ports, new AbortController().signal);
  assert.deepEqual(queries, ['remaining']);
  assert.equal(previous.searches.length, 1);
  assert.equal(result.report, 'Recovered report [1]');
});

test('research refinement focus reaches both planning and synthesis prompts', async () => {
  const { ports } = fixture();
  const prompts = [];
  const complete = ports.complete;
  ports.complete = async (messages, maxTokens, signal) => {
    prompts.push(messages);
    return complete(messages, maxTokens, signal);
  };
  await executeResearch('question', { focus: 'Compare primary sources and call out disagreements.' }, ports, new AbortController().signal);
  assert.match(prompts[0][0].content, /Additional user focus: Compare primary sources/);
  assert.match(prompts[0][1].content, /Additional user focus: Compare primary sources/);
  assert.match(prompts.at(-1)[1].content, /Additional user focus: Compare primary sources/);
});

test('invalid planning JSON uses a bounded fallback; no sources fails before synthesis', async () => {
  const { ports } = fixture();
  let completions = 0;
  ports.complete = async () => { completions++; return 'not JSON'; };
  ports.search = async () => [{ url: 'javascript:alert(1)', title: 'invalid', content: 'invalid' }];
  await assert.rejects(executeResearch('question', {}, ports, new AbortController().signal), /research_no_sources/);
  assert.equal(completions, 1);
});

test('cancellation stops waiting on an upstream operation and prevents checkpoints', async () => {
  const { ports, events } = fixture();
  const controller = new AbortController();
  let started;
  const ready = new Promise((resolve) => { started = resolve; });
  ports.complete = async () => { started(); return new Promise(() => {}); };
  const pending = executeResearch('question', {}, ports, controller.signal);
  await ready;
  controller.abort(new Error('cancelled'));
  await assert.rejects(pending, /cancelled/);
  assert.equal(events.length, 0);
  await assert.rejects(abortable(Promise.reject(new Error('late failure')), controller.signal), /cancelled/);
});

test('completed synthesis checkpoint is reused without provider work', async () => {
  const { ports, events } = fixture();
  ports.complete = ports.search = ports.read = async () => { throw new Error('must not execute'); };
  const saved = { plan: ['done'], searches: [[]], sources: [{ url: 'https://example.org', title: 'Saved', content: 'Saved' }], report: 'Saved report' };
  assert.deepEqual(await executeResearch('question', saved, ports, new AbortController().signal), saved);
  assert.equal(events.length, 0);
});
