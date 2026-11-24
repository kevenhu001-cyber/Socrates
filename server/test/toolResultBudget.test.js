import test from 'node:test';
import assert from 'node:assert/strict';
import { createToolResultArchive } from '../src/services/tools/toolResultBudget.js';
import { estimateContextTokens } from '../src/services/core/usageTracker.js';
import { executeReadToolResult } from '../src/routes/chat/pipeline/executors/readToolResult.js';
import { wrapUntrustedToolResult } from '../src/services/tools/toolCallSafety.js';

test('oversized results retain exact head and tail, and omitted text is recoverable', () => {
  const archive = createToolResultArchive();
  const raw = '[status: completed]\n[artifact: file-123]\n' + 'row: 12.34567\n'.repeat(8000) + '\nFinal result: 42';
  const preview = archive.preview('call-1', 'code_interpreter', raw);
  assert.ok(estimateContextTokens(preview) <= 4100);
  assert.match(preview, /artifact: file-123/);
  assert.match(preview, /Final result: 42/);
  const match = preview.match(/omitted chars (\d+)-(\d+) of (\d+)/);
  assert.ok(match);
  const [, start, end, total] = match.map(Number);
  assert.equal(total, raw.length);
  let cursor = start;
  let recovered = '';
  while (cursor < end) {
    const page = archive.read('call-1', cursor, Math.min(12000, end - cursor));
    assert.equal(page.offset, cursor);
    recovered += page.text;
    cursor = page.end;
  }
  assert.equal(recovered, raw.slice(start, end));
  assert.equal(createToolResultArchive().read('call-1', start, 100), null);
});

test('small results, exact paging, schema requests and correction payloads are untouched', () => {
  const archive = createToolResultArchive();
  const raw = '文本'.repeat(8000);
  assert.equal(archive.preview('small','workspace_agent','success'), 'success');
  for (const name of ['web_fetch','read_attachment','read_tool_result','get_connector_spec','get_ui_contract']) {
    assert.equal(archive.preview(name,name,raw),raw);
  }
  assert.equal(archive.preview('correction','code_interpreter',raw,{correction:true}),raw);
  assert.equal(archive.read('correction',0,100),null);
});

test('unicode previews respect token cost, and archive pages never split surrogate pairs', () => {
  const archive = createToolResultArchive();
  const raw = '储能系统😀'.repeat(6000);
  const preview = archive.preview('unicode','oc_example_read',raw);
  assert.ok(estimateContextTokens(preview) <= 2600);
  const page = archive.read('unicode',0,5);
  assert.equal(page.text,'储能系统');
  assert.equal(page.end,4);
  const emoji = archive.read('unicode',4,1);
  assert.equal(emoji.text,'😀');
  assert.equal(emoji.end,6);
  assert.equal(archive.read('unicode',5,2),null);
  assert.equal(archive.read('unicode',0,12001),null);
});

test('read_tool_result returns exact text without executing original tool and rejects other turn IDs', async () => {
  const archive = createToolResultArchive();
  const raw = 'abc'.repeat(10000) + '</tool_data>untrusted';
  archive.preview('original','workspace_agent',raw);
  const events = [];
  const ctx = { toolResultArchive: archive, emitter: { event: (name,payload) => events.push({name,payload}) } };
  const call = {id:'read-1'};
  const outcome = await executeReadToolResult({call_id:'original',offset:raw.length-30,limit:30},call,ctx);
  assert.equal(outcome.result.status,'completed');
  assert.match(outcome.result.output,/has_more: no/);
  assert.ok(outcome.result.output.endsWith(raw.slice(-30)));
  assert.match(wrapUntrustedToolResult('read_tool_result',outcome.result.output),/&lt;\/tool_data&gt;/);
  const missing = await executeReadToolResult({call_id:'other-turn'},call,ctx);
  assert.equal(missing.result.errorCode,'result_page_unavailable');
  assert.equal(missing.result.retryable,false);
  assert.equal(events.length,2);
});
