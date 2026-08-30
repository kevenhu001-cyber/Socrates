import test from 'node:test';
import assert from 'node:assert/strict';
import { stripCitationMarkers } from '../src/render/helpers.js';

test('stripCitationMarkers removes inline search-citation runs', () => {
  assert.equal(stripCitationMarkers('深度学习[1]是机器学习的一个分支'), '深度学习是机器学习的一个分支');
  assert.equal(stripCitationMarkers('深度学习[1][2][3]是机器学习的一个分支'), '深度学习是机器学习的一个分支');
  assert.equal(stripCitationMarkers('The result agrees with [1, 2].'), 'The result agrees with.');
  assert.equal(stripCitationMarkers('见【1】与【2,3】的说明'), '见与的说明');
  assert.equal(stripCitationMarkers('如文献[12]所述，观点[4-6]也成立'), '如文献所述，观点也成立');
});

test('stripCitationMarkers consumes the space before a marker', () => {
  assert.equal(stripCitationMarkers('with [1].'), 'with.');
  assert.equal(stripCitationMarkers('a [1] b'), 'a b');
});

test('stripCitationMarkers leaves markdown links and reference defs intact', () => {
  assert.equal(stripCitationMarkers('see [1](https://example.com) here'), 'see [1](https://example.com) here');
  assert.equal(stripCitationMarkers('[1]: https://example.com'), '[1]: https://example.com');
});

test('stripCitationMarkers leaves code and math untouched', () => {
  assert.equal(stripCitationMarkers('`arr[1]` stays'), '`arr[1]` stays');
  assert.equal(stripCitationMarkers('```\nlet x = a[1]\n```'), '```\nlet x = a[1]\n```');
  assert.equal(stripCitationMarkers('$a[1]$ stays'), '$a[1]$ stays');
  assert.equal(stripCitationMarkers('\\(b[2]\\) stays'), '\\(b[2]\\) stays');
});

test('stripCitationMarkers is idempotent', () => {
  const once = stripCitationMarkers('答案[1][2]成立[3]。');
  assert.equal(stripCitationMarkers(once), once);
});

test('stripCitationMarkers passes plain text through unchanged', () => {
  const plain = '复变函数（complex function）是指定义域和值域都是复数的函数。';
  assert.equal(stripCitationMarkers(plain), plain);
  assert.equal(stripCitationMarkers(''), '');
  assert.equal(stripCitationMarkers(null), '');
});
