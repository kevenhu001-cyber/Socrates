/**
 * telemetry — opt-in OpenTelemetry tracing.
 *
 * Why
 * ---
 * A chat turn crosses browser → nginx → Express → LLM provider → tool
 * executors → Postgres, and until now none of it was traced. "The answer was
 * slow" could mean the provider's first token was slow, or webSearch burned
 * its 12s budget, or the Pyodide worker cold-started, and there was no way to
 * tell them apart after the fact. `/api/health` plus a single-file logger
 * answers "is it up", not "why was that turn slow".
 *
 * Design constraints
 * ------------------
 * 1. DEFAULT NO-OP. With `OTEL_EXPORTER_OTLP_ENDPOINT` unset nothing is
 *    imported, no exporter is created and no background timer runs. The
 *    `@opentelemetry/api` package ships a no-op tracer, so the span helpers
 *    below stay valid without any SDK — the application code does not need to
 *    branch on whether tracing is on.
 * 2. NEVER A NEW FAILURE MODE. Initialisation is wrapped: a bad endpoint, a
 *    missing peer dependency or a version mismatch logs a warning and leaves
 *    the server running untraced. Observability that can take production down
 *    is a worse trade than no observability.
 * 3. The SDK is imported dynamically. That keeps ~49 MB of exporter and
 *    instrumentation code off the startup path of a deployment that does not
 *    use it.
 *
 * Enabling
 * --------
 *   OTEL_EXPORTER_OTLP_ENDPOINT=http://collector:4318   # required, turns it on
 *   OTEL_SERVICE_NAME=socrates-api                      # optional
 *   OTEL_TRACES_SAMPLER_ARG=0.1                         # optional, default 1.0
 *
 * The endpoint is the OTLP/HTTP base URL; the trace path is appended by the
 * exporter. HTTP (not gRPC) is deliberate: one fewer transport dependency, and
 * it traverses ordinary proxies.
 */
import { SpanStatusCode, trace, type Span } from '@opentelemetry/api';

const TRACER_NAME = 'socrates-api';

let started = false;
let shutdownHook: (() => Promise<void>) | null = null;

export function tracingEnabled(): boolean {
  return Boolean(process.env.OTEL_EXPORTER_OTLP_ENDPOINT);
}

/**
 * Initialise tracing if an endpoint is configured. Idempotent, and safe to
 * call before anything else in the process — instrumentation has to be
 * registered before the modules it patches are required, which is why
 * index.runtime.ts awaits this first.
 */
export async function startTracing(): Promise<void> {
  if (started || !tracingEnabled()) return;
  started = true;

  try {
    const [
      { NodeSDK },
      { OTLPTraceExporter },
      { HttpInstrumentation },
      { ExpressInstrumentation },
      { PgInstrumentation },
      { resourceFromAttributes },
    ] = await Promise.all([
      import('@opentelemetry/sdk-node'),
      import('@opentelemetry/exporter-trace-otlp-http'),
      import('@opentelemetry/instrumentation-http'),
      import('@opentelemetry/instrumentation-express'),
      import('@opentelemetry/instrumentation-pg'),
      import('@opentelemetry/resources'),
    ]);

    const sdk = new NodeSDK({
      resource: resourceFromAttributes({
        'service.name': process.env.OTEL_SERVICE_NAME || TRACER_NAME,
        'service.version': process.env.npm_package_version || '0.0.0',
        'deployment.environment': process.env.NODE_ENV || 'development',
      }),
      traceExporter: new OTLPTraceExporter({
        url: `${process.env.OTEL_EXPORTER_OTLP_ENDPOINT!.replace(/\/$/, '')}/v1/traces`,
      }),
      instrumentations: [
        /* Ignore the endpoints that would otherwise dominate the trace volume
           without telling us anything: the health probe fires every few
           seconds and the status feed is polled by the public status page. */
        new HttpInstrumentation({
          ignoreIncomingRequestHook: (req) => {
            const url = req.url || '';
            return url.startsWith('/api/health') || url.startsWith('/api/status');
          },
        }),
        new ExpressInstrumentation(),
        /* Query text is recorded but parameter VALUES are not — bound
           parameters carry user content and encrypted API keys. */
        new PgInstrumentation({ enhancedDatabaseReporting: false }),
      ],
    });

    sdk.start();
    shutdownHook = () => sdk.shutdown();
    console.log('[otel] tracing enabled');
  } catch (_) {
    started = false;
    console.warn('[otel] tracing failed to start, continuing untraced');
  }
}

/** Flush pending spans on shutdown. No-op when tracing never started. */
export async function stopTracing(): Promise<void> {
  if (!shutdownHook) return;
  try {
    await shutdownHook();
  } catch (_) {
    console.warn('[otel] shutdown error');
  } finally {
    shutdownHook = null;
    started = false;
  }
}

/**
 * Run `fn` inside a span. When tracing is disabled this is the OTel API's
 * no-op tracer: the callback still runs, the span object is inert, and there
 * is no measurable overhead — so call sites never need an `if (enabled)`.
 *
 * Exceptions are recorded and the span is marked ERROR before rethrowing, so a
 * failed turn is visible as a failed span rather than a gap.
 */
export async function withSpan<T>(
  name: string,
  attributes: Record<string, string | number | boolean>,
  fn: (span: Span) => Promise<T>,
): Promise<T> {
  const tracer = trace.getTracer(TRACER_NAME);
  return tracer.startActiveSpan(name, { attributes }, async (span) => {
    try {
      const result = await fn(span);
      span.setStatus({ code: SpanStatusCode.OK });
      return result;
    } catch (err) {
      span.recordException(err as Error);
      span.setStatus({
        code: SpanStatusCode.ERROR,
        message: err instanceof Error ? err.message : String(err),
      });
      throw err;
    } finally {
      span.end();
    }
  });
}

/** Attach an attribute to the active span, if any. Safe when untraced. */
export function annotateSpan(attributes: Record<string, string | number | boolean>): void {
  const span = trace.getActiveSpan();
  if (!span) return;
  for (const [k, v] of Object.entries(attributes)) span.setAttribute(k, v);
}
