/* ─────────────────────────────────────────────────────────────
   sidebar/branding.js
   Reusable branded SVG strings for the sidebar. Three icons are
   hand-drawn in a single-line outline style tuned for the
   Sepia / Newsreader / Socratic palette:

     - KN_LAMP_SVG          Knowledge: a small oil lamp whose flame
                            doubles as a question mark — the user
                            is asked, the lamp lights, knowledge
                            unfolds. 18x18 default viewBox renders
                            crisply at 14 / 16 / 20 / 24 px.

     - BOOKMARK_SVG         Mistakes: a folded ribbon bookmark with
                            a stitched seam at the top — the
                            classical "dog-ear" mark for places
                            you want to revisit. 16x16 viewBox.

     - SEAL_SVG             Search / "find in conversations": a
                            compass-rose seal stylised to suggest
                            looking through a stack. 16x16.

   All paths use stroke=currentColor so color cascades with the
   parent's text color. Each template embeds a <title> for
   screen readers. Rendering size is controlled by the
   `width`/`height` attributes set on the consumer — these
   strings have no fixed sizing.
   ───────────────────────────────────────────────────────────── */

export const KN_LAMP_SVG = `
<svg viewBox="0 0 18 18" width="16" height="16" aria-hidden="false" role="img">
  <title>Knowledge</title>
  <g fill="none" stroke="currentColor" stroke-width="1.4"
     stroke-linecap="round" stroke-linejoin="round">
    <!-- lamp base / cup -->
    <path d="M5.2 11.2 H12.8 L11.7 13.9 H6.3 Z"/>
    <!-- lamp neck -->
    <path d="M7.4 9.4 H10.6 V11.2 H7.4 Z"/>
    <!-- flame — a teardrop with a slight curl, reads as both
         a flame and a question-mark glyph -->
    <path d="M9 1.6 C7.2 3.4 7.0 5.6 7.6 7.4 C7.9 8.4 8.4 9.0 9 9.4
             C9.6 9.0 10.1 8.4 10.4 7.4 C11.0 5.6 10.8 3.4 9 1.6 Z"/>
    <!-- inner curl of the flame glyph -->
    <path d="M8.5 6.0 C8.7 6.7 8.7 7.2 8.2 7.6"/>
    <!-- subtle ground line (sepia flourish) -->
    <path d="M4 16.0 H14" stroke-dasharray="1 2.4" stroke-width="1" opacity="0.55"/>
  </g>
</svg>`.trim();

export const BOOKMARK_SVG = `
<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="false" role="img">
  <title>Mistakes</title>
  <g fill="none" stroke="currentColor" stroke-width="1.4"
     stroke-linecap="round" stroke-linejoin="round">
    <!-- outer page outline with notched bottom -->
    <path d="M3.5 1.6 H12.5 V14.4 L8 11.6 L3.5 14.4 Z"/>
    <!-- horizontal stitching — hints at a bound notebook -->
    <path d="M5.6 4.4 H10.4" stroke-width="1"/>
    <path d="M5.6 6.4 H9.0" stroke-width="1" opacity="0.6"/>
  </g>
</svg>`.trim();

export const SEAL_SVG = `
<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="false" role="img">
  <title>Search</title>
  <g fill="none" stroke="currentColor" stroke-width="1.4"
     stroke-linecap="round" stroke-linejoin="round">
    <!-- outer circle — the seal -->
    <circle cx="7" cy="7" r="4.6"/>
    <!-- 4 cardinal tick marks (compass) -->
    <path d="M7 1.6 V3.2"/>
    <path d="M7 10.8 V12.4"/>
    <path d="M1.6 7 H3.2"/>
    <path d="M10.8 7 H12.4"/>
    <!-- magnifier tail crossing the seal -->
    <path d="M10.4 10.4 L13.4 13.4"/>
    <!-- inner dot — focal point -->
    <circle cx="7" cy="7" r="1.0" fill="currentColor" stroke="none"/>
  </g>
</svg>`.trim();

/* ──────────── Empty-state illustrations ──────────── */
/* Inline SVG fragments used by the sidebar empty state. The
   parent .sidebar-empty container sets `width: 36px;` etc. via
   CSS, so the SVG renders at the configured size. */

export const EMPTY_OVEN_SVG = `
<svg viewBox="0 0 48 48" aria-hidden="true" focusable="false">
  <g fill="none" stroke="currentColor" stroke-width="1.2"
     stroke-linecap="round" stroke-linejoin="round" opacity="0.6">
    <!-- Lamp at left (sepia / Socrates theme) -->
    <path d="M11 30 H21 L20 35 H12 Z"/>
    <path d="M14 26 H18 V30 H14 Z"/>
    <path d="M16 14 C13 18 13 22 14 24 C15 25 16 25.5 16 26
             C16 25.5 17 25 18 24 C19 22 19 18 16 14 Z"/>
    <!-- Open book at right — knowledge to be filled in -->
    <path d="M28 34 C31 33 33 33 36 34 V42 C33 41 31 41 28 42 Z"/>
    <path d="M36 34 C39 33 41 33 44 34 V42 C41 41 39 41 36 42 Z"/>
    <path d="M32 38 V40 M40 38 V40"/>
  </g>
</svg>`.trim();

/* ──────────── Runtime mount ────────────
   mountBrandingIcons(): swap the generic Lucide-line SVGs in the
   sidebar header (search circle, knowledge constellation, mistakes
   bookmark) with the branded ones above. Runs once at boot; safe
   to call again later (idempotent — checks for a [data-branded]
   attribute before re-writing innerHTML). */

function replaceSvg(el, svgStr) {
  if (!el || !svgStr) return;
  try {
    if (el.getAttribute("data-branded") === "1") return;
    el.outerHTML = svgStr;
  } catch (_) {}
}

export function mountBrandingIcons() {
  try {
    /* Search icon — lives directly inside `.sidebar-search` (the
       wrapper around the search input). Replace its first <svg>
       child in place so the input keeps its parent. */
    const searchWrap = document.querySelector(".sidebar-search");
    if (searchWrap) {
      const old = searchWrap.querySelector("svg");
      if (old && old.getAttribute("data-branded") !== "1") {
        old.outerHTML = SEAL_SVG;
        const fresh = searchWrap.querySelector("svg");
        if (fresh) fresh.setAttribute("data-branded", "1");
      }
    }
  } catch (_) {}

  try {
    const kn = document.getElementById("tabKnowledge");
    if (kn) {
      const old = kn.querySelector("svg");
      if (old && old.getAttribute("data-branded") !== "1") {
        old.outerHTML = KN_LAMP_SVG;
        const fresh = kn.querySelector("svg");
        if (fresh) fresh.setAttribute("data-branded", "1");
      }
    }
  } catch (_) {}

  try {
    const ms = document.getElementById("tabMistakes");
    if (ms) {
      const old = ms.querySelector("svg");
      if (old && old.getAttribute("data-branded") !== "1") {
        old.outerHTML = BOOKMARK_SVG;
        const fresh = ms.querySelector("svg");
        if (fresh) fresh.setAttribute("data-branded", "1");
      }
    }
  } catch (_) {}
}

/* mountSidebarEmptyState(): when a panel renders zero results AND
   the filter logic isn't producing a contextual message, we show
   this generic Socratic empty state instead of the bare "No
   sessions yet" text. Idempotent on [data-branded-empty]. */
export function mountSidebarEmptyState(container, title, desc) {
  if (!container) return;
  try {
    if (container.getAttribute && container.getAttribute("data-branded-empty") === "1") {
      return;
    }
    container.innerHTML =
      '<div class="sidebar-empty">' +
        EMPTY_OVEN_SVG +
        '<div class="sidebar-empty-title">' + (title || "Nothing here yet") + '</div>' +
        '<div class="sidebar-empty-desc">' + (desc || "Begin a topic to start your journey.") + '</div>' +
      '</div>';
    container.setAttribute("data-branded-empty", "1");
  } catch (_) {}
}
