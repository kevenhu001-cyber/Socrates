// @ts-check
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { appRouteFixture } from './_appRouteFixture.js';
import {
  agentRuns, agentRunEvents, researchJobs, researchJobEvents,
  executions, chatTurns, chatTurnEvents,
} from '../src/db/schema/index.js';

const f = appRouteFixture();
const ids = { runs: [], jobs: [], executions: [], turns: [] };

test('real HTTP history endpoints authenticate and isolate run, job, execution, and turn records by owner', async () => {
  const [run, foreignRun] = await f.db.insert(agentRuns).values([
    { userId: f.owner.id, task: 'owner run', status: 'completed', summary: 'finished' },
    { userId: f.other.id, task: 'foreign run', status: 'completed' },
  ]).returning();
  ids.runs.push(run.id, foreignRun.id);
  await f.db.insert(agentRunEvents).values([
    { runId: run.id, sequence: 1, event: 'step', payload: { label: 'seeded step' } },
    { runId: run.id, sequence: 2, event: 'result', payload: { text: 'done' } },
  ]);

  const [job, foreignJob] = await f.db.insert(researchJobs).values([
    { userId: f.owner.id, query: 'seeded query', idempotencyKey: randomUUID(), status: 'queued', eventSequence: 2 },
    { userId: f.other.id, query: 'private query', idempotencyKey: randomUUID(), status: 'queued' },
  ]).returning();
  ids.jobs.push(job.id, foreignJob.id);
  await f.db.insert(researchJobEvents).values([
    { jobId: job.id, sequence: 1, stage: 'search', status: 'started' },
    { jobId: job.id, sequence: 2, stage: 'search', status: 'completed' },
  ]);

  const [execution, foreignExecution] = await f.db.insert(executions).values([
    { userId: f.owner.id, code: 'print(1)', status: 'completed', stdout: 'safe output', exitCode: 0 },
    { userId: f.other.id, code: 'secret()', status: 'completed', stdout: 'private output' },
  ]).returning();
  ids.executions.push(execution.id, foreignExecution.id);

  const [turn, foreignTurn] = await f.db.insert(chatTurns).values([
    { userId: f.owner.id, clientTurnId: randomUUID(), status: 'completed', fullText: 'turn answer' },
    { userId: f.other.id, clientTurnId: randomUUID(), status: 'completed', fullText: 'private answer' },
  ]).returning();
  ids.turns.push(turn.id, foreignTurn.id);
  await f.db.insert(chatTurnEvents).values([
    { turnId: turn.id, sequence: 1, event: 'content', payload: { delta: 'hello' } },
    { turnId: turn.id, sequence: 2, event: 'done', payload: {} },
  ]);

  for (const path of ['/api/agent-runs', '/api/research-jobs', '/api/chat-turns', `/api/executions/${execution.id}/stream`]) {
    assert.equal((await f.request(path, { as: null })).status, 401, `unauthenticated ${path}`);
  }

  const runPage = await f.request('/api/agent-runs?limit=1');
  assert.equal(runPage.status, 200);
  assert.deepEqual(runPage.body.runs.map((row) => row.id), [run.id]);
  assert.equal((await f.request(`/api/agent-runs/${run.id}`)).body.events.length, 2);
  assert.equal((await f.request(`/api/agent-runs/${foreignRun.id}`)).status, 404);

  const jobPage = await f.request('/api/research-jobs');
  assert.equal(jobPage.status, 200);
  assert.deepEqual(jobPage.body.jobs.map((row) => row.id), [job.id]);
  assert.equal((await f.request(`/api/research-jobs/${foreignJob.id}`)).status, 404);
  assert.equal((await f.request('/api/research-jobs/not-a-uuid')).status, 400);
  assert.equal((await f.request('/api/research-jobs?sessionId=bad')).status, 400);
  assert.equal((await f.request(`/api/research-jobs/${job.id}/cancel`, { method: 'POST' })).status, 200);

  const turnPage = await f.request('/api/chat-turns?limit=1');
  assert.equal(turnPage.status, 200);
  assert.deepEqual(turnPage.body.turns.map((row) => row.id), [turn.id]);
  assert.equal((await f.request(`/api/chat-turns/${turn.id}`)).body.events.length, 2);
  assert.equal((await f.request(`/api/chat-turns/${foreignTurn.id}`)).status, 404);
  assert.equal((await f.request(`/api/chat-turns/${turn.id}/events?after=-1`)).status, 400);

  const stream = await f.request(`/api/executions/${execution.id}/stream`);
  assert.equal(stream.status, 200);
  assert.match(stream.text, /event: result/);
  assert.match(stream.text, /safe output/);
  assert.equal((await f.request(`/api/executions/${foreignExecution.id}/stream`)).status, 404);
  assert.equal((await f.request('/api/executions/not-a-uuid/stream')).status, 400);
});
