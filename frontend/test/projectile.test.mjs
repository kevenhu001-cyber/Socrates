import { test } from 'node:test';
import assert from 'node:assert/strict';
import { projectile } from '../src/react/intelligence-ui/openui/projectile.ts';

test('ideal projectile obeys flight time, range and apex equations', () => {
  const p = projectile(20, 45, 10, 0);
  assert.equal(p.x, 0); assert.equal(p.y, 0);
  assert.ok(Math.abs(p.range - 40) < 1e-10);
  assert.ok(Math.abs(projectile(20, 45, 10, p.duration / 2).y - 10) < 1e-10);
  const landed = projectile(20, 45, 10, 100);
  assert.ok(Math.abs(landed.y) < 1e-10);
  assert.equal(landed.x, p.range);
  assert.equal(projectile(20, 45, 10, -1).x, 0);
  assert.ok(projectile(20, 45, 5, 0).range > p.range);
});
