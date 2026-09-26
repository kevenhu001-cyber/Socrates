<!--
Conventions in this repo:

- ADR 0003 (docs/adr/0003-structural-debt-categories.md) requires every PR
  title to be prefixed with its P-level when this PR addresses a structural
  debt finding (F-XXX in docs/audits/2026-09-20-structural-review.md), and
  requires P2 work to ship behind an ADR.
- Per-package `npm run typecheck`, `npm run lint`, `npm run test:unit`, and
  the appropriate Playwright spec must pass locally before review. Full
  Playwright suites are NOT run on every change (AGENTS.md "Incremental
  testing").
- CODEOWNERS (.github/CODEOWNERS) names the owner for high-blast-radius
  paths. Touching one of those without that owner as reviewer will
  silently skip a security review.
-->

## Summary

<!-- One or two sentences. What changed and why. -->

## Linked issue / debt entry

<!-- e.g. F-016 in docs/audits/2026-09-20-structural-review.md, ADR 0010,
     or a tracker ID. Without this, the reviewer cannot trace the change
     back to its justification. -->

## P-level (per ADR 0003, if this PR addresses structural debt)

<!-- Tick the row that applies; remove the others. -->

- [ ] P0 — must ship in 24 h
- [ ] P1 — must ship in 1 week
- [ ] P2 — multi-PR, requires an ADR + visual baseline (see below)

## Surfaces touched

<!-- The CODEOWNERS file lists paths that need named-reviewer signoff.
     Tick every block you touched; the matching owners are auto-requested
     only when this list is honest. -->

- [ ] Auth / sessions / CSRF (`server/src/middleware/`, `server/src/routes/auth.ts`, `server/src/routes/oauth.ts`, `server/src/services/{auth,adminAuth,loginLockout,oauthTokens,agentKeys}.ts`)
- [ ] Cryptography / secret handling (`server/src/lib/crypto.ts`, `server/src/services/apiKey.ts`, `scripts/{rotate,backup}-secrets.sh`)
- [ ] Database schema / migrations (`server/src/db/`, `server/drizzle/`)
- [ ] Deployment / edge (`deploy.sh`, `ops/`)
- [ ] CI / supply chain (`.github/`, `scripts/audit-ratchet.mjs`, `scripts/audit.baseline.json`, `scripts/gen-csp-hashes.mjs`)
- [ ] Security policy (`server/src/app.ts`, `server/src/generated/`, `ops/nginx/csp-spa.conf`)
- [ ] SSRF / sandbox / tool safety (`server/src/services/fetchBatch.ts`, `server/src/services/codeInterpreter.ts`, `server/src/services/pyodideWorker.ts`, `server/src/services/toolCallSafety.ts`)
- [ ] Brand assets (`frontend/public/favicon.png`, `site/favicon.png`) — must stay byte-identical to the sibling `logo.png`
- [ ] Frontend main backbone (`frontend/src/main.js`, `frontend/src/styles/legacy/`, `frontend/src/i18n.js`, `frontend/src/chat/streamingTurn.js`, `frontend/src/sidebar/nav.js`, `frontend/src/render/{markdown.ts,viz.js}`)
- [ ] `server/src/index.runtime.ts`, `server/src/index.js` shim — keep the `index.js` compatibility shim alive while systemd units still reference it
- [ ] None of the above (default code paths)

## Gates the author ran locally

<!-- Full suites are not expected per AGENTS.md, but the packages you
     touched MUST be green. Tick only the ones you actually ran. -->

- [ ] `cd server && npm run typecheck`
- [ ] `cd server && npm run test:unit`
- [ ] `cd server && npm run lint`
- [ ] `cd frontend && npm run typecheck`
- [ ] `cd frontend && npm run lint`
- [ ] `cd frontend && npm run test:unit`
- [ ] `cd frontend && npm run build`
- [ ] Focused Playwright spec: `npx playwright test --config=playwright.config.mjs e2e/<spec>.spec.mjs --workers=1` (spec name: _____)
- [ ] `cd mobile && npm run typecheck`
- [ ] `cd mobile && npm test`
- [ ] `cargo test -p socrates-protocol` (only if `tools-rust/` was touched)

## Hard constraints (any unchecked box blocks merge)

<!-- Mirrors the gates documented in AGENTS.md and ADR 0003. -->

- [ ] No database schema change introduced (or, if it was, a migration is included and `scripts/check-drizzle-drift.mjs` is green)
- [ ] `deploy.sh` main flow is unchanged
- [ ] `server/src/index.js` is not deleted (systemd units still reference it)
- [ ] `frontend/public/favicon.png` and `site/favicon.png` are still byte-identical to their sibling `logo.png` (only check if either favicon was edited)
- [ ] `allowScripts` in `server/package.json` and `frontend/package.json` has not been widened; if a new dependency needs a script, the entry is named and explained in the commit message
- [ ] `scripts/audit-ratchet.mjs` and `scripts/coverage-ratchet.mjs` floors are not lowered without a written reason in the commit message

## STRIDE check (only if a high-blast-radius surface above was ticked)

<!-- The CODEOWNERS-listed paths are the trust boundaries this repo
     treats as security-critical. A 30-second STRIDE scan catches what
     code review tends to skim over. -->

- [ ] **Spoofing** — auth/identity path: no new unauthenticated entry points, no weakened signature/HMAC verification
- [ ] **Tampering** — input path: validation still rejects the malformed payload, no new direct DB writes from request data
- [ ] **Repudiation** — audit path: a new state-changing action still emits the same log line, or the new log line includes the same correlation id
- [ ] **Information disclosure** — output path: response shape unchanged for the unchanged cases, no new `console.log` of secrets / API keys / session tokens, CSP / helmet headers still emitted
- [ ] **Denial of service** — resource path: no new unbounded loops or un-paginated DB queries, rate-limit / lockout still effective
- [ ] **Elevation of privilege** — authz path: role check still present and still at the right layer (route handler, not just UI)

## Visual baseline (only required for P2 / UI changes)

<!-- Per ADR 0003, P2 PRs must leave a baseline snapshot. -->

- [ ] New `frontend/e2e/__screenshots__/` snapshots checked in for the affected surface
- [ ] Baseline diff reviewed (no unrelated drift)

## Rollback plan

<!-- One sentence: which single commit (`git revert`) restores main.
     Per ADR 0003 every PR is squash-merged to a single commit. -->

`<single-commit-sha>` `git revert -m 1 <sha>`
