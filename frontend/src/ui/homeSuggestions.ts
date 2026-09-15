/*
 * homeSuggestions.ts
 *
 * Heuristic starter prompts that used to render above the landing-page
 * composer. Disabled — the chips read as noise on mobile and were the
 * most-skipped UI on the landing surface, so the homeSuggestionsWrap
 * container was removed from index.html. The module is kept as a no-op
 * shim so any future re-introduction (or third-party import) compiles
 * without a sweeping refactor; see `greeting.js` which no longer calls
 * mountHomeSuggestions().
 *
 * To re-enable: restore the rendering helpers from git history, mount
 * the chip list into the homeSuggestionsWrap container, and re-add the
 * `.home-suggestions-*` CSS rules.
 */

export function mountHomeSuggestions(): void {
  /* No-op. The landing suggestions container (#homeSuggestionsWrap) was
     removed from index.html; the heuristic chips are no longer served.
     See the file-level docstring above. */
}
