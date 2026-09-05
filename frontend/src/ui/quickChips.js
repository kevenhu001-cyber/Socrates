// src/ui/quickChips.js — Kimi-style quick capability chips on the landing.
//
// Renders a centered row of pills under the topic composer (#topicQuickActions,
// injected in index.html). Each chip deep-links into an existing surface via
// the sidebar/nav.js openers, so the chips stay a pure view-layer affordance:
// no new routing, no duplicated business logic.
//
// nav.js is imported lazily inside the click handler: its module graph carries
// boot-order side effects, so it must only evaluate after the legacy shell has
// finished booting — never during this module's import.
//
// The row self-initializes on DOMContentLoaded (same pattern as homeIdeas.js)
// and re-renders on `socrates:langchange` so labels follow the app language.

/* Inline 15px stroke icons — one glyph per chip, drawn on the 24px grid so
   they inherit `currentColor` from the chip's muted text color. */
const ICONS = {
  exam: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="5" y="3.5" width="14" height="17" rx="2.5"/><path d="M9 8h6M9 12h6M9 16h3.5"/></svg>',
  scheduled: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/></svg>',
  projects: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3.5 7.5A2.5 2.5 0 0 1 6 5h3.2a2 2 0 0 1 1.6.8l1 1.4a2 2 0 0 0 1.6.8H18a2.5 2.5 0 0 1 2.5 2.5v6A2.5 2.5 0 0 1 18 19H6a2.5 2.5 0 0 1-2.5-2.5z"/></svg>',
  plugins: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="4" y="4" width="7" height="7" rx="2"/><rect x="13" y="4" width="7" height="7" rx="2"/><rect x="4" y="13" width="7" height="7" rx="2"/><path d="M16.5 13.5v6M13.5 16.5h6"/></svg>',
  library: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 4.5h11.5A1.5 1.5 0 0 1 18 6v13.5H6.5A1.5 1.5 0 0 1 5 18z"/><path d="M5 17.5A1.5 1.5 0 0 1 6.5 16H18M9 8.5h5"/></svg>',
};

/* Chip order mirrors the Kimi reference row: creation surface first, then
   organization surfaces, then the plugin center. `open` names the exported
   opener on sidebar/nav.js, resolved lazily on first click. */
const CHIPS = [
  { id: 'exam', key: 'home.quickExam', fallback: 'Generate exam', open: 'openExam' },
  { id: 'scheduled', key: 'home.quickScheduled', fallback: 'Scheduled tasks', open: 'openScheduled' },
  { id: 'projects', key: 'home.quickProjects', fallback: 'Projects', open: 'openProjects' },
  { id: 'plugins', key: 'home.quickPlugins', fallback: 'Plugins', open: 'openPlugins' },
  { id: 'library', key: 'home.quickLibrary', fallback: 'Library', open: 'openLibrary' },
];

/* window.t is installed by src/i18n.js; fall back to the English default so
   a missing key can never render the raw key into the UI. */
function chipLabel(key, fallback) {
  try {
    if (typeof window !== 'undefined' && typeof window.t === 'function') {
      var v = window.t(key);
      if (v && v !== key) return v;
    }
  } catch (_) { /* i18n not ready yet — use the fallback */ }
  return fallback;
}

export function renderTopicQuickActions() {
  const host = document.getElementById('topicQuickActions');
  if (!host) return;

  host.textContent = '';
  for (const chip of CHIPS) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'topic-quick-chip';
    btn.innerHTML = ICONS[chip.id] || '';
    btn.appendChild(document.createTextNode(chipLabel(chip.key, chip.fallback)));
    btn.addEventListener('click', () => {
      import('../sidebar/nav.js')
        .then((nav) => { if (typeof nav[chip.open] === 'function') nav[chip.open](); })
        .catch(() => { /* navigation stays unavailable if the chunk fails; no crash */ });
    });
    host.appendChild(btn);
  }
}

function initQuickChips() {
  renderTopicQuickActions();
  try {
    document.addEventListener('socrates:langchange', renderTopicQuickActions);
  } catch (_) { /* non-DOM environment */ }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initQuickChips, { once: true });
} else {
  /* Deferred module scripts evaluate after parsing but *before*
     DOMContentLoaded, in graph order — an immediate render here can run
     while sibling modules (i18n.js) are still unevaluated, leaving the
     chips on their English fallbacks. One macrotask defers past the rest
     of the module graph, so window.t is installed before the first render. */
  setTimeout(initQuickChips, 0);
}
