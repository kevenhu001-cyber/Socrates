/* Browser entrypoints for server-owned, durable Deep Research. */
import { submitResearch } from './researchJobsClient.ts';
import { showToast } from '../ui/toast.js';
import { clearComposer, getComposerMarkdown, getVisibleComposerSurface } from '../composer/controller.ts';
import { setDeepResearchEnabled } from '../config/deepResearchMode.ts';
import { runtimeWindow as browserWindow } from "../types/runtimeWindow.ts";


async function startDeepResearch(query: string) {
  try { return await submitResearch(String(query || '').trim()); }
  catch (error) { showToast(browserWindow.t((error as Error).message === 'research_invalid_query' ? 'research.queryLimit' : 'research.sessionRequired')); }
}

function launchDeepResearch() {
  /* Prefer the visible rich-composer surface. */
  const surface = getVisibleComposerSurface();
  const query = getComposerMarkdown(surface).trim();
  if (!query) {
    showToast(browserWindow.t("research.enterTopic"));
    return;
  }
  /* P_deep-research-view — from the landing screen, hand off to
     startSession so the full chat-mode startup runs (session id, view
     swap to #chatView, user bubble, Recents save). Posting agent
     messages while topicSetup is still visible put everything into the
     hidden #msgList and looked like a dead button. startSession reads
     the selected research mode and dispatches back to startDeepResearch
     after committing the user bubble, so no duplicate work happens. */
  if (surface === "topic" && typeof browserWindow.startSession === "function") {
    setDeepResearchEnabled(true);
    browserWindow.startSession();
    return;
  }
  clearComposer(surface);
  /* Add the user's query as a message. */
  if (typeof browserWindow.addMessage === "function") {
    browserWindow.addMessage("user", query);
  }
  /* Start the research. */
  startDeepResearch(query);
}

export { startDeepResearch, launchDeepResearch };
