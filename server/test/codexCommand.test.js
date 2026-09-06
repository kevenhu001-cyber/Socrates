import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import Module from 'node:module';
import os from 'node:os';
import path from 'node:path';

import { parseCodexCommand, resolveCodexLauncher } from '../src/services/codexHarness.ts';

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

test('parseCodexCommand attaches the app-server subcommand to the codex CLI', () => {
  /* A binary named `codex` is the interactive CLI — spawning it with
     `--listen stdio://` exits with an argument error. The normalized form
     must launch the embedded server subcommand instead. */
  assert.deepEqual(parseCodexCommand('codex'), {
    command: 'codex',
    args: ['app-server'],
  });
  assert.deepEqual(
    parseCodexCommand('/home/u/.npm-global/lib/node_modules/@openai/codex/bin/codex.js'),
    {
      command: '/home/u/.npm-global/lib/node_modules/@openai/codex/bin/codex.js',
      args: ['app-server'],
    },
  );
  assert.deepEqual(parseCodexCommand('codex.cmd'), {
    command: 'codex.cmd',
    args: ['app-server'],
  });
});

test('parseCodexCommand never duplicates an explicit app-server subcommand', () => {
  assert.deepEqual(parseCodexCommand('codex app-server'), {
    command: 'codex',
    args: ['app-server'],
  });
  assert.deepEqual(parseCodexCommand('/usr/bin/codex app-server'), {
    command: '/usr/bin/codex',
    args: ['app-server'],
  });
});


test('resolveCodexLauncher discovers the modern npm Codex app-server without a standalone binary', () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'socrates-codex-launcher-'));
  const binName = process.platform === 'win32' ? 'codex.cmd' : 'codex';
  const shim = path.join(root, binName);
  const entry = path.join(root, 'node_modules', '@openai', 'codex', 'bin', 'codex.js');
  const oldPath = process.env.PATH;
  const oldPathAlias = process.env.Path;
  const oldExplicit = process.env.CODEX_APP_SERVER_BIN;
  /* Hermetic module-graph isolation: findCodexJsEntry() probes
     `require.resolve('@openai/codex/...')` first, and Node folds
     NODE_PATH (e.g. a Volta shared store that ships a global codex)
     into the resolution. Scrubbing PATH alone still resolves that
     ambient copy, so drop NODE_PATH and rebuild Module.globalPaths
     for the duration of the test. Verified: clearing the env var
     alone has no effect until _initPaths() re-reads it. */
  const oldNodePath = process.env.NODE_PATH;
  const hadNodePath = Object.hasOwn(process.env, 'NODE_PATH');
  try {
    mkdirSync(path.dirname(entry), { recursive: true });
    writeFileSync(shim, process.platform === 'win32' ? '@echo off\r\n' : '#!/bin/sh\n', 'utf8');
    writeFileSync(entry, '#!/usr/bin/env node\n', 'utf8');
    assert.equal(existsSync(entry), true);
    process.env.PATH = root;
    process.env.Path = root;
    delete process.env.CODEX_APP_SERVER_BIN;
    delete process.env.NODE_PATH;
    Module._initPaths();
    if (Module._pathCache) {
      for (const key of Object.keys(Module._pathCache)) {
        if (key.includes('@openai/codex')) delete Module._pathCache[key];
      }
    }

    const launcher = resolveCodexLauncher(true);
    assert.equal(launcher.source, 'node:@openai/codex');
    assert.equal(launcher.command, process.execPath);
    assert.deepEqual(launcher.args, [entry, 'app-server']);
    assert.equal(/\.(cmd|ps1)$/i.test(launcher.command), false, 'must not spawn a Windows npm shell shim');
  } finally {
    if (oldPath == null) delete process.env.PATH; else process.env.PATH = oldPath;
    if (oldPathAlias == null) delete process.env.Path; else process.env.Path = oldPathAlias;
    if (oldExplicit == null) delete process.env.CODEX_APP_SERVER_BIN;
    else process.env.CODEX_APP_SERVER_BIN = oldExplicit;
    if (hadNodePath) process.env.NODE_PATH = oldNodePath;
    else delete process.env.NODE_PATH;
    Module._initPaths();
    resolveCodexLauncher(true);
    rmSync(root, { recursive: true, force: true });
  }
});
