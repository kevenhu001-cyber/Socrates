#!/usr/bin/env node
/**
 * scripts/run-affected-tests.mjs
 *
 * Fast intelligent test runner that maps git diff / changed files to
 * their affected test suites across frontend, server, shared packages,
 * site, and optionally Playwright E2E.
 *
 * Usage:
 *   npm run test:fast                  # Fast affected test run for current changes
 *   node scripts/run-affected-tests.mjs --dry-run   # List affected tests without running
 *   node scripts/run-affected-tests.mjs --staged    # Only analyze staged changes
 *   node scripts/run-affected-tests.mjs --branch main # Compare against another branch
 *   node scripts/run-affected-tests.mjs --e2e       # Include affected Playwright specs
 *   node scripts/run-affected-tests.mjs path/to/file.ts # Test for explicit files
 */

import { execSync, spawnSync } from 'node:child_process';
import { existsSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const rootDir = resolve(dirname(__filename), '..');
const frontendDir = join(rootDir, 'frontend');
const serverDir = join(rootDir, 'server');
const packagesDir = join(rootDir, 'packages');
const siteDir = join(rootDir, 'site');

// Parse CLI flags
const args = process.argv.slice(2);
const isDryRun = args.includes('--dry-run') || args.includes('--list');
const isStagedOnly = args.includes('--staged');
const isVerbose = args.includes('--verbose') || args.includes('-v');
const includeE2E = args.includes('--e2e');
const isAll = args.includes('--all');
const branchIndex = args.indexOf('--branch');
const branchRef = branchIndex !== -1 && args[branchIndex + 1] ? args[branchIndex + 1] : null;

// Filter out flag args to find any explicit file paths passed
const explicitFiles = args.filter(
  (arg, index) =>
    !arg.startsWith('-') &&
    (branchIndex === -1 || (index !== branchIndex && index !== branchIndex + 1)),
);

/**
 * Normalizes file paths to POSIX forward slashes relative to rootDir.
 */
function normalizePath(filePath) {
  const abs = resolve(rootDir, filePath);
  return relative(rootDir, abs).replace(/\\/g, '/');
}

/**
 * Collect changed files using git.
 */
function getChangedFiles() {
  if (explicitFiles.length > 0) {
    return explicitFiles.map(normalizePath).filter((f) => existsSync(join(rootDir, f)));
  }

  if (isAll) {
    return ['ALL'];
  }

  const files = new Set();

  try {
    if (branchRef) {
      const diffOut = execSync(`git diff --name-only ${branchRef}...HEAD`, {
        cwd: rootDir,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
      });
      diffOut
        .split(/\r?\n/)
        .map((l) => l.trim())
        .filter(Boolean)
        .forEach((f) => files.add(normalizePath(f)));
    } else if (isStagedOnly) {
      const cachedOut = execSync('git diff --name-only --cached', {
        cwd: rootDir,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
      });
      cachedOut
        .split(/\r?\n/)
        .map((l) => l.trim())
        .filter(Boolean)
        .forEach((f) => files.add(normalizePath(f)));
    } else {
      // 1. Unstaged and staged git diff against HEAD
      try {
        const headOut = execSync('git diff --name-only HEAD', {
          cwd: rootDir,
          encoding: 'utf8',
          stdio: ['ignore', 'pipe', 'ignore'],
        });
        headOut
          .split(/\r?\n/)
          .map((l) => l.trim())
          .filter(Boolean)
          .forEach((f) => files.add(normalizePath(f)));
      } catch {
        // Fall back if repo has no HEAD
      }

      // 2. Untracked and uncommitted files
      const statusOut = execSync('git status --porcelain', {
        cwd: rootDir,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
      });
      statusOut.split(/\r?\n/).forEach((line) => {
        if (!line.trim()) return;
        const status = line.slice(0, 2);
        if (status.includes('D')) return; // Ignore deleted files
        let file = line.slice(3).trim();
        if (file.startsWith('"') && file.endsWith('"')) {
          file = file.slice(1, -1);
        }
        // Handle rename arrow "old -> new"
        if (file.includes(' -> ')) {
          file = file.split(' -> ')[1];
        }
        files.add(normalizePath(file));
      });
    }
  } catch (err) {
    console.error('⚠️  Failed to query git status:', err.message);
  }

  // Filter out files that don't exist anymore
  return Array.from(files).filter((file) => existsSync(join(rootDir, file)));
}

/**
 * Scan directory safely for files matching predicate.
 */
function safeReaddir(dir) {
  try {
    if (!existsSync(dir)) return [];
    return readdirSync(dir);
  } catch {
    return [];
  }
}

// Available test suites cache
const availableFrontendTests = safeReaddir(join(frontendDir, 'test')).filter((f) =>
  f.endsWith('.test.mjs'),
);
const availableServerTests = safeReaddir(join(serverDir, 'test')).filter(
  (f) => (f.endsWith('.test.js') || f.endsWith('.test.mjs')) && !f.startsWith('.'),
);
const availableE2ESpecs = safeReaddir(join(frontendDir, 'e2e')).filter((f) =>
  f.endsWith('.spec.mjs'),
);

// Domain mapping rules for Frontend
const frontendDomainMappings = [
  {
    match: /frontend\/src\/chat\/(turn\/)?/,
    tests: [
      'streaming.test.mjs',
      'chatHistory.test.mjs',
      'turnRuntime.test.mjs',
      'streamFrameProcessor.test.mjs',
      'sendPipelinePreparation.test.mjs',
      'streamCadenceProperties.test.mjs',
      'streamFinishParity.test.mjs',
      'turnClient.test.mjs',
      'stopResendControls.test.mjs',
    ],
    specs: ['chat-send.spec.mjs', 'chat-stop-resend.spec.mjs', 'streaming-render.spec.mjs'],
  },
  {
    match: /frontend\/src\/store\//,
    tests: [
      'domainStore.test.mjs',
      'immutableBridge.test.mjs',
      'stateFoundation.test.mjs',
      'sessionStore.test.mjs',
    ],
    specs: ['storage-bootstrap.spec.mjs', 'chat-workbench.spec.mjs'],
  },
  {
    match: /frontend\/src\/composer\//,
    tests: [
      'composerInput.test.mjs',
      'composerMarkdown.test.mjs',
      'composerPlugins.test.mjs',
      'composerToolsState.test.mjs',
    ],
    specs: ['composer-layout.spec.mjs', 'composer-parity.spec.mjs', 'repro-input-overlap.spec.mjs'],
  },
  {
    match: /frontend\/src\/render\//,
    tests: [
      'proseRenderer.test.mjs',
      'mathMarkdownBoundary.test.mjs',
      'latexTolerance.test.mjs',
      'inlineMath.test.mjs',
      'postRender.test.mjs',
      'emphasisRepair.test.mjs',
    ],
    specs: ['streaming-render.spec.mjs', 'chinese-typography.spec.mjs'],
  },
  {
    match: /frontend\/src\/session\//,
    tests: [
      'sessionStore.test.mjs',
      'sessionListState.test.mjs',
      'historyPaging.test.mjs',
      'historyRestore.test.mjs',
    ],
    specs: ['session-start.spec.mjs', 'session-tags.spec.mjs'],
  },
  {
    match: /frontend\/src\/attachments\//,
    tests: [
      'attachments.test.mjs',
      'attachmentsState.test.mjs',
      'attachmentUploadQueue.test.mjs',
      'attachmentImageCompression.test.mjs',
    ],
    specs: ['attachments-compat.spec.mjs'],
  },
  {
    match: /frontend\/src\/styles\//,
    tests: ['styleArchitecture.test.mjs', 'themePalette.test.mjs', 'foundationTokens.test.mjs'],
    specs: [
      'landing-light-visual.spec.mjs',
      'chat-light-palette.spec.mjs',
      'theme-system.spec.mjs',
    ],
  },
  {
    match: /frontend\/src\/sidebar\//,
    tests: ['sidebarUserState.test.mjs', 'navigationDestinations.test.mjs'],
    specs: ['sidebar-resize.spec.mjs', 'sidebar-compat.spec.mjs', 'sidebar-nav.spec.mjs'],
  },
  {
    match: /frontend\/src\/auth\//,
    tests: [
      'authShell.test.mjs',
      'authUiState.test.mjs',
      'authBootRequests.test.mjs',
      'authPostAuthFlow.test.mjs',
    ],
    specs: ['auth-direct-handlers.spec.mjs'],
  },
  {
    match: /frontend\/src\/exam\//,
    tests: [
      'examParsing.test.mjs',
      'examResults.test.mjs',
      'examSaveResetState.test.mjs',
      'examScreen.test.mjs',
    ],
    specs: ['exam-regressions.spec.mjs'],
  },
  {
    match: /frontend\/src\/extensions\//,
    tests: [
      'extensions.test.mjs',
      'openUi.test.mjs',
      'openUiMedia.test.mjs',
      'openUiTools.test.mjs',
    ],
    specs: ['workflow-layer.spec.mjs', 'agent-steps.spec.mjs'],
  },
  {
    match: /frontend\/src\/tutor\//,
    tests: ['tutorFlow.test.mjs', 'tutorPolicy.test.mjs', 'socraticStages.test.mjs'],
    specs: ['tutor-session.spec.mjs'],
  },
  {
    match: /frontend\/src\/react\/message-list\//,
    tests: [
      'messageListDeferredRows.test.mjs',
      'messageItemMemo.test.mjs',
      'messageSurface.test.mjs',
    ],
    specs: ['message-list-compat.spec.mjs', 'turn-viewport-stability.spec.mjs'],
  },
  {
    match: /frontend\/src\/react\/session-list\//,
    tests: ['sessionRowModel.test.mjs', 'sessionListState.test.mjs'],
    specs: ['recents-archive.spec.mjs', 'sidebar-nav.spec.mjs'],
  },
  {
    match: /frontend\/src\/react\/ui\//,
    tests: ['buttonPrimitive.test.mjs', 'shadcnControls.test.mjs'],
    specs: ['button-press.spec.mjs'],
  },
  {
    match: /frontend\/src\/react\/lib\/boot\//,
    tests: ['ownedRoot.test.mjs', 'mountRegistry.test.mjs', 'progressiveMount.test.mjs'],
    specs: ['boot.spec.mjs', 'mount-recovery.spec.mjs'],
  },
];

// Domain mapping rules for Server
const serverDomainMappings = [
  {
    match: /server\/src\/services\/fileParsers\//,
    tests: ['fileParsersFormats.test.js', 'attachmentReader.test.js'],
  },
  {
    match: /server\/src\/services\/(pyodide|codeInterpreter)/,
    tests: ['pyodideWorker.test.mjs', 'codeInterpreter.test.js'],
  },
  {
    match: /server\/src\/services\/embeddings\//,
    tests: ['embedding.test.js', 'embeddingConfig.test.js', 'contentExtractorLifecycle.test.js'],
  },
  {
    match: /server\/src\/services\/rag/,
    tests: ['rag.test.js', 'hybridRetrieval.test.mjs'],
  },
  {
    match: /server\/src\/routes\/chat\//,
    tests: [
      'llmStreamLifecycle.test.js',
      'chatTiming.test.mjs',
      'chatTurns.test.js',
      'chatTurnHeartbeat.test.mjs',
      'chatSseErrorContract.test.mjs',
    ],
  },
  {
    match: /server\/src\/routes\/sessions\//,
    tests: [
      'sessionMessageRoutes.test.js',
      'sessionOwnership.test.js',
      'sessionPromptSnapshot.test.mjs',
    ],
  },
  {
    match: /server\/src\/(routes|middleware)\/auth/,
    tests: ['authHttpRoutes.test.js', 'middleware-auth.test.js', 'authCache.test.js'],
  },
  {
    match: /server\/src\/routes\/files/,
    tests: ['fileManagementRoutes.test.js', 'fileParsersFormats.test.js'],
  },
  {
    match: /server\/src\/db\//,
    tests: ['deploySchema.test.mjs', 'scheduledTaskIntegrityMigration.test.mjs'],
  },
  {
    match: /server\/src\/lib\/modelCapabilities/,
    tests: ['modelCapabilities.test.mjs'],
  },
  {
    match: /server\/src\/services\/tools\//,
    tests: ['toolCapabilityCatalog.test.js', 'toolCallSafety.test.js', 'toolTurnPolicy.test.js'],
  },
];

/**
 * Match a source file to tests across all suites.
 */
function resolveAffected(changedFiles) {
  const frontendTests = new Set();
  const serverTests = new Set();
  const sharedTests = new Set();
  const siteTests = new Set();
  const e2eSpecs = new Set();
  const matchedReasons = [];

  function logReason(src, testFile, reason) {
    if (isVerbose) {
      matchedReasons.push(`  • ${src} ➔ ${testFile} (${reason})`);
    }
  }

  for (const file of changedFiles) {
    // 1. Direct test file edits
    if (file.startsWith('frontend/test/') && file.endsWith('.test.mjs')) {
      const name = file.replace('frontend/test/', '');
      frontendTests.add(name);
      logReason(file, name, 'direct test edit');
      continue;
    }
    if (
      file.startsWith('server/test/') &&
      (file.endsWith('.test.js') || file.endsWith('.test.mjs'))
    ) {
      const name = file.replace('server/test/', '');
      serverTests.add(name);
      logReason(file, name, 'direct test edit');
      continue;
    }
    if (file.startsWith('packages/') && file.endsWith('.test.ts')) {
      sharedTests.add(file);
      logReason(file, file, 'direct shared test edit');
      continue;
    }
    if (file.startsWith('test/') && file.endsWith('.test.mjs')) {
      siteTests.add(file);
      logReason(file, file, 'direct root/site test edit');
      continue;
    }
    if (file.startsWith('frontend/e2e/') && file.endsWith('.spec.mjs')) {
      const name = file.replace('frontend/e2e/', '');
      e2eSpecs.add(name);
      logReason(file, name, 'direct e2e edit');
      continue;
    }

    // 2. Frontend source files
    if (file.startsWith('frontend/src/')) {
      const base = file.replace(/^frontend\/src\//, '').replace(/\.(ts|tsx|js|jsx)$/, '');
      const baseName = base.split('/').pop();

      // Check exact name match: baseName.test.mjs
      const candidateExact = `${baseName}.test.mjs`;
      if (availableFrontendTests.includes(candidateExact)) {
        frontendTests.add(candidateExact);
        logReason(file, candidateExact, 'exact name match');
      }

      // Check domain mapping rules
      for (const rule of frontendDomainMappings) {
        if (rule.match.test(file)) {
          rule.tests.forEach((t) => {
            if (availableFrontendTests.includes(t)) {
              frontendTests.add(t);
              logReason(file, t, 'domain mapping rule');
            }
          });
          if (includeE2E && rule.specs) {
            rule.specs.forEach((s) => {
              if (availableE2ESpecs.includes(s)) {
                e2eSpecs.add(s);
                logReason(file, s, 'e2e domain mapping');
              }
            });
          }
        }
      }

      // Fallback: substring match if nothing matched yet
      if (frontendTests.size === 0 && baseName.length >= 4) {
        for (const testFile of availableFrontendTests) {
          if (testFile.toLowerCase().includes(baseName.toLowerCase())) {
            frontendTests.add(testFile);
            logReason(file, testFile, 'fuzzy name match');
          }
        }
      }
    }

    // 3. Server source files
    if (file.startsWith('server/src/')) {
      const base = file.replace(/^server\/src\//, '').replace(/\.(ts|js)$/, '');
      const baseName = base.split('/').pop();

      // Check exact name match in server/test
      for (const ext of ['.test.js', '.test.mjs']) {
        const candidateExact = `${baseName}${ext}`;
        if (availableServerTests.includes(candidateExact)) {
          serverTests.add(candidateExact);
          logReason(file, candidateExact, 'exact server test match');
        }
      }

      // Check domain mappings
      for (const rule of serverDomainMappings) {
        if (rule.match.test(file)) {
          rule.tests.forEach((t) => {
            if (availableServerTests.includes(t)) {
              serverTests.add(t);
              logReason(file, t, 'server domain mapping');
            }
          });
        }
      }

      // Fallback substring match
      if (serverTests.size === 0 && baseName.length >= 4) {
        for (const testFile of availableServerTests) {
          if (testFile.toLowerCase().includes(baseName.toLowerCase())) {
            serverTests.add(testFile);
            logReason(file, testFile, 'fuzzy server test match');
          }
        }
      }
    }

    // 4. Shared packages
    if (file.startsWith('packages/')) {
      const parts = file.split('/');
      const pkgName = parts[1]; // contracts, core, theme, ui

      if (pkgName === 'ui') {
        const base = parts[parts.length - 1].replace(/\.(ts|tsx)$/, '');
        const directTest = `packages/ui/src/${base}.test.ts`;
        if (existsSync(join(rootDir, directTest))) {
          sharedTests.add(directTest);
          logReason(file, directTest, 'exact shared ui test');
        } else {
          // Add all packages/ui tests
          const uiFiles = safeReaddir(join(packagesDir, 'ui/src')).filter((f) =>
            f.endsWith('.test.ts'),
          );
          uiFiles.forEach((f) => {
            sharedTests.add(`packages/ui/src/${f}`);
            logReason(file, `packages/ui/src/${f}`, 'packages/ui test suite');
          });
        }
      } else if (pkgName === 'core') {
        const coreFiles = safeReaddir(join(packagesDir, 'core/src')).filter((f) =>
          f.endsWith('.test.ts'),
        );
        coreFiles.forEach((f) => {
          sharedTests.add(`packages/core/src/${f}`);
          logReason(file, `packages/core/src/${f}`, 'packages/core test suite');
        });
      } else if (pkgName === 'contracts') {
        if (availableServerTests.includes('messageContract.test.js')) {
          serverTests.add('messageContract.test.js');
          logReason(file, 'messageContract.test.js', 'contracts boundary check');
        }
      } else if (pkgName === 'theme') {
        ['foundationTokens.test.mjs', 'themePalette.test.mjs'].forEach((t) => {
          if (availableFrontendTests.includes(t)) {
            frontendTests.add(t);
            logReason(file, t, 'theme change mapped to frontend token test');
          }
        });
      }
    }

    // 5. Site files
    if (file.startsWith('site/')) {
      const siteTestFiles = safeReaddir(join(rootDir, 'test')).filter(
        (f) => f.startsWith('site-') && f.endsWith('.test.mjs'),
      );
      siteTestFiles.forEach((f) => {
        siteTests.add(`test/${f}`);
        logReason(file, `test/${f}`, 'site test suite');
      });
    }
  }

  return {
    frontend: Array.from(frontendTests),
    server: Array.from(serverTests),
    shared: Array.from(sharedTests),
    site: Array.from(siteTests),
    e2e: Array.from(e2eSpecs),
    reasons: matchedReasons,
  };
}

// Main execution flow
function main() {
  const startTime = Date.now();
  console.log('🔍 Analyzing repository changes for affected tests...\n');

  const changedFiles = getChangedFiles();

  if (changedFiles.length === 0) {
    console.log('✨ Working tree clean. No changed files detected.');
    process.exit(0);
  }

  console.log(`📁 Detected ${changedFiles.length} changed file(s):`);
  changedFiles.slice(0, 15).forEach((f) => console.log(`   - ${f}`));
  if (changedFiles.length > 15) {
    console.log(`   ... and ${changedFiles.length - 15} more.`);
  }
  console.log('');

  const affected = resolveAffected(changedFiles);
  const totalCount =
    affected.frontend.length +
    affected.server.length +
    affected.shared.length +
    affected.site.length +
    (includeE2E ? affected.e2e.length : 0);

  if (isVerbose && affected.reasons.length > 0) {
    console.log('🔗 Mapping Reasons:');
    affected.reasons.forEach((r) => console.log(r));
    console.log('');
  }

  if (totalCount === 0) {
    console.log('ℹ️  Changed files do not affect test suites (e.g. docs, configs, or metadata).');
    console.log('✨ Skipping test execution.');
    process.exit(0);
  }

  console.log('🎯 Targeted Affected Test Suites:');
  if (affected.frontend.length > 0) {
    console.log(`   • Frontend (${affected.frontend.length}): ${affected.frontend.join(', ')}`);
  }
  if (affected.server.length > 0) {
    console.log(`   • Server   (${affected.server.length}): ${affected.server.join(', ')}`);
  }
  if (affected.shared.length > 0) {
    console.log(`   • Shared   (${affected.shared.length}): ${affected.shared.join(', ')}`);
  }
  if (affected.site.length > 0) {
    console.log(`   • Site     (${affected.site.length}): ${affected.site.join(', ')}`);
  }
  if (includeE2E && affected.e2e.length > 0) {
    console.log(`   • E2E Specs(${affected.e2e.length}): ${affected.e2e.join(', ')}`);
  }
  console.log('');

  if (isDryRun) {
    console.log('⚡ Dry-run complete (no tests executed).');
    process.exit(0);
  }

  let failed = false;

  // 1. Run Shared Package Tests
  if (affected.shared.length > 0) {
    console.log(`🚀 [1/4] Running Shared Package Tests (${affected.shared.length})...`);
    const registerHref = pathToFileURL(resolve(rootDir, 'scripts/test-register.mjs')).href;
    for (const testPath of affected.shared) {
      console.log(`   ▶ ${testPath}`);
      const res = spawnSync(
        process.execPath,
        ['--experimental-strip-types', '--import', registerHref, resolve(rootDir, testPath)],
        { stdio: 'inherit', cwd: rootDir },
      );
      if (res.status !== 0) {
        failed = true;
        break;
      }
    }
  }

  // 2. Run Frontend Unit Tests
  if (!failed && affected.frontend.length > 0) {
    console.log(`\n🚀 [2/4] Running Frontend Unit Tests (${affected.frontend.length})...`);
    const testArgs = affected.frontend.map((t) => `test/${t}`);
    const res = spawnSync(
      'npx',
      ['tsx', '--tsconfig', 'tsconfig.test.json', '--test', ...testArgs],
      { stdio: 'inherit', cwd: frontendDir, shell: true },
    );
    if (res.status !== 0) {
      failed = true;
    }
  }

  // 3. Run Server Unit Tests
  if (!failed && affected.server.length > 0) {
    console.log(`\n🚀 [3/4] Running Server Unit Tests (${affected.server.length})...`);
    const testArgs = affected.server.map((t) => `test/${t}`);
    const res = spawnSync(
      process.execPath,
      ['--import', 'tsx', '--import', './scripts/test-env.mjs', '--test', ...testArgs],
      { stdio: 'inherit', cwd: serverDir },
    );
    if (res.status !== 0) {
      failed = true;
    }
  }

  // 4. Run Site Tests
  if (!failed && affected.site.length > 0) {
    console.log(`\n🚀 [4/4] Running Site Tests (${affected.site.length})...`);
    const res = spawnSync(process.execPath, ['--test', ...affected.site], {
      stdio: 'inherit',
      cwd: rootDir,
    });
    if (res.status !== 0) {
      failed = true;
    }
  }

  // 5. Run E2E Specs (if requested)
  if (!failed && includeE2E && affected.e2e.length > 0) {
    console.log(`\n🎭 Running Affected E2E Specs (${affected.e2e.length})...`);
    const specArgs = affected.e2e.map((s) => `e2e/${s}`);
    const res = spawnSync(
      'npx',
      ['playwright', 'test', '--config=playwright.config.mjs', ...specArgs],
      { stdio: 'inherit', cwd: frontendDir, shell: true },
    );
    if (res.status !== 0) {
      failed = true;
    }
  }

  const durationSec = ((Date.now() - startTime) / 1000).toFixed(2);
  console.log('\n----------------------------------------');
  if (failed) {
    console.log(`❌ Affected tests failed in ${durationSec}s.`);
    process.exit(1);
  } else {
    console.log(`✅ All affected tests passed in ${durationSec}s!`);
    process.exit(0);
  }
}

main();
