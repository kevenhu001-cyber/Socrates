/* Browser entrypoints for server-owned, durable Deep Research. */
import { submitResearch } from './researchJobsClient.ts';
import { showToast } from '../ui/toast.js';
import { t } from '../i18n.ts';


async function startDeepResearch(query: string) {
  try { return await submitResearch(String(query || '').trim()); }
  catch (error) { showToast(t((error as Error).message === 'research_invalid_query' ? 'research.queryLimit' : 'research.sessionRequired')); }
}

export { startDeepResearch };
