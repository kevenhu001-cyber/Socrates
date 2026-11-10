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

function assertDevelopedProseDefaults(prompt) {
  assert.match(prompt, /Minimize colons in natural-language prose/);
  assert.match(prompt, /Minimize dash punctuation/);
  assert.match(prompt, /detailed, rich, self-contained explanation/);
  assert.match(prompt, /make causal connections explicit/);
  assert.match(prompt, /connect an unfamiliar idea to something the user already understands/);
  assert.match(prompt, /meaningful boundary or counterexample/);
  assert.match(prompt, /Default to connected natural-language paragraphs as the main body/);
  // These are defaults, with deliberate exceptions for task-specific formats.
  assert.match(prompt, /follow explicit user preferences for length, depth, and format/);
  assert.match(prompt, /Use lists for actual step-by-step procedures/);
  assert.match(prompt, /Reducing punctuation must not damage meaning or structured output/);
  assert.match(prompt, /do not withhold the answer or turn every reply into a quiz/);
}

test('new conversations receive Chinese prose punctuation without changing code and exact data', () => {
  const user = { role: 'user', content: '请解释 JSON: {"rate": 1.5}，网址 https://example.test/a?q=1' };
  const messages = [{ role: 'system', content: 'Tutor role' }, user];
  const result = appendFinalOutputConstraints(messages);
  const prompt = result[0].content;
  assert.match(prompt, /Chinese prose, use full-width Chinese punctuation: ，。！？；：（）/);
  assert.match(prompt, /human-readable labels and descriptions in interactive UI cards/);
  assert.match(prompt, /Keep English passages in normal English punctuation/);
  /* The preservation list grew (XML and scaffold tag syntax sit between JSON
     and OpenUI syntax), so pin the guarantee — every one of these stays
     verbatim — instead of one exact sentence. */
  assert.match(prompt, /Preserve code, inline code, JSON[^.]*OpenUI syntax/);
  assert.match(prompt, /URLs, email addresses, file paths, version numbers, decimal points, mathematical notation, exact quotations/);
  assert.match(prompt, /Markdown structural syntax must remain ASCII/);
  assert.match(prompt, /Follow an explicit user request for different punctuation/);
  assert.ok(prompt.endsWith(FINAL_OUTPUT_CONSTRAINTS));
  assertDevelopedProseDefaults(prompt);
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
    assertDevelopedProseDefaults(prompt);
    assert.match(prompt, /full-width Chinese punctuation/);
    assert.ok(prompt.endsWith(FINAL_OUTPUT_CONSTRAINTS));
    assert.equal(prompt.includes('Built-in identity'), Boolean(identity));
  }
  for (const legacy of ['Legacy prompt without a final marker', RESPONSE_TYPOGRAPHY_MARKER + '\nOld typography']) {
    const upgraded = insertResponseTypography(legacy);
    assertDevelopedProseDefaults(upgraded);
    assert.ok(upgraded.endsWith(FINAL_OUTPUT_CONSTRAINTS));
    assert.equal(insertResponseTypography(upgraded), upgraded);
  }
});

test('saved formatting blocks receive current prose defaults without changing frozen context or provider identity', () => {
  const prefix = 'Frozen persona\nSaved memories\nInitialized yesterday\n\n';
  const identity = '<!-- @beagle-system-prompt -->\nKeep this provider identity';
  const snapshot = prefix + RESPONSE_TYPOGRAPHY_MARKER + '\nOld formatting policy\n\n' + identity + '\n\n' +
    FINAL_OUTPUT_CONSTRAINTS_MARKER + '\nOld final constraints';
  const outbound = insertResponseTypography(snapshot);
  assertDevelopedProseDefaults(outbound);
  assert.ok(outbound.startsWith(prefix));
  assert.ok(outbound.includes(identity));
  assert.ok(outbound.endsWith(FINAL_OUTPUT_CONSTRAINTS));
  assert.equal(outbound.split(RESPONSE_TYPOGRAPHY_MARKER).length, 2);
  assert.match(outbound, /revision 2/);
  assert.match(outbound, /他说：“先理解‘概念’，再练习。”/);
  assert.match(outbound, /点击“Settings”（设置）继续。/);
  assert.doesNotMatch(outbound, /Old formatting|Old final constraints|你好!|见到你,/);
  assert.equal(insertResponseTypography(outbound), outbound);
});
