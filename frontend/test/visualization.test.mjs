import test from 'node:test';
import assert from 'node:assert/strict';
import {
  categoryAxisLayout,
  formatCategoryLabel,
  parseFunctionExpression,
  sampleFunction,
} from '../src/render/visualization.js';

test('safe expression parser handles elementary functions and rejects code', () => {
  assert.equal(parseFunctionExpression('ln(x)')(Math.E), 1);
  assert.equal(parseFunctionExpression('sin(x)^2 + cos(x)^2')(0.83), 1);
  assert.throws(() => parseFunctionExpression('window.alert(1)'), /Unsupported|Expected/);
});

test('ln(x) preserves its positive domain and has a finite real curve', () => {
  const sample = sampleFunction('ln(x)');
  assert.equal(sample.domain[0], 0);
  const pointAtOne = sample.points.reduce((best, point) => Math.abs(point[0] - 1) < Math.abs(best[0] - 1) ? point : best, sample.points[0]);
  assert.ok(Number.isFinite(pointAtOne[1]));
  assert.ok(sample.points.some((point) => Number.isFinite(point[1])));
});

test('discontinuous functions are sampled as separated paths', () => {
  const reciprocal = sampleFunction('1/x', [-2, 2], 401);
  assert.ok(reciprocal.points.some((point) => point[1] === null));
  assert.ok(Number.isFinite(parseFunctionExpression('sqrt(x)')(4)));
  assert.ok(Number.isFinite(parseFunctionExpression('tan(x)')(0.2)));
});

test('long chart categories wrap or rotate without unbounded labels', () => {
  const wrapped = formatCategoryLabel('这是一个非常长的栏目名称需要避免重叠', {
    lineChars: 6,
    maxChars: 12,
  });
  assert.equal(wrapped.split('\n').length, 2);
  assert.match(wrapped, /…$/);

  const dense = categoryAxisLayout(Array.from({ length: 12 }, (_, index) => `Category ${index + 1} with long text`));
  assert.equal(dense.rotate, 35);
  assert.ok(dense.bottom >= 80);
});
