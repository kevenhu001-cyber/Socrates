#!/usr/bin/env node
// apk.mjs — one-command APK builder for the Socrates Capacitor shell.
//
// Usage: node scripts/apk.mjs <debug|release> [prod|staging|local]
//
// Responsibilities:
//   1. set SOCRATES_SERVER_URL for capacitor.config.js (backend target)
//   2. rebuild the frontend (vite build in ../frontend)
//   3. npx cap sync android (copies dist + regenerates native config)
//   4. invoke the platform-correct gradle wrapper (gradlew.bat on
//      Windows — `./gradlew` inside an npm script breaks under cmd.exe)
//
// Backend targets:
//   prod    → https://app.topodrive.top          (default)
//   staging → https://staging.topodrive.top
//   local   → http://10.0.2.2:3037  (Android emulator loopback; on a
//             real device run `adb reverse tcp:3037 tcp:3037` and use
//             SOCRATES_SERVER_URL=http://localhost:3037 directly)

import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const CAP_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ANDROID_DIR = path.join(CAP_DIR, 'android');
const IS_WINDOWS = process.platform === 'win32';

const TARGETS = {
  prod: 'https://app.topodrive.top',
  staging: 'https://staging.topodrive.top',
  local: 'http://10.0.2.2:3037',
};

const buildType = process.argv[2];
const target = process.argv[3] || 'prod';

if (!['debug', 'release'].includes(buildType) || !(target in TARGETS)) {
  console.error('Usage: node scripts/apk.mjs <debug|release> [prod|staging|local]');
  process.exit(2);
}
if (buildType === 'release' && target === 'local') {
  // Release manifests block cleartext http; a local-http release APK
  // would install but silently fail every request.
  console.error('release + local (http) is not supported — use debug, or serve the local backend over https.');
  process.exit(2);
}

const serverUrl = process.env.SOCRATES_SERVER_URL || TARGETS[target];
const env = { ...process.env, SOCRATES_SERVER_URL: serverUrl };
console.log(`[apk] backend target: ${serverUrl}`);

function run(cmd, args, cwd) {
  console.log(`[apk] ${cmd} ${args.join(' ')}  (cwd: ${path.relative(CAP_DIR, cwd) || '.'})`);
  // Windows needs shell:true to resolve npm.cmd/npx.cmd/gradlew.bat; pass a
  // single pre-joined string there (all args are static — no user input) to
  // avoid Node's DEP0190 args+shell deprecation warning.
  const r = IS_WINDOWS
    ? spawnSync([cmd, ...args].join(' '), { cwd, env, stdio: 'inherit', shell: true })
    : spawnSync(cmd, args, { cwd, env, stdio: 'inherit' });
  if (r.status !== 0) {
    console.error(`[apk] step failed with exit code ${r.status}`);
    process.exit(r.status ?? 1);
  }
}

// 1+2. frontend build, then capacitor sync (config + assets + plugins)
run('npm', ['--prefix', '../frontend', 'run', 'build'], CAP_DIR);
run('npx', ['cap', 'sync', 'android'], CAP_DIR);

// 3. gradle
const gradlew = IS_WINDOWS ? 'gradlew.bat' : './gradlew';
const task = buildType === 'debug' ? 'assembleDebug' : 'assembleRelease';
run(gradlew, [task], ANDROID_DIR);

const apk = path.join(
  ANDROID_DIR, 'app', 'build', 'outputs', 'apk', buildType,
  buildType === 'debug' ? 'app-debug.apk' : 'app-release.apk',
);
console.log(`[apk] done → ${apk}`);
