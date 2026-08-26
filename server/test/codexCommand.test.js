import test from 'node:test';
import assert from 'node:assert/strict';

import { parseCodexCommand } from '../src/services/codexHarness.ts';

/* CODEX_APP_SERVER_BIN used to name a standalone executable. Current
   codex-cli releases expose the server as `codex app-server`, so the value
   may include the subcommand. Both forms must spawn correctly, and neither
   may go through a shell. */
test('parseCodexCommand accepts a bare executable', () => {
  assert.deepEqual(parseCodexCommand('codex-app-server'), {
    command: 'codex-app-server',
    args: [],
  });
});

test('parseCodexCommand splits a command that carries a subcommand', () => {
  assert.deepEqual(
    parseCodexCommand('/home/u/.npm-global/lib/node_modules/@openai/codex/bin/codex.js app-server'),
    {
      command: '/home/u/.npm-global/lib/node_modules/@openai/codex/bin/codex.js',
      args: ['app-server'],
    },
  );
});

test('parseCodexCommand tolerates padding and repeated whitespace', () => {
  assert.deepEqual(parseCodexCommand('  codex   app-server  '), {
    command: 'codex',
    args: ['app-server'],
  });
});

test('parseCodexCommand falls back to the default binary name', () => {
  assert.deepEqual(parseCodexCommand(''), { command: 'codex-app-server', args: [] });
  assert.deepEqual(parseCodexCommand('   '), { command: 'codex-app-server', args: [] });
});
