/**
 * Socrates API — Compiled Runtime Entry Point
 *
 * M2 of the LobeHub-alignment plan: this file now only sequences the
 * boot stages; the stages themselves live in `boot/startup.ts` and the
 * shutdown/safety nets in `boot/lifecycle.ts`.
 *
 * Import ORDER matters here. OpenTelemetry instrumentation works by patching
 * modules as they are required, so it has to be registered before `app.js`
 * pulls in Express and `pg`. That is why the application modules below are
 * dynamic imports after a top-level `await startTracing()` rather than static
 * imports at the top of the file — a static `import app from './app.js'` would
 * load Express first and leave every HTTP and database span missing.
 *
 * `startTracing()` is a no-op unless OTEL_EXPORTER_OTLP_ENDPOINT is set, so
 * this costs an already-resolved promise in the default configuration.
 */
import 'dotenv/config';
import { startTracing, stopTracing, tracingEnabled } from './lib/telemetry.js';

await startTracing();

const { default: app } = await import('./app.js');
const {
  connectDatabase,
  seedBuiltInBeagleProvider,
  startBackgroundTasks,
  validateApiKeysAtBoot,
  validateEnvironment,
} = await import('./boot/startup.js');
const { installProcessSafetyNets, installShutdown } = await import('./boot/lifecycle.js');

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

  /* Flush buffered spans before the process exits, otherwise the last few
     seconds of traces — usually the interesting ones when diagnosing a crash —
     are dropped. Registered after installShutdown so it runs alongside the
     existing handlers rather than replacing them. */
  if (tracingEnabled()) {
    for (const signal of ['SIGTERM', 'SIGINT'] as const) {
      process.once(signal, () => { void stopTracing(); });
    }
  }
}

main().catch((err) => {
  console.error('FATAL:', err);
  process.exit(1);
});
