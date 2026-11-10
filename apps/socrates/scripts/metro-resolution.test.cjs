const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const config = require('../metro.config.js');

test('Metro resolves shared TS imports without redirecting real JS or package imports', () => {
  const context = {
    originModulePath: path.resolve(__dirname, '../../../packages/core/src/index.ts'),
    resolveRequest: (_context, moduleName, platform) => ({ moduleName, platform }),
  };
  for (const [input, expected] of [
    ['./physicsModels.js', './physicsModels'],
    ['./physicsPrograms.js', './physicsPrograms.js'],
    ['./missing.js', './missing.js'],
    ['@socrates/core', '@socrates/core'],
  ]) {
    assert.deepEqual(config.resolver.resolveRequest(context, input, 'web'), { moduleName: expected, platform: 'web' });
  }
});
