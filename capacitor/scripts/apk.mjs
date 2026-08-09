#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const CAP_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ANDROID_DIR = path.join(CAP_DIR, 'android');
const IS_WINDOWS = process.platform === 'win32';
const TARGETS = { prod: 'https://app.topodrive.top', staging: 'https://staging.topodrive.top', local: 'http://10.0.2.2:3037' };
const buildType = process.argv[2];
const target = process.argv[3] || 'prod';
if (!['debug', 'release'].includes(buildType) || !(target in TARGETS)) {
  console.error('Usage: node scripts/apk.mjs <debug|release> [prod|staging|local]');
  process.exit(2);
}
if (buildType === 'release' && target === 'local') {
  console.error('release + local is not supported; use an HTTPS backend.');
  process.exit(2);
}

const env = { ...process.env, SOCRATES_SERVER_URL: process.env.SOCRATES_SERVER_URL || TARGETS[target] };
function run(cmd, args, cwd) {
  const result = IS_WINDOWS
    ? spawnSync([cmd, ...args].join(' '), { cwd, env, stdio: 'inherit', shell: true })
    : spawnSync(cmd, args, { cwd, env, stdio: 'inherit' });
  if (result.status !== 0) process.exit(result.status ?? 1);
}
run('npm', ['--prefix', '../frontend', 'run', 'build'], CAP_DIR);
run('npx', ['cap', 'sync', 'android'], CAP_DIR);
run(IS_WINDOWS ? 'gradlew.bat' : './gradlew', [buildType === 'debug' ? 'assembleDebug' : 'assembleRelease'], ANDROID_DIR);
