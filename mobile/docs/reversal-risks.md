# Reversal Risk Register

For the reverse-align plan (see [inherited-munching-book.md](../../../../../../Users/Jiacheng/.claude/plans/inherited-munching-book.md)). Every PR landing against this direction must update the relevant row.

## How to use this file

1. Add a new entry under **Active risks** when a Phase PR trips on something not yet listed.
2. Move the row to **Closed risks** once the disposition is signed off.
3. Each entry has: `discovered-on`, `phase`, `severity` (🔴 blocker / 🟡 major / 🟢 minor), `owner`, `disposition`.

---

## Active risks

### R1 — Going against the active migration roadmap

- **discovered-on**: 2026-09-02
- **phase**: 0 (planning)
- **severity**: 🔴
- **owner**: team lead
- **summary**: This plan reverses the direction documented in
  [`docs/rn-migration.md`](../../docs/rn-migration.md),
  [`docs/unification-plan.md`](../../docs/unification-plan.md), and
  [`AGENTS.md`](../../AGENTS.md). All three documents describe a
  forward path that replaces `frontend/` with `mobile/`. The reverse
  plan contradicts all three and re-opens decisions that landed in
  commits within the last two weeks.
- **mitigation attempted**: surfaced explicitly in the plan header
  and in the AskUserQuestion call. The user opted into the reverse
  direction with the "逆向对齐：mobile 模仿 frontend 的视觉重做" +
  "UI + 功能 + 替换 WebView + Web 形态：full" answer. Approval is
  recorded. **No further mitigation possible at the planning layer;
  must be visible to whoever owns mobile/ going forward.**
- **disposition**: tracked

### R2 — Five recent commits are destined for revert

- **discovered-on**: 2026-09-02
- **phase**: 0 (planning) — affects Phase 1
- **severity**: 🟡
- **owner**: mobile reviewer rotation
- **summary**: The reverse plan explicitly undoes the work landed in:
  - `d2216ab` — separate mic on the composer
  - `529e687` — ChatGPT-style fidelity pass
  - `9cb10f0` — Plus Jakarta Sans font swap
  - `170ba5c` — pure-grayscale dark lock + voice↔send unify
  - `cc3dedc` — Playwright desktop/mobile composer specs

  Each revert must be its own commit with a `Revert:` prefix and a
  cross-link back to this risk entry so history stays easy to bisect.
  Phase 1 begins with these reverts, not with "new" work.

- **mitigation**: freeze progressive polish until Phase 1 lands so PRs
  do not race each other. After Phase 1, all mobile PRs target the
  unified token set in `@socrates/theme`.
- **disposition**: tracked

### R3 — Production APK ships the soon-to-be-reverted UI

- **discovered-on**: 2026-09-02
- **phase**: 1
- **severity**: 🟡
- **owner**: release manager
- **summary**: Mobile's `2.1.x` visual pass (ChatGPT-style fidelity,
  separate mic) is in production per
  [`docs/client-release.md`](../../docs/client-release.md). The visual
  revert in Phase 1 must be paired with a `2.2.0` re-release that ships
  the new visual identity, otherwise users see two different designs
  on the same Play Store listing across installs.
- **mitigation**: bundle the visual revert + Phase 1 in a single
  release candidate; gate promotion on Detox + APK visual smoke.
- **disposition**: tracked

### R4 — `frontend/src/main.js` will keep running through Phase 5

- **discovered-on**: 2026-09-02
- **phase**: 3 → 5
- **severity**: 🟡
- **owner**: frontend owner
- **summary**: `main.js` is 10K lines of legacy code that the Web
  side still depends on. We cannot delete `frontend/` until
  Phase 5 cuts traffic 100% to Expo Web. Through that window
  `frontend/` must keep shipping and keep test-passing.
- **mitigation**: do not stop merging [M1–M4 reports'](../../frontend/M4_PLAN.md) in-flight refactors (state.js bridges, data-action removal,
  bootstrap.tsx split). They will keep reducing the surface area
  mobile/Expo Web will eventually absorb.
- **disposition**: tracked

### R5 — Tiptap (workspace) cannot be 100% RN-native

- **discovered-on**: 2026-09-02
- **phase**: 3
- **severity**: 🟡
- **owner**: mobile reviewer
- **summary**: Tiptap sits on ProseMirror, which is DOM-bound. Phase 3
  will keep the WorkspaceScreen as a controlled WebView; the
  reverse-direction promise of "no WebView" is therefore unreachable
  for the editor itself.
- **mitigation**: scope the no-WebView goal to chat-shell rendering.
  Workspace ships controlled `ArtifactWebView` whose IPC mirror is
  documented in `mobile/docs/workspace-tiptap.md`. The artifact
  preview's WebView (`ArtifactPreviewScreen`) is the only other
  deliberate WebView point.
- **disposition**: tracked

### R6 — Two parallel roadmaps (progressive polish + reverse)

- **discovered-on**: 2026-09-02
- **phase**: 1
- **severity**: 🟡
- **owner**: team lead
- **summary**: If progressive polish on mobile continues while the
  reverse plan executes, the two streams will step on each other
  (e.g. a polish PR changes `Composer.tsx` while a reverse PR is
  also editing it). PR conflicts will absorb 1–2 days per week.
- **mitigation**: from Phase 0 onward, freeze progressive polish on
  mobile until Phase 2 land. Reopen the freeze after Phase 2 lands.
  Hotfixes (auth, crash, data loss) are exempt from the freeze.
- **disposition**: tracked

### R7 — Display Prefs + Cookie Consent overlap with auth-consent boundaries

- **discovered-on**: 2026-09-02
- **phase**: 3
- **severity**: 🟢
- **owner**: privacy review
- **summary**: `frontend/src/cookieConsent.js` exports show that
  frontend shows a GDPR-style consent sheet; mobile uses
  `notifications` toggle only. Phase 3.8 will need to either port
  the consent UI or accept that mobile users opt-in implicitly.
- **mitigation**: not a blocker. Add `cookieConsent` parity as a
  Phase 3.8 stretch goal; do not block the rest of the modal
  surface on it.
- **disposition**: tracked

### R8 — `domain/` folder does not exist; mobile's `stateStore` is intentionally separate

- **discovered-on**: 2026-09-02
- **phase**: 3
- **severity**: 🟢
- **owner**: shared-core owner
- **summary**: The plan considered borrowing `frontend/src/state/bridges.ts`
  shapes into mobile. Decided against: mobile has its own
  `mobile/src/stores/appStore.ts` (imperative class with subscribe +
  snapshot, similar surface area) that ships today. Borrowing
  bridges would be additive complexity for no functional gain.
- **mitigation**: none required; documented for awareness.
- **disposition**: closed (no action)

### R9 — Test infrastructure mismatch (Detox vs Playwright)

- **discovered-on**: 2026-09-02
- **phase**: 5
- **severity**: 🟡
- **owner**: QA
- **summary**: Existing mobile e2e is Detox (Android only). Expo
  Web smoke needs Playwright. Two runners, two CI lanes.
- **mitigation**: `playwright.rn-web.config.mjs` already exists as
  the Playwright config. Phase 5 builds a dual-runner gate in
  `.github/workflows/ci.yml`.
- **disposition**: tracked

### R10 — Theme drift detection gap

- **discovered-on**: 2026-09-02
- **phase**: 1
- **severity**: 🟢
- **owner**: CI
- **summary**: Without an automated check that
  `@socrates/theme` matches `frontend/src/styles/tokens.css` /
  `frontend/src/ui/tokens.ts`, every Phase-1-step carries a drift
  risk. CI does not currently have a token-drift gate.
- **mitigation**: Phase 1 ships a tiny `test/theme-drift.test.mjs`
  inside `@socrates/theme` that asserts the hex table derived from
  `tokens.ts` matches a 64-byte frozen snapshot of the source files.
  Run from both `mobile` and `frontend` post-install hooks. Drift
  fails CI.
- **disposition**: tracked

---

## Closed risks

_(none yet)_

---

## Audit log

- 2026-09-02 — risks R1–R10 created from the AskUserQuestion answers
  ("逆向对齐" + "full" scope).
