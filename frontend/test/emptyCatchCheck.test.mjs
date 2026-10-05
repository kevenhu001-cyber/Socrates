import assert from 'node:assert/strict';
import test from 'node:test';
import { collectEmptyCatchSites } from '../scripts/check-empty-catch.mjs';

test('empty catch parser counts real JS, TS and JSX catches exactly once', () => {
  const source = `
    const url = 'https://example.test';
    const template = \`catch (_) {}\`;
    const regex = /catch \\{\\}/;
    // catch (_) {}
    try {} catch ({ message }) { /* no statements */ }
    try {} catch {
    }
    try {} catch (e) { console.warn(e); }
  `;
  assert.equal(collectEmptyCatchSites(source).offenders.length, 2);
  assert.equal(collectEmptyCatchSites('const x: number = 1; try {} catch {}', 'a.ts').offenders.length, 1);
  assert.equal(collectEmptyCatchSites('const x = <div>catch {"{}"}</div>; try {} catch {}', 'a.tsx').offenders.length, 1);
});

test('reasoned exemptions work inside, before and after the catch', () => {
  for (const source of [
    'try {} catch (_) {} /* empty-catch: intentional — optional cleanup */',
    'try {} catch { // empty-catch: intentional — optional cleanup\n }',
    'try {} /* empty-catch: intentional — optional cleanup */ catch {}',
    'try {} catch {\n /* empty-catch: intentional — optional cleanup */\n }',
  ]) {
    const sites = collectEmptyCatchSites(source);
    assert.equal(sites.exempted.length, 1, source);
    assert.equal(sites.offenders.length, 0, source);
  }
});

test('missing reasons and unrelated markers never exempt a catch', () => {
  for (const source of [
    'try {} catch {} /* empty-catch: intentional — */',
    'try {} catch {}\n // empty-catch: intentional — belongs elsewhere',
    'const marker = "empty-catch: intentional — string"; try {} catch {}',
    'try {} catch {} const marker = 1; /* empty-catch: intentional — unrelated */',
  ]) assert.equal(collectEmptyCatchSites(source).offenders.length, 1, source);
  assert.equal(collectEmptyCatchSites(
    'try {} catch {} /* empty-catch: intentional — first */ try {} catch {}',
  ).offenders.length, 1);
});

test('syntax errors fail closed rather than producing a passing count', () => {
  assert.throws(() => collectEmptyCatchSites('try {'), /Cannot parse/);
});
