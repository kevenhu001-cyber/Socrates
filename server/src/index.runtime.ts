/**
 * Socrates API — Compiled Runtime Entry Point
 *
 * M2 of the LobeHub-alignment plan: this file now only sequences the
 * boot stages; the stages themselves live in `boot/startup.ts` and the
 * shutdown/safety nets in `boot/lifecycle.ts`.
 */
import 'dotenv/config';
import app from './app.js';
import {
  connectDatabase,
  seedBuiltInBeagleProvider,
  startBackgroundTasks,
  validateApiKeysAtBoot,
  validateEnvironment,
} from './boot/startup.js';
import { installProcessSafetyNets, installShutdown } from './boot/lifecycle.js';

const PORT = parseInt(process.env.PORT || '8080', 10);

async function main() {
  validateEnvironment();
  connectDatabase();
  await seedBuiltInBeagleProvider();
  await validateApiKeysAtBoot();
  startBackgroundTasks();

  // ── Start HTTP server ──
  const server = app.listen(PORT, () => {
    console.log(`[server] Listening on http://0.0.0.0:${PORT} (${process.env.NODE_ENV || 'development'})`);
  });

  installShutdown(server);
  installProcessSafetyNets();
}

main().catch((err) => {
  console.error('FATAL:', err);
  process.exit(1);
});
