# Raw-only history restoration performance

## Finding and change

`session/historyRestore.ts::restoreSessionMessage` eagerly rendered every raw-only message while mapping a session response. Assistant rows subsequently rendered canonical `rawText` again in `AssistantTurn`. A transcript initially mounts only 12 rows, yet opening 1,000 raw-only messages performed Markdown/sanitization work for all 1,000. Scaffold parsing could also schedule widget mounts for HTML slots that were never inserted.

Restoration now normalizes message data and retains supplied HTML snapshots without synthesizing missing snapshots. Assistant prose renders through the existing declarative renderer. Historical user Markdown renders in `MessageBody`, memoized for the mounted row, so its appearance is preserved; newly sent user messages still display original text. Restored rows run post-render wiring even without a snapshot, preserving tools, charts, images, and code controls. Supplied HTML-only legacy answers and think-block removal remain supported. Message IDs, raw text, tool metadata, persistence watermarks, and API protocols retain their existing contracts.

## Measurements

Production Vite build served by the local Playwright dist server, fresh authenticated mocked app contexts, empty detail cache, 200 or 1,000 alternating user/assistant rows. Each assistant answer contains distinct Markdown prose, a list, and a code fence. The session GET is mocked; these numbers do not represent production network latency or field INP.

The open interval starts at `loadSession` and ends after its promise plus two animation frames. The response-to-paint proxy subtracts the session resource's `responseEnd`, retaining decoding, normalization, state publication, rendering, layout, and frame scheduling. It is not a browser presentation timestamp. A single instrumented pre-change run is compared with the median of three final candidate runs per scenario; these are not p95 values.

| Messages | CPU slowdown | Response to paint before | Response to paint after | Longest task before | Median longest task after |
| --- | --- | --- | --- | --- | --- |
| 200 | 1× | 239.4 ms | 90.8 ms | 223 ms | 74 ms |
| 1,000 | 1× | 671.8 ms | 108.7 ms | 644 ms | 82 ms |
| 200 | 4× | 917.3 ms | 384.4 ms | 839 ms | 314 ms |
| 1,000 | 4× | 2,939.6 ms | 475.8 ms | 2,832 ms | 357 ms |

For 1,000 rows, total open time fell from 690.5 to 126.6 ms at normal CPU, and 2,964.4 to 500.6 ms at 4× slowdown. Mocked session-request time was about 13 ms in both versions. Initial mounted rows remain 12, all message data remains available, and scrolling older history keeps the existing 60-row cap. Missing snapshots remain absent after viewing and do not cause an unchanged answer to be re-uploaded on the next incremental save.

The remaining 4× cold-open task is still too long. The 200→1,000 growth is substantially smaller, but normalization, fingerprint seeding, decoding, and visible rich-content rendering still require work. This change does not establish a universal optimum or meet every interaction target from the earlier plan; cold opening and cache-hit switching are different scenarios.

## Verification and reproduction

From `frontend/`:

```sh
npm run lint
npm run build
npx tsx --tsconfig tsconfig.test.json --test test/historyRestore.test.mjs test/messageOps.test.mjs test/saveDelta.test.mjs test/messageItemMemo.test.mjs
npx playwright test --config=playwright.config.mjs e2e/history-rich-content.spec.mjs e2e/session-incremental-save.spec.mjs e2e/message-list-compat.spec.mjs e2e/chat-send.spec.mjs e2e/performance-loading.spec.mjs --workers=1
npx playwright test --config=playwright.config.mjs e2e/performance-history-restore.spec.mjs --workers=1 --repeat-each=3
```

Lint/build, 26 focused unit tests, 29 functional/loading browser cases, and 12 repeated history performance cases passed. Desktop and mobile raw-only rich-history screenshots were inspected. The performance spec attaches JSON and Playwright traces, records request/frame/task metrics, checks no eager snapshots, verifies code rendering in the first window and after scrolling, and enforces the existing mount bound. `PERF_BASELINE=1` allows the pre-change snapshot count for comparison. Generated artifacts stay under ignored `frontend/test-results/` and are not committed.

## Remaining optimization opportunities

1. Profile the remaining visible-row cold render on slower devices, separating Markdown/sanitization, code highlighting, widget initialization, and React commit/layout. Use that attribution to evaluate smaller initial rich-content batches; a worker is useful only for independent pure computation that dominates the trace.
2. Measure real-user input and session-switch latency by device, history size, cache status, and request/response timings. Local synthetic cold-open data does not identify geographic network or server bottlenecks.
3. Very large histories still arrive and normalize in full. Cursor-based history pagination would bound response bytes and normalization work as well as DOM work, but requires a separately scoped cross-client API/contracts change. It is outside this frontend-only protocol-preserving pass.
4. Extend lifecycle stress coverage to interrupted-response recovery and heavyweight content. Stable plain-text switching does not prove that every tool, iframe, observer, or recovery listener has a bounded lifetime.
