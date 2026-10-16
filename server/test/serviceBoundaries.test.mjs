import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { checkServiceBoundaries } from '../scripts/check-service-boundaries.mjs';

function fixture(files, run, options = {}) {
  const root = mkdtempSync(join(tmpdir(), 'socrates-boundaries-'));
  const server = join(root, 'server');
  const write = (file, body) => {
    const path = join(root, file);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, body);
  };
  try {
    write('server/package.json', JSON.stringify({ type: 'module' }));
    write('server/tsconfig.json', JSON.stringify({ compilerOptions: {
      target: 'ES2022', module: 'NodeNext', moduleResolution: 'NodeNext', allowJs: true, checkJs: false, ...options,
    }, include: ['src/**/*'] }));
    for (const [file, body] of Object.entries(files)) write(file, body);
    return run(checkServiceBoundaries(server));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}
const route = { 'server/src/routes/private.ts': 'export const secret = 1; export type Contract = string;' };
function rejected(source, pattern = /Forbidden HTTP/) {
  fixture({ ...route, 'server/src/services/core/example.ts': source }, (result) => {
    assert.ok(result.violations.some((v) => pattern.test(v.message)), JSON.stringify(result));
    assert.ok(result.violations.every((v) => v.line > 0));
  });
}

test('normal route-to-service direction and neutral contracts pass', () => {
  fixture({
    'server/src/routes/example.ts': "import { answer } from '../services/example.js'; export { answer };",
    'server/src/services/example.ts': "import type { Contract } from '../lib/contract.js'; export const answer: Contract = '42';",
    'server/src/lib/contract.ts': 'export type Contract = string;',
  }, (result) => assert.deepEqual(result.violations, []));
});

test('multiline imports report the real offending line', () => {
  fixture({ ...route, 'server/src/services/core/example.ts': "// comment\n\nimport {\n secret\n} from '../../routes/private.js';\n" }, (result) => {
    assert.equal(result.violations.length, 1);
    assert.equal(result.violations[0].line, 3);
  });
});

test('static and type-only imports cannot point to HTTP contracts', () => {
  rejected("import { secret } from '../../routes/private.js';");
  rejected("import type { Contract } from '../../routes/private.js';");
  rejected("type Contract = import('../../routes/private.js').Contract;");
});

test('named, star and type-only re-exports cannot hide route dependencies', () => {
  for (const code of [
    "export { secret } from '../../routes/private.js';",
    "export * from '../../routes/private.js';",
    "export type { Contract } from '../../routes/private.js';",
  ]) rejected(code);
});

test('literal dynamic imports include template literals and ignore comments', () => {
  rejected("async function load() { return import(/* route */ '../../routes/private.js'); }");
  rejected('async function load() { return import(`../../routes/private.js`); }');
});

test('CommonJS require, require.resolve and import-equals are checked', () => {
  rejected("const route = require('../../routes/private.js');");
  rejected("const route = require.resolve('../../routes/private.js');");
  rejected("import route = require('../../routes/private.js');");
});

test('createRequire aliases cannot hide literal or computed loads', () => {
  rejected("import { createRequire as makeRequire } from 'node:module'; const load = makeRequire(import.meta.url); load('../../routes/private.js');");
  rejected("import { createRequire } from 'node:module'; const load = createRequire(import.meta.url); function get(name: string) { return load(name); }", /Computed import/);
});

test('computed module loading fails closed within protected modules', () => {
  rejected('async function load(name: string) { return import(`../../routes/${name}.js`); }', /Computed import/);
  rejected('function load(name: string) { return require(name); }', /Computed import/);
});

test('comments, strings and regex examples do not create graph edges', () => {
  fixture({ 'server/src/services/example.ts': [
    "// import secret from '../routes/private.js'",
    "/* export * from '../middleware/auth.js'; */",
    'export const prose = "require(\'../routes/private.js\')";',
    "export const example = /import\\('routes'\\)/;",
    'export const template = `import("../routes/private.js")`;',
  ].join('\n') }, (result) => assert.deepEqual(result.violations, []));
});

test('HTTP composition roots are forbidden, similarly named neutral files pass', () => {
  for (const target of ['middleware/auth', 'boot/startup', 'app', 'index.runtime', 'index']) {
    fixture({
      [`server/src/${target}.ts`]: 'export const secret = 1;',
      'server/src/services/example.ts': `import { secret } from '../${target}.js';`,
    }, (result) => assert.equal(result.violations.length, 1, target));
  }
  fixture({
    'server/src/services/example.ts': "import { value } from '../lib/routesHelper.js';",
    'server/src/lib/routesHelper.ts': 'export const value = 1;',
  }, (result) => assert.deepEqual(result.violations, []));
});

test('neutral intermediary and forwarding shims cannot hide a reverse edge', () => {
  fixture({ ...route,
    'server/src/services/core/example.ts': "export * from '../bridge.js';",
    'server/src/services/bridge.ts': "export * from '../shared/bridge.js';",
    'server/src/shared/bridge.ts': "export * from '../routes/private.js';",
  }, (result) => {
    assert.equal(result.violations.length, 1);
    assert.match(result.violations[0].file, /shared[/\\]bridge\.ts$/);
    assert.ok(result.violations[0].chain.some((p) => /services[/\\]/.test(p)));
    assert.ok(result.violations[0].chain.some((p) => /shared[/\\]bridge\.ts$/.test(p)));
    assert.ok(result.violations[0].chain.length >= 3);
  });
});

test('tsconfig path aliases resolve to the real module', () => {
  fixture({ ...route,
    'server/src/services/example.ts': "import { secret } from '@http/private';",
  }, (result) => {
    assert.equal(result.violations.length, 1);
    assert.match(result.violations[0].message, /Forbidden HTTP/);
  }, { paths: { '@http/*': ['./src/routes/*.ts'] } });
});

test('internal cycles terminate without false reverse dependencies', () => {
  fixture({
    'server/src/services/a.ts': "import { b } from './b.js'; export const a = 1;",
    'server/src/services/b.ts': "import { a } from './a.js'; export const b = 2;",
  }, (result) => assert.deepEqual(result.violations, []));
});

test('runtime HTTP/UI frameworks are forbidden but external type imports pass', () => {
  rejected("import express from 'express';", /HTTP\/UI runtime/);
  rejected("export { createElement } from 'react';", /HTTP\/UI runtime/);
  fixture({ 'server/src/services/example.ts': [
    "import type { Request } from 'express';",
    "import { type Response } from 'express';",
    "export type { NextFunction } from 'express';",
    "export { type RequestHandler } from 'express';",
  ].join('\n') }, (result) => assert.deepEqual(result.violations, []));
});

test('UI source modules are forbidden even outside the server tree', () => {
  fixture({
    'frontend/widget.ts': 'export const widget = 1;',
    'server/src/services/example.ts': "import { widget } from '../../../frontend/widget.js';",
  }, (result) => {
    assert.equal(result.violations.length, 1);
    assert.match(result.violations[0].message, /Forbidden HTTP/);
  });
});

test('db and lib modules obey the same boundary as services', () => {
  for (const layer of ['db', 'lib']) fixture({ ...route,
    [`server/src/${layer}/example.ts`]: "export { secret } from '../routes/private.js';",
  }, (result) => assert.equal(result.violations.length, 1));
});

test('broken syntax or unresolved local imports cannot produce a clean check', () => {
  rejected("import { missing } from '../missing.js';", /Unresolved local/);
  rejected('export const = ;', /Syntax error/);
});

test('unreadable projects fail rather than silently reporting no violations', () => {
  assert.throws(() => checkServiceBoundaries('/nonexistent/socrates-test-boundaries'));
});
