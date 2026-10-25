import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const FOUNDATION_EXPORTS = [
  'foundationSpacing',
  'foundationRadius',
  'foundationControl',
  'foundationTypography',
  'foundationMotion',
  'foundationBreakpoints',
];

test('web and shared theme expose the same Lobe-aligned foundation metrics', async () => {
  const [web, shared] = await Promise.all([
    import('../src/ui/tokens.ts'),
    import('../../packages/theme/src/tokens.ts'),
  ]);

  for (const name of FOUNDATION_EXPORTS) {
    assert.deepEqual(web[name], shared[name], `${name} drifted between Web and @socrates/theme`);
  }

  assert.deepEqual(web.foundationSpacing, {
    xxs: 4,
    xs: 8,
    sm: 12,
    base: 16,
    md: 20,
    lg: 24,
    xl: 32,
    xxl: 48,
  });
  assert.deepEqual(web.foundationRadius, { xs: 4, sm: 6, base: 8, lg: 12 });
  assert.deepEqual(web.foundationControl, {
    sm: 28,
    base: 36,
    lg: 40,
    interactive: 18,
    outline: 2,
    paddingHorizontal: 12,
    paddingHorizontalSm: 8,
  });
  assert.deepEqual(web.foundationMotion.duration, { fast: 100, mid: 200, slow: 300 });
});

test('CSS product aliases retain Socrates geometry while inheriting matching foundation rungs', async () => {
  const css = await readFile(new URL('../src/styles/tokens.css', import.meta.url), 'utf8');

  assert.match(css, /--ui-foundation-space-md:\s*20px;/);
  assert.match(css, /--ui-control-desktop:\s*var\(--ui-foundation-control-base\);/);
  assert.match(css, /--ui-control-touch:\s*44px;/);
  assert.match(css, /--ui-space-xxs:\s*2px;/);
  /* The shared Lobe foundation radius ladder (4/6/8/12) stays as it is: the
     native theme package exports the same four rungs, so the CSS copy may
     not drift. The Socrates *product* radius ladder, however, deliberately
     sits one step above it since the 2026-10-25 roundness pass, and is
     therefore declared with explicit values instead of aliasing the
     foundation. This is what these two assertions pin down. */
  assert.match(css, /--ui-foundation-radius-sm:\s*6px;/);
  assert.match(css, /--ui-radius-sm:\s*10px;/);
  assert.match(css, /--ui-radius-control:\s*var\(--ui-radius-md\);/);
});
