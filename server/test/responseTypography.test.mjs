import test from 'node:test';
import assert from 'node:assert/strict';
import {
  appendFinalOutputConstraints,
  FINAL_OUTPUT_CONSTRAINTS,
  FINAL_OUTPUT_CONSTRAINTS_MARKER,
  insertProviderIdentity,
  insertResponseTypography,
  RESPONSE_TYPOGRAPHY_MARKER,
} from '../src/lib/chatPolicy.js';

test('new conversations receive Chinese prose punctuation without changing code and exact data', () => {
  const user = { role: 'user', content: '请解释 JSON: {"rate": 1.5}，网址 https://example.test/a?q=1' };
  const messages = [{ role: 'system', content: 'Tutor role' }, user];
  const result = appendFinalOutputConstraints(messages);
  const prompt = result[0].content;
  assert.match(prompt, /Chinese prose, use full-width Chinese punctuation: ，。！？；：（）/);
  assert.match(prompt, /human-readable labels and descriptions in interactive UI cards/);
  assert.match(prompt, /Keep English passages in normal English punctuation/);
  assert.match(prompt, /Preserve code, inline code, JSON and OpenUI syntax/);
  assert.match(prompt, /URLs, email addresses, file paths, version numbers, decimal points, mathematical notation, exact quotations/);
  assert.match(prompt, /Markdown structural syntax must remain ASCII/);
  assert.match(prompt, /Follow an explicit user request for different punctuation/);
  assert.ok(prompt.endsWith(FINAL_OUTPUT_CONSTRAINTS));
  assert.equal(result[1], user);
  assert.equal(messages[0].content, 'Tutor role');
  assert.deepEqual(appendFinalOutputConstraints(result), result);
});

test('a saved prompt from before this fix receives typography while its frozen context stays intact', () => {
  const prefix = 'Frozen tutor role\nSession context initialized on: yesterday\nSaved memories\n\n';
  const snapshot = `${prefix}${FINAL_OUTPUT_CONSTRAINTS_MARKER}\n${FINAL_OUTPUT_CONSTRAINTS}`;
  const outbound = insertResponseTypography(snapshot);
  assert.ok(outbound.startsWith(prefix));
  assert.ok(outbound.endsWith(`${FINAL_OUTPUT_CONSTRAINTS_MARKER}\n${FINAL_OUTPUT_CONSTRAINTS}`));
  assert.match(outbound, /full-width Chinese punctuation/);
  assert.equal(outbound.split(RESPONSE_TYPOGRAPHY_MARKER).length, 2);
  assert.equal(insertResponseTypography(outbound), outbound);
  // No snapshot migration or overwrite is required.
  assert.equal(snapshot, `${prefix}${FINAL_OUTPUT_CONSTRAINTS_MARKER}\n${FINAL_OUTPUT_CONSTRAINTS}`);
});

test('built-in and BYOK paths share typography and keep the final constraints last', () => {
  const snapshot = `${FINAL_OUTPUT_CONSTRAINTS_MARKER}\n${FINAL_OUTPUT_CONSTRAINTS}`;
  for (const identity of [null, 'Built-in identity']) {
    const prompt = insertProviderIdentity(insertResponseTypography(snapshot), identity);
    assert.match(prompt, /full-width Chinese punctuation/);
    assert.ok(prompt.endsWith(FINAL_OUTPUT_CONSTRAINTS));
    assert.equal(prompt.includes('Built-in identity'), Boolean(identity));
  }
  assert.match(insertResponseTypography('Legacy prompt without a final marker'), /full-width Chinese punctuation/);
});
