import assert from 'node:assert/strict';
import test from 'node:test';
import {
  DARK_BOLD,
  DARK_MEDIUM,
  REQUIRED_TOKENS,
  checkTokenLadder,
  scanCss,
} from '../scripts/check-font-weight.mjs';

const TOKENS = `
:root {
  --ui-foundation-font-weight-strong: 600;
  --ui-font-weight-regular: 400;
  --ui-font-weight-medium: 500;
  --ui-font-weight-semibold: var(--ui-foundation-font-weight-strong);
  --ui-font-weight-bold: 700;
}
`;

const THEMES = `
[data-mode="dark"] {
  --ui-font-weight-medium: 500;
  --ui-font-weight-bold: 700;
}
`;

test('a weight token is the only accepted spelling of a weight', () => {
  const scan = scanCss('.a { font-weight: var(--ui-font-weight-medium); }');
  assert.equal(scan.literals.length, 0);
  assert.deepEqual(scan.references, [{ line: 1, token: '--ui-font-weight-medium' }]);
});

test('a literal weight is caught in every spelling', () => {
  for (const css of [
    '.a { font-weight: 500; }',
    '.a { font-weight:500; }',
    '.a { font-weight: 500 !important; }',
    '.a { font-weight:500!important; }',
    '.a { font-weight: 440; }',
  ]) {
    const scan = scanCss(css);
    assert.equal(scan.literals.length, 1, css);
    assert.equal(scan.literals[0].kind, 'font-weight', css);
  }
});

test('a spelled weight is caught too — it bypasses the weight token the same way', () => {
  for (const css of [
    '.a { font-weight: bold; }',
    '.a { font-weight: bolder; }',
    '.a { font-weight: lighter; }',
    '.a { font-weight: normal; }',
    '.a { font: bold 13px/1.4 "Geist"; }',
  ]) {
    assert.equal(scanCss(css).literals.length, 1, css);
  }
});

test('the shorthand weight is caught but its size and line-height are not', () => {
  assert.equal(scanCss('.a { font: 700 13px/1.4 "Geist"; }').literals.length, 1);
  assert.equal(scanCss('.a { font: 700/1.4 13px "Geist"; }').literals.length, 1);
  /* A size always carries a unit. */
  assert.equal(scanCss('.a { font: 13px/1.4 "Geist"; }').literals.length, 0);
  assert.equal(scanCss('.a { font: 140px/1.4 "Geist"; }').literals.length, 0);
  /* A unitless line-height follows a `/`. */
  assert.equal(scanCss('.a { font: 700 20px/140 "Geist"; }').literals.length, 1);
  assert.equal(scanCss('.a { font: var(--ui-font-weight-bold) 20px/140 "Geist"; }').literals.length, 0);
});

test('a font-face declares the weights it covers and is exempt', () => {
  const scan = scanCss(`
@font-face {
  font-family: "Geist";
  font-weight: 400 700;
  src: url("/x.woff2") format("woff2");
}
`);
  assert.equal(scan.literals.length, 0);
});

test('css-wide keywords stay legal — they are not a weight', () => {
  for (const value of ['inherit', 'initial', 'unset', 'revert']) {
    const scan = scanCss(`.a { font-weight: ${value}; }`);
    assert.equal(scan.literals.length, 0, value);
  }
});

test('a declaration reports its own line, even after a long comment', () => {
  /*
   * Comments are really deleted from the stripped copy, so a character
   * offset read off it points somewhere else in the raw file. The line has
   * to survive that.
   */
  const css = [
    '/* a comment that is long enough to shift every character offset',
    ' * after it, and it spans several lines so the line count differs too',
    ' */',
    '.a {',
    '  font-weight: 500;',
    '}',
  ].join('\n');
  assert.equal(scanCss(css).literals[0].line, 5);
});

test('the token ladder has to be complete and the dark canvas has to declare the official weights', () => {
  const ok = checkTokenLadder(TOKENS, THEMES);
  assert.deepEqual(ok.failures, []);
  for (const name of REQUIRED_TOKENS) {
    assert.ok(ok.defined.has(`--ui-font-weight-${name}`), name);
  }
});

test('a missing dark override or a wrong one is reported', () => {
  /* A dark block without a medium weight reports the missing token. */
  assert.equal(checkTokenLadder(TOKENS, '[data-mode="dark"] { --ui-font-weight-bold: 700; }').failures.length, 1);
  /* A dark block with the wrong medium weight reports the wrong value. */
  assert.equal(
    checkTokenLadder(TOKENS, '[data-mode="dark"] { --ui-font-weight-medium: 450; --ui-font-weight-bold: 700; }').failures.length,
    1,
  );
  assert.equal(checkTokenLadder(TOKENS, ':root { --ui-font-weight-regular: 400; }').failures.length, 1);
});

test('the dark canvas uses the official component weights', () => {
  assert.equal(DARK_MEDIUM, 500);
  assert.equal(DARK_BOLD, 700);
});
