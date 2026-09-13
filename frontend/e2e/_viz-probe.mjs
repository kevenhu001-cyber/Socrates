// e2e/_viz-probe.mjs — test probe for tool-output visualization lifecycle.
//
// Counts `.visualization-card` DOM insertions/removals with a MutationObserver
// instead of faking the renderer. Both mount paths are observed — React's
// gateway call and `restorePersistedMessageExtras`, which imports
// mountVisualization directly — and the observer also catches the host being
// replaced under a card (a removal followed by a new insertion), which is the
// exact "detached renderer" shape lifecycle specs need to detect.
//
// A MutationObserver callback runs after a whole commit, so a card appended to
// a host in the same task as the host's own insertion shows up in BOTH
// `addedNodes` lists. Counting is therefore deduped by node identity (an
// expando on the card): a new card is one creation, a moved card is none.
//
// Install after the app shell is up and BEFORE loadSession()/askChatTurn().

/** Observe every visualization card insert/remove under document.body. */
export async function installVizProbe(page) {
  await page.waitForFunction(() => !!document.body, null, { timeout: 15_000 });

  await page.evaluate(() => {
    if (window.__vizProbe) return;
    const stats = window.__vizProbe = { created: [], removed: [], disposeCalls: [], disposedCards: [] };

    /* Count host teardown without touching the real implementation: the
       gateway caches the postRender OBJECT, so wrapping the property is
       visible to every React caller. */
    const pr = window.__socratesLegacy && window.__socratesLegacy.postRender;
    if (pr && typeof pr.disposeVisualizations === 'function') {
      const realDispose = pr.disposeVisualizations;
      pr.disposeVisualizations = function (host) {
        stats.disposeCalls.push({
          at: Date.now(),
          cardIds: host
            ? Array.from(host.querySelectorAll('.visualization-card'))
              .map((card) => card.dataset.visualizationId || '')
            : [],
        });
        return realDispose.call(this, host);
      };
    }
    if (pr && typeof pr.disposeVisualization === 'function') {
      const realDisposeOne = pr.disposeVisualization;
      pr.disposeVisualization = function (card) {
        stats.disposedCards.push({
          cardId: (card && card.dataset && card.dataset.visualizationId) || '',
          at: Date.now(),
        });
        return realDisposeOne.call(this, card);
      };
    }

    const cardsIn = (node) => {
      const found = [];
      if (!node || node.nodeType !== 1) return found;
      if (node.matches && node.matches('.visualization-card')) found.push(node);
      if (node.querySelectorAll) {
        node.querySelectorAll('.visualization-card').forEach((card) => found.push(card));
      }
      return found;
    };

    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        mutation.addedNodes.forEach((node) => {
          for (const card of cardsIn(node)) {
            if (card.__vizProbeSeen) continue;
            card.__vizProbeSeen = true;
            stats.created.push({
              cardId: card.dataset.visualizationId || '',
              title: (card.textContent || '').trim().slice(0, 80),
              hostConnected: !!card.isConnected,
              at: Date.now(),
            });
          }
        });
        mutation.removedNodes.forEach((node) => {
          for (const card of cardsIn(node)) {
            stats.removed.push({
              cardId: card.dataset.visualizationId || '',
              at: Date.now(),
            });
          }
        });
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });
    window.__vizProbe.observer = observer;
  });
}

/** Read the recorded card insert/remove events (null when not installed). */
export async function readVizProbe(page) {
  return page.evaluate(() => {
    const p = window.__vizProbe;
    if (!p) return null;
    return {
      created: p.created.slice(),
      removed: p.removed.slice(),
      disposeCalls: (p.disposeCalls || []).slice(),
      disposedCards: (p.disposedCards || []).slice(),
    };
  });
}
