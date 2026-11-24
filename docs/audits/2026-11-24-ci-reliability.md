# CI reliability triage — 2026-11-24

Baseline main: `6365f0eb2e698bd533669565ddb9af382ae03967`.

## Evidence and changes

- [Latest main CI](https://github.com/kevenhu001-cyber/Socrates/actions/runs/45347846648) and [preceding main CI](https://github.com/kevenhu001-cyber/Socrates/actions/runs/45333675537): both report 1410/1412 frontend unit tests passing. The exam action order changed to secondary-before-primary, and the light canvas changed to white paper. Align tests with the current implementation and surface-ladder baseline, retaining contrast and parity checks.
- [Agent tooling on main](https://github.com/kevenhu001-cyber/Socrates/actions/runs/45193082614): agent E2E still scopes tool rows under the thinking surface. Scope to the actual transcript tool row; assert disclosure plus existing plan, steps, duration, persistence and output behavior.
- Agent workflow filters reference retired paths; use current tool, chat, renderer, prompt and shared-package paths. Do not double-run feature branch pushes and their PRs. Main CI still owns required E2E tiers.
- Repeated Node unit-test warnings show the WASM loader trying to fetch file: URLs. Avoid implicit source-file fetches; explicit byte-backed initialization and independent WASM/TS parity remain supported.

## Historical failures requiring separate follow-up

- [Older frontend E2E](https://github.com/kevenhu001-cyber/Socrates/actions/runs/45048028274): 809 passed, 41 failed, 10 skipped; failures included retired explore/analyze hooks, visualization rendering/ready-state, and mobile controls. The latest unit-test gate stops before E2E, so do not assume the older failures are fixed. Re-run against this revision and distinguish removed behavior from current regressions.
- [Older Server CI](https://github.com/kevenhu001-cyber/Socrates/actions/runs/45031733572): missing frontend TypeScript dependency in a server-only lane; current boundary checker uses server's native TS AST. Confirm via a fresh server-only run before making further changes.
- [Older sanity/coverage](https://github.com/kevenhu001-cyber/Socrates/actions/runs/44996772026): OpenAPI extraction and coverage floor failures. Recent sanity passes; latest frontend unit failures prevent full coverage validation. Do not lower floors.
- [Scheduled secret scan](https://github.com/kevenhu001-cyber/Socrates/actions/runs/45197881751): Gitleaks reported 24 findings. Later security success does not prove historical secrets were revoked. Review redacted findings, rotate real credentials, and do not add blanket allowlists.
- [Open PR #203](https://github.com/kevenhu001-cyber/Socrates/pull/203): its latest agent lane has two prompt wording assertions failing; branch-specific prompt changes are intentionally not overwritten by this main-based PR.

## Complexity reduction priorities

1. Tool execution: `server/src/services/tools/toolCallSafety.ts`, `agentRuntime.ts`, and `server/src/routes/chat/pipeline/toolLoop.ts` are large high-risk owners. Map validation, policy/approval, execution, retries and event publication; consolidate only duplicate policies with contract tests.
2. Transcript: `frontend/src/chat/toolRuntime/index.ts`, `frontend/src/react/tool-run/toolRunLayout.ts` and legacy projections have overlapping presentation responsibilities. Retain a single canonical tool-run record; project once into live and restored transcript views. The agent E2E fix reflects the current owner, not a revived legacy wrapper.
3. Visualization: `packages/core/src/visualizationNormalize.js`, `frontend/src/render/visualization.ts`, `server/src/services/visualization.ts` and `frontend/src/react/intelligent-ui/IntelligentUiNodes.tsx` are high-size entrypoints. Inventory duplicate normalization/validation and use fixture parity across server, browser and native client before moving logic.
4. CI: one main merge gate plus specialized server, security, image, Android and agent lanes; keep only distinct checks in specialized workflows. Preserve coverage, typecheck, security, and functional E2E gates. A structural refactor needs independently passing baselines and focused regression tests, not a wholesale rewrite.

No local test execution claimed; validate the PR through Actions.
