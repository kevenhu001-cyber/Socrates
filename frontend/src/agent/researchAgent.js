/* Browser entrypoints for server-owned, durable Deep Research. */
import { submitResearch } from './researchJobsClient.ts';
import { showToast } from '../ui/toast.js';
import { clearComposer, getComposerMarkdown, getVisibleComposerSurface } from '../composer/controller.ts';

async function startDeepResearch(query) {
  try { return await submitResearch(String(query || '').trim()); }
  catch (error) { showToast(window.t(error.message === 'research_invalid_query' ? 'research.queryLimit' : 'research.sessionRequired')); }
}

function launchDeepResearch() {
  /* Prefer the visible rich-composer surface. */
  var surface = getVisibleComposerSurface();
  var query = getComposerMarkdown(surface).trim();
  if (!query) {
    showToast(window.t("research.enterTopic"));
    return;
  }
  /* P_deep-research-view — from the landing screen, hand off to
     startSession so the full chat-mode startup runs (session id, view
     swap to #chatView, user bubble, Recents save). Posting agent
     messages while topicSetup is still visible put everything into the
     hidden #msgList and looked like a dead button. startSession reads
     window.deepResearchOn and dispatches back to startDeepResearch
     after committing the user bubble, so no duplicate work happens. */
  if (surface === "topic" && typeof window.startSession === "function") {
    try { window.deepResearchOn = true; } catch (_) {}
    window.startSession();
    return;
  }
  clearComposer(surface);
  /* Add the user's query as a message. */
  if (typeof window.addMessage === "function") {
    window.addMessage("user", query);
  }
  /* Start the research. */
  startDeepResearch(query);
}

export { startDeepResearch, launchDeepResearch };
