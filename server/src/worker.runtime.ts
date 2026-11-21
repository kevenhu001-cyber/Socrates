/**
 * Socrates Background Worker — Runtime Entry Point
 *
 * Dedicated process for background task execution (Scheduler daemon,
 * Research worker, Agent run recovery, Status monitoring, etc.), completely
 * isolated from HTTP/SSE serving to ensure low-latency request handling.
 */
import 'dotenv/config';
import {
  connectDatabase,
  seedBuiltInBeagleProvider,
  validateApiKeysAtBoot,
  validateEnvironment,
  startWorkerDaemons,
} from './boot/startup.js';
import { installProcessSafetyNets } from './boot/lifecycle.js';

async function main() {
  console.log('[worker] Booting Socrates dedicated background worker...');
  validateEnvironment();
  connectDatabase();
  await seedBuiltInBeagleProvider();
  await validateApiKeysAtBoot();

  startWorkerDaemons();
  installProcessSafetyNets();

  console.log('[worker] Socrates background worker ready and running.');
}

main().catch((err) => {
  console.error('[worker] FATAL:', err);
  process.exit(1);
});
