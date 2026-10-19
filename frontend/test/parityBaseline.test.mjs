import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { writeValidatedBaseline } from '../scripts/parity-baseline.mjs';

const valid = () => ({
  scenarios: { 'home-1440-dark-zh': { composer: { w: 768, h: 52 } } },
  defects: {}, unresolved: [], partial: false, tolerancePx: 1,
});

for (const [name, override, reason] of [
  ['unresolved role', { unresolved: [{ role: 'composerEditor' }] }, /composerEditor/],
  ['layout defect', { defects: { home: [{ kind: 'clipped' }] } }, /1 layout defect/],
  ['partial matrix', { partial: true }, /full scenario/],
  ['empty matrix', { scenarios: {} }, /no measured scenarios/],
]) {
  test(`baseline update refuses ${name} and preserves the reviewed file`, () => {
    const dir = mkdtempSync(join(tmpdir(), 'socrates-parity-'));
    try {
      const path = join(dir, 'baseline.json');
      writeFileSync(path, 'reviewed baseline\n');
      assert.throws(() => writeValidatedBaseline(path, { ...valid(), ...override }), reason);
      assert.equal(readFileSync(path, 'utf8'), 'reviewed baseline\n');
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
}

test('complete defect-free audit writes the measured baseline without widening tolerance', () => {
  const dir = mkdtempSync(join(tmpdir(), 'socrates-parity-'));
  try {
    const path = join(dir, 'baseline.json');
    writeValidatedBaseline(path, valid());
    const baseline = JSON.parse(readFileSync(path, 'utf8'));
    assert.deepEqual(baseline.scenarios, valid().scenarios);
    assert.equal(baseline.tolerancePx, 1);
    assert.equal(baseline.generatedBy, 'parity-audit.mjs --update');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
