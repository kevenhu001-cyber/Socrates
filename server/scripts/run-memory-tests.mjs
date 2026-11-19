import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { devNull } from 'node:os';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';
import { vector } from '@electric-sql/pglite-pgvector';
import { PGLiteSocketServer } from '@electric-sql/pglite-socket';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import pg from 'pg';

const serverDir = fileURLToPath(new URL('../', import.meta.url));
const database = 'socrates_test';
const extensions = { vector };
const suites = [
  'accountLearningRoutes.test.js',
  'accountPreferencesRoutes.test.js',
  'agentKeys.test.js',
  'auditStore.test.js',
  'authHttpRoutes.test.js',
  'browser-login-handoff.test.mjs',
  'chatContextBudgetDb.test.mjs',
  'chatSseErrorContract.test.mjs',
  'chatTurns.test.js',
  'chunkIndex.test.js',
  'contentLibraryRoutes.test.js',
  'executionHistoryRoutes.test.js',
  'fileManagementRoutes.test.js',
  'filePagination.test.js',
  'loginLockout.test.js',
  'memoryContextDb.test.js',
  'middleware-auth.test.js',
  'oauthFlow.test.js',
  'projectConnectorDisconnect.test.js',
  'protocolDiscoveryRoutes.test.js',
  'researchJobsDb.test.js',
  'scheduledTaskIntegrityMigration.test.mjs',
  'scheduledTaskRoutes.test.js',
  'sessionMessageRoutes.test.js',
  'sessionPromptProxyRoutes.test.mjs',
  'sessionPromptSnapshotDb.test.mjs',
  'suggestions.test.js',
  'ttsStore.test.js',
  'workspaceOrganizationRoutes.test.js',
];

const requested = process.argv.slice(2).map((file) => file.replace(/^(?:server\/)?test\//, ''));
const selected = requested.length ? [...new Set(requested)] : suites;
for (const file of selected) {
  if (!suites.includes(file)) throw new Error(`No in-memory PostgreSQL suite named ${file}`);
}

// PGlite initializes its default database first. Create the dedicated test
// database before opening it so its actual name passes the normal test guard.
const bootstrap = await PGlite.create({ extensions });
let emptyDataDir;
try {
  await bootstrap.exec(`CREATE DATABASE ${database}`);
  emptyDataDir = await bootstrap.dumpDataDir('none');
} finally {
  await bootstrap.close();
}

const template = await PGlite.create({ database, extensions, loadDataDir: emptyDataDir });
const listen = (db) =>
  new PGLiteSocketServer({ db, host: '127.0.0.1', port: 0, maxConnections: 12 });
const connectionString = (socket) => `postgresql://postgres@${socket.getServerConn()}/${database}`;
const migrationSocket = listen(template);
let dataDir;
try {
  await migrationSocket.start();
  const pool = new pg.Pool({ connectionString: connectionString(migrationSocket), max: 1 });
  try {
    // Some historical migrations have several statements per breakpoint.
    // Use the same simple-query wire path as the production migrator.
    await migrate(drizzle(pool), {
      migrationsFolder: fileURLToPath(new URL('../drizzle', import.meta.url)),
    });
  } finally {
    await pool.end();
  }
  // Fail if the migration took its optional no-vector branch.
  await template.query("select vector_dims('[1,2,3]'::vector)");
  dataDir = await template.dumpDataDir('none');
} finally {
  try {
    await migrationSocket.stop();
  } finally {
    await template.close();
  }
}

const failures = [];
const sessionSecret = randomBytes(32).toString('hex');
for (const file of selected) {
  console.log(`\n[memory test] ${file}`);
  const db = await PGlite.create({ database, extensions, loadDataDir: dataDir });
  const socket = listen(db);
  try {
    await socket.start();
    const url = connectionString(socket);
    const child = spawn(
      process.execPath,
      ['--import', 'tsx', '--import', './scripts/test-env.mjs', '--test', `test/${file}`],
      {
        cwd: serverDir,
        stdio: 'inherit',
        timeout: 120_000,
        env: {
          ...process.env,
          DATABASE_URL: url,
          TEST_DATABASE_URL: url,
          DOTENV_CONFIG_PATH: devNull,
          NODE_ENV: 'test',
          SESSION_SECRET: sessionSecret,
        },
      },
    );
    const status = await new Promise((resolve, reject) => {
      child.once('error', reject);
      child.once('exit', (code, signal) => resolve(code ?? signal));
    });
    if (status !== 0) failures.push(file);
  } catch (error) {
    failures.push(file);
    console.error(`[memory test] ${file}:`, error);
  } finally {
    try {
      await socket.stop();
    } finally {
      await db.close();
    }
  }
}

if (failures.length) {
  console.error(`[memory test] ${failures.length} failing suite(s): ${failures.join(', ')}`);
  process.exitCode = 1;
} else {
  console.log(`[memory test] all ${selected.length} suites passed`);
}
