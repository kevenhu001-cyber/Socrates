/* Browser entrypoints for server-owned, durable Deep Research. */
import { submitResearch } from './researchJobsClient.ts';
import { showToast } from '../ui/toast.js';
import { runtimeWindow as browserWindow } from '../types/runtimeWindow.ts';


async function startDeepResearch(query: string) {
  try { return await submitResearch(String(query || '').trim()); }
  catch (error) { showToast(browserWindow.t((error as Error).message === 'research_invalid_query' ? 'research.queryLimit' : 'research.sessionRequired')); }
}

export { startDeepResearch };
