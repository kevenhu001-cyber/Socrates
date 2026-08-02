/**
 * Parity tests between the Rust mechanism library (WASM) and the TS
 * reference implementations in src/.
 *
 * The wasm module is loaded directly here — NOT through lib/socratesWasm.js —
 * so the global `wasmApi` stays null and the TS functions in toolRunState.ts
 * take their pure-TS fallback path. Every case below asserts the WASM output
 * equals the TS output for the same input.
 *
 * Skips gracefully when frontend/wasm/ has not been built (`npm run build:wasm`).
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

import {
  TOOL_RUN_PHASES,
  isTerminalToolPhase,
  phaseFromProgress,
  transitionToolRun,
  summarizeToolRuns,
} from '../src/chat/toolRunState.ts';
import { truncateDetailLines, toolCategory } from '../src/ui/toolInline.ts';
import { createLiveOutputBuffer, renderLivePreview } from '../src/chat/liveOutput.ts';

const wasmJsUrl = new URL('../wasm/socrates_wasm.js', import.meta.url);
const wasmBgUrl = new URL('../wasm/socrates_wasm_bg.wasm', import.meta.url);

let wasm = null;

async function loadWasm(t) {
  if (wasm) return wasm;
  try {
    const bytes = new Uint8Array(await readFile(fileURLToPath(wasmBgUrl)));
    const mod = await import(wasmJsUrl.href);
    const init = mod.default || mod.init;
    await init(bytes);
    wasm = mod;
    return wasm;
  } catch (err) {
    if (err && err.code === 'ENOENT') {
      t.skip('frontend/wasm/ not built — run `npm run build:wasm` first');
      return null;
    }
    throw err;
  }
}

test('wasm phase mapping matches TS phaseFromProgress', async (t) => {
  const w = await loadWasm(t);
  if (!w) return;

  const cases = [
    null,
    {},
    { phase: 'queued' },
    { phase: 'ready' },
    { phase: 'preparing' },
    { phase: 'booting' },
    { phase: 'completed' },
    { phase: 'complete' },
    { phase: 'cancelled' },
    { phase: 'skipped' },
    { phase: 'timeout' },
    { phase: 'timeout_warning' },
    { phase: 'failed' },
    { phase: 'error' },
    { phase: 'RUNNING' }, // case-insensitivity
    { phase: 'Queued' },
    { phase: 'mystery-phase' }, // unknown passthrough → running
    { phase: '' },
  ];
  for (const input of cases) {
    const progress = input && input.phase !== undefined ? input : input;
    assert.equal(
      w.phase_from_progress_js(String((progress && progress.phase) || '')),
      phaseFromProgress(progress),
      `phaseFromProgress mismatch for ${JSON.stringify(progress)}`,
    );
  }
});

test('wasm is_terminal_phase matches TS', async (t) => {
  const w = await loadWasm(t);
  if (!w) return;

  for (const phase of [
    ...Object.values(TOOL_RUN_PHASES),
    '',
    'unknown',
    'preparing',
    'Succeeded',
  ]) {
    assert.equal(w.is_terminal_phase(String(phase || '')), isTerminalToolPhase(phase), `phase ${phase}`);
  }
});

test('wasm transition_run matches TS transitionToolRun', async (t) => {
  const w = await loadWasm(t);
  if (!w) return;

  const runs = [
    null,
    { id: 'run-1', phase: TOOL_RUN_PHASES.preparing },
    { id: 'run-2', phase: TOOL_RUN_PHASES.running },
    { id: 'run-3', phase: TOOL_RUN_PHASES.succeeded },
    { id: 'run-4', phase: TOOL_RUN_PHASES.failed },
  ];
  const nextPhases = [
    undefined,
    '',
    'running',
    'queued',
    'preparing',
    'succeeded',
    'failed',
    'cancelled',
    'timed_out',
    'timeout',
    'mystery',
    'Succeeded',
  ];
  for (const run of runs) {
    for (const nextPhase of nextPhases) {
      const expected = transitionToolRun(run, nextPhase, { startedAt: 1 });
      if (!run || !isTerminalToolPhase(run.phase)) {
        const wPhase = w.transition_run(
          String((run && run.phase) || TOOL_RUN_PHASES.preparing),
          String(nextPhase || ''),
        );
        assert.equal(wPhase, expected.phase, `transition phase for run=${JSON.stringify(run)} next=${nextPhase}`);
      }
    }
  }
  // Identity: terminal runs return the same object (first-terminal-wins).
  const failed = transitionToolRun({ id: 'run-5', phase: TOOL_RUN_PHASES.failed }, 'succeeded');
  assert.equal(failed.phase, TOOL_RUN_PHASES.failed);
});

test('wasm summarize_runs matches TS summarizeToolRuns', async (t) => {
  const w = await loadWasm(t);
  if (!w) return;

  const cases = [
    [],
    [null],
    [{ phase: TOOL_RUN_PHASES.running }],
    [
      { phase: TOOL_RUN_PHASES.running },
      { phase: TOOL_RUN_PHASES.succeeded },
      { phase: TOOL_RUN_PHASES.failed },
      { phase: TOOL_RUN_PHASES.cancelled },
      { phase: TOOL_RUN_PHASES.timed_out },
      { phase: 'preparing' },
      null,
    ],
  ];
  for (const runs of cases) {
    assert.deepEqual(w.summarize_runs(runs), summarizeToolRuns(runs), `summarize mismatch for ${JSON.stringify(runs)}`);
  }
});

test('wasm truncate_tool_output matches expected head/tail/ellipsis semantics', async (t) => {
  const w = await loadWasm(t);
  if (!w) return;

  const text = Array.from({ length: 12 }, (_, i) => `line ${i + 1}`).join('\n');

  // 12 lines, head=5, tail=5 → first 5, ellipsis, last 5.
  const truncated = w.truncate_tool_output(text, 5, 5);
  assert.equal(truncated.omittedLines, 2);
  assert.equal(truncated.lines.length, 10);
  assert.equal(truncated.lines[0], 'line 1');
  assert.equal(truncated.lines[4], 'line 5');
  assert.equal(truncated.lines[5], 'line 8');
  assert.equal(truncated.lines[9], 'line 12');

  // No truncation needed.
  const short = w.truncate_tool_output('a\nb\nc', 5, 5);
  assert.equal(short.omittedLines, 0);
  assert.deepEqual(short.lines, ['a', 'b', 'c']);

  // Empty input.
  assert.deepEqual(w.truncate_tool_output('', 5, 5), { lines: [], omittedLines: 0 });
});

test('wasm truncate matches TS fallback truncateDetailLines on edge cases', async (t) => {
  const w = await loadWasm(t);
  if (!w) return;

  const cases = [
    'a\nb\nc',
    'a\r\nb\r\nc\r\n', // CRLF + trailing newline
    'a\n\nb\n', // interior empty line kept, trailing dropped
    '', // empty
    'single line',
    Array.from({ length: 12 }, (_, i) => `line ${i + 1}`).join('\n'),
    '第一行\n第二行\n第三行', // unicode lines
  ];
  for (const text of cases) {
    for (const [head, tail] of [[5, 5], [2, 4], [0, 2], [1, 1], [3, 0]]) {
      assert.deepEqual(
        w.truncate_tool_output(text, head, tail),
        truncateDetailLines(text, head, tail),
        `truncate mismatch for head=${head} tail=${tail} text=${JSON.stringify(text)}`,
      );
    }
  }
});

test('wasm group_tool_entries merges consecutive same-category tools', async (t) => {
  const w = await loadWasm(t);
  if (!w) return;

  const groups = w.group_tool_entries([
    { id: '1', tool: 'web_search', phase: 'running' },
    { id: '2', tool: 'web_search', phase: 'running' },
    { id: '3', tool: 'code_interpreter', phase: 'running' },
    { id: '4', tool: 'web_search', phase: 'running' }, // separated by code → new group
  ]);
  assert.equal(groups.length, 3);
  assert.equal(groups[0].category, 'search');
  assert.equal(groups[0].entries.length, 2);
  assert.equal(groups[1].category, 'code');
  assert.equal(groups[1].entries.length, 1);
  assert.equal(groups[2].category, 'search');
  assert.equal(groups[2].entries.length, 1);

  const empty = w.group_tool_entries([]);
  assert.deepEqual(empty, []);
});

test('wasm categorize_tool_js matches TS toolCategory fallback', async (t) => {
  const w = await loadWasm(t);
  if (!w) return;

  const names = [
    'web_search', 'arxiv_search', 'zotero_search', 'notion_search_pages',
    'github_list_repos', 'gitee_list_repos',
    'code_interpreter', 'Code',
    'web_fetch', 'WebFetch',
    'render_visualization',
    'create_plan',
    'create_spec',
    'Read', 'Glob', 'Grep',
    'Write', 'Edit', 'Bash',
    'unknown_tool', '', 'WebSearch',
  ];
  for (const name of names) {
    assert.equal(w.categorize_tool_js(name), toolCategory(name), `category mismatch for ${JSON.stringify(name)}`);
  }
});

test('wasm LiveOutputBuffer matches TS fallback across chunk sequences', async (t) => {
  const w = await loadWasm(t);
  if (!w) return;

  // Feed the same chunk sequences into both buffers and compare every
  // preview. The TS fallback here is the one toolRuntime uses when WASM is
  // unavailable, so this proves the two render identically.
  const sequences = [
    ['hello\n', 'world\n', 'tail'],
    ['hel', 'lo\nworld\n', 'tail'], // mid-line chunks
    ['a\nb\nc\nd\ne\nf\n'], // tail-ring overflow (cap 2)
    ['0123456789\n', '0123456789\n', 'ok\n'], // byte cap (10 B)
    ['a\r\nb\r\nc\r\n'], // CRLF
    ['', 'x', '\n', '\n'],
  ];
  for (const [capLines, capBytes] of [[2, 10_000], [5, 10], [50, 1024 * 1024]]) {
    for (const chunks of sequences) {
      const wasmBuf = new w.LiveOutputBuffer(capLines, capBytes);
      const tsBuf = createLiveOutputBuffer(capLines, capBytes);
      const wasmText = [];
      const tsText = [];
      for (const chunk of chunks) {
        wasmBuf.push(chunk);
        tsBuf.push(chunk);
        wasmText.push(renderLivePreview(wasmBuf.preview()));
        tsText.push(renderLivePreview(tsBuf.preview()));
      }
      assert.deepEqual(
        wasmBuf.preview(),
        tsBuf.preview(),
        `preview mismatch for cap=${capLines}/${capBytes} chunks=${JSON.stringify(chunks)}`,
      );
      assert.deepEqual(wasmText, tsText, `render mismatch for chunks=${JSON.stringify(chunks)}`);
    }
  }
});
