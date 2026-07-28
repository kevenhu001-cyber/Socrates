# Socrates agent guide

## Task entrypoints and ownership

- `frontend/` owns the Vite SPA, tutor/chat flows, exam UI, visualization cards, and Playwright coverage. Start with `frontend/src/main.js`, then follow extracted modules under `frontend/src/`. Verify with `npm run lint`, `npm run test:unit`, `npm run build`, and the relevant Playwright specs.
- `server/` owns Express APIs, Drizzle/PostgreSQL persistence, LLM/tool execution, authentication, and the Python sandbox. Start with `server/src/index.ts` and the relevant route/service. Verify with `npm run typecheck` and `npm test`.
- `android/` owns the Kotlin/Compose client. Keep API contracts aligned with `server/` and pass `-PBASE_URL` for non-default release targets. Verify with the Gradle wrapper.
- `open-connector/` is an independently-scoped connector package. Read and follow `open-connector/AGENTS.md` before changing anything below that directory.

## Boundaries and risk routes

- Do not commit generated `dist/`, test reports, secrets, or deployment state.
- Treat `frontend/src/main.js`, `server/src/index.ts`, auth, migrations, and `deploy.sh` as high-churn or high-impact surfaces. Prefer extracted modules and add focused regression coverage.
- `deploy.sh` must remain single-writer, preserve `dist.previous`, and restore the previous backend after a failed restart or health gate. If changing its swap/rollback flow, test the lock, candidate cleanup, and error trap paths.
- `.github/workflows/ci.yml` is the frontend/server merge gate. Keep type checks, build, unit tests, and frontend Playwright smoke tests intact; preserve concurrency cancellation and failure artifacts.

## Next checks

- Frontend behavior/UI: build first, then run a focused Playwright spec; inspect a screenshot for visual work.
- Server or schema: run typecheck and focused tests; document migration/rollback implications.
- Cross-client API changes: update the OpenAPI description and check Android compatibility.
- Deployment changes: use a non-production dry-run environment or shell-level validation before operating on web roots or services.
