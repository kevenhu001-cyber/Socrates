import { claimResearchJob, renewResearchLease, saveResearchCheckpoint, type ResearchJob } from './researchJobs.js';
import { abortable, executeResearch, type ResearchPorts } from './researchPipeline.js';
import type { ResearchSource } from '../../db/schema/research.js';
import { and, eq, gte, sql } from 'drizzle-orm';
import { getDb } from '../../db/index.js';
import { users, usageEvents } from '../../db/schema/index.js';
import { getBeagleQuota } from '../../lib/tiers.js';

// Background completions must respect the same monthly built-in-provider
// budget as chat. Recheck before each paid completion, including recovery.
export async function assertResearchBudget(userId: string) {
  const db = getDb();
  const [user] = await db.select({ tier: users.tier }).from(users).where(eq(users.id, userId));
  if (!user) throw new Error('research_provider_unavailable');
  const now = new Date();
  const [usage] = await db.select({ used: sql<number>`coalesce(sum(${usageEvents.totalTokens}), 0)` }).from(usageEvents)
    .where(and(eq(usageEvents.userId, userId), gte(usageEvents.createdAt, new Date(now.getFullYear(), now.getMonth(), 1))));
  if (Number(usage.used) >= getBeagleQuota(user.tier)) throw new Error('research_quota_exceeded');
}

async function providerPorts(job: ResearchJob): Promise<Omit<ResearchPorts, 'checkpoint'>> {
  const { getActiveApiKey } = await import('./apiKey.js');
  const provider = await getActiveApiKey(job.userId);
  if (!provider?.keyPlaintext) throw new Error('research_provider_unavailable');
  const { callChatCompletion } = await import('./llm.js');
  const { recordUsage, resolveUsage, estimateMessageTokens, estimateTokens } = await import('./usageTracker.js');
  const { webSearch } = await import('../webSearch.js');
  const { fetchBatch } = await import('../util/fetchBatch.js');
  return {
    complete: async (messages, maxTokens, signal) => {
      if (provider.isBuiltIn) await assertResearchBudget(job.userId);
      const result = await callChatCompletion({ apiBase: provider.url.replace(/\/+$/, ''), apiKey: provider.keyPlaintext!, model: provider.model, messages, maxTokens, signal });
      recordUsage({ userId: job.userId, sessionId: job.sessionId, model: provider.model, source: 'research',
        ...resolveUsage(result.usage, { promptTokens: estimateMessageTokens(messages), completionTokens: estimateTokens(result.content) }) });
      return result.content || '';
    },
    search: async (query) => {
      const results = await webSearch(query, 5, { userId: job.userId });
      if (!Array.isArray(results)) throw new Error('research_search_unavailable');
      return results.map((source: { url: string; title: string; snippet: string }) => ({ url: source.url, title: source.title, content: `Search snippet (page unavailable): ${source.snippet}` }));
    },
    read: async (sources) => {
      // fetchBatch enforces DNS pinning, private-address blocking and redirect
      // checks. Never fetch model/search supplied URLs through raw fetch.
      const pages = await fetchBatch(sources.map((source) => source.url));
      return sources.map((source, i): ResearchSource => {
        const page = pages.results[i];
        return page?.ok && 'content' in page && typeof page.content === 'string' && page.content.trim()
          ? { ...source, content: page.content.slice(0, 4000) } : source;
      });
    },
  };
}

const active = new Set<AbortController>();
let timer: ReturnType<typeof setInterval> | null = null;
let polling = false;

export async function runClaimedResearch(job: ResearchJob, portsFactory = providerPorts) {
  const controller = new AbortController();
  active.add(controller);
  let renewing = false;
  const heartbeat = setInterval(() => {
    if (renewing) return;
    renewing = true;
    void renewResearchLease(job).then((owned) => {
      if (!owned) controller.abort('research_lease_lost');
    }).catch(() => controller.abort('research_lease_lost')).finally(() => { renewing = false; });
  }, 15_000);
  heartbeat.unref();
  const deadline = setTimeout(() => controller.abort('research_timeout'), 600_000);
  deadline.unref();
  try {
    const ports = await abortable(portsFactory(job), controller.signal);
    const steps = await executeResearch(job.query, job.steps, { ...ports,
      checkpoint: (steps, stage) => saveResearchCheckpoint(job, steps, stage),
    }, controller.signal);
    await saveResearchCheckpoint(job, steps, 'completed', { report: steps.report! });
  } catch (error) {
    // A stopped worker leaves its checkpoint for lease recovery. Cancellation
    // and stale owners cannot pass saveResearchCheckpoint's database fence.
    if (controller.signal.aborted && controller.signal.reason !== 'research_timeout') return;
    const code = controller.signal.reason === 'research_timeout' ? 'research_timeout'
      : error instanceof Error && /^research_[a-z_]+$/.test(error.message) ? error.message : 'research_execution_failed';
    try {
      // Reload the latest committed steps; preserve the
      // latest committed checkpoints rather than the claim-time snapshot.
      const { getResearchJob } = await import('./researchJobs.js');
      const latest = await getResearchJob(job.userId, job.id);
      await saveResearchCheckpoint(job, latest.steps, 'failed', { error: code });
    } catch { /* Cancellation, deletion or lease takeover already owns state. */ }
  } finally {
    clearInterval(heartbeat);
    clearTimeout(deadline);
    active.delete(controller);
  }
}

async function poll() {
  if (polling || active.size >= 2) return;
  polling = true;
  try {
    while (timer && active.size < 2) {
      const job = await claimResearchJob();
      if (!job || !timer) break;
      void runClaimedResearch(job).catch((error) => console.error('[research] worker failed:', error instanceof Error ? error.name : 'unknown'));
    }
  } catch (error) {
    console.warn('[research] poll failed:', error instanceof Error ? error.name : 'unknown');
  } finally { polling = false; }
}

export function startResearchWorker() {
  if (timer) return;
  timer = setInterval(() => { void poll(); }, 3000);
  timer.unref();
  void poll();
}

export function stopResearchWorker() {
  if (timer) clearInterval(timer);
  timer = null;
  for (const controller of active) controller.abort('research_worker_stopped');
}
