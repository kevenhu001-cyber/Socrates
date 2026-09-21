/*
 * Post-auth hydration coordinator.
 *
 * Authentication owns whether the shell may be shown.  The larger, independent
 * datasets (providers, memories and recents) hydrate after that first paint.
 * Chat requests wait for providers + memories, while the composer and the
 * optimistic send surface remain immediately interactive.
 */

var generation = 0;
var snapshot = Object.freeze({
  generation: 0,
  providers: "idle",
  memories: "idle",
  sessions: "idle",
});
var chatReady = Promise.resolve(snapshot);
var hydrationReady = Promise.resolve(snapshot);

function mark(name) {
  try { if (typeof performance !== "undefined" && performance.mark) performance.mark(name); } catch (_) {}
}

function publish(patch) {
  snapshot = Object.freeze(Object.assign({}, snapshot, patch));
  try {
    var root = document.documentElement;
    root.dataset.providersState = snapshot.providers;
    root.dataset.memoriesState = snapshot.memories;
    root.dataset.sessionsState = snapshot.sessions;
  } catch (_) {}
  try {
    window.dispatchEvent(new CustomEvent("socrates:hydration-state", { detail: snapshot }));
  } catch (_) {}
  return snapshot;
}

function runLoader(name, loader, ownerGeneration) {
  return Promise.resolve()
    .then(function () { return typeof loader === "function" ? loader() : null; })
    .then(function (value) {
      if (ownerGeneration === generation) publish({ [name]: "ready" });
      return value;
    })
    .catch(function (error) {
      if (ownerGeneration === generation) publish({ [name]: "degraded" });
      return { degraded: true, error: error };
    });
}

export function startPostAuthHydration(loaders) {
  var ownerGeneration = ++generation;
  snapshot = Object.freeze({
    generation: ownerGeneration,
    providers: "loading",
    memories: "loading",
    sessions: "loading",
  });
  publish(snapshot);
  mark("socrates:hydration-started");

  var providers = runLoader("providers", loaders && loaders.providers, ownerGeneration);
  var memories = runLoader("memories", loaders && loaders.memories, ownerGeneration);
  var sessions = runLoader("sessions", loaders && loaders.sessions, ownerGeneration);

  chatReady = Promise.all([providers, memories]).then(function () {
    if (ownerGeneration === generation) mark("socrates:chat-ready");
    return snapshot;
  });
  hydrationReady = Promise.all([providers, memories, sessions]).then(function () {
    if (ownerGeneration === generation) mark("socrates:hydration-complete");
    return snapshot;
  });
  return { chatReady: chatReady, hydrationReady: hydrationReady, generation: ownerGeneration };
}

export function ensureChatReady(timeoutMs) {
  /* Timeout-bounded: a stalled providers/memories fetch must never wedge
     a send forever. When the budget expires the caller proceeds with
     whatever snapshot is current (usually degraded/loading) instead of
     hanging the optimistic turn behind a spinner. */
  if (typeof timeoutMs !== "number" || !(timeoutMs > 0)) return chatReady;
  var budget = timeoutMs;
  var current = chatReady;
  return Promise.race([
    current,
    new Promise(function (resolve) {
      setTimeout(function () {
        try { resolve(getHydrationSnapshot()); }
        catch (_) { resolve(snapshot); }
      }, budget);
    }),
  ]);
}

export function getHydrationSnapshot() {
  return snapshot;
}

export function resetPostAuthHydration() {
  generation += 1;
  snapshot = Object.freeze({
    generation: generation,
    providers: "idle",
    memories: "idle",
    sessions: "idle",
  });
  chatReady = Promise.resolve(snapshot);
  hydrationReady = Promise.resolve(snapshot);
  publish(snapshot);
}
