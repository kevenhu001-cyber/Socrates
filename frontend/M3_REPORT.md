# M3 Report — `state.js` Immutable Bridge Refactor

M3 rebuilds the legacy `state.js` around `createImmutableBridge`. Every
namespace (session / kb / search / call / ui / exam) now owns its own
bridge instance, and the flat-namespace Proxy shim routes legacy
`state.X` reads/writes through `stateStore.dispatch` → bridge reducers.
All gates pass.

## 1. Summary of deliverables

| # | Deliverable | Status |
|---|---|---|
| 3.1 | Six namespace bridges in `src/state/bridges.ts` (session / kb / search / call / ui / exam) using `createImmutableBridge` | ✅ |
| 3.1 | Each namespace exposes a typed `Action` union + pure reducer | ✅ |
| 3.1 | `src/state/index.ts` aggregates the bridges + derives `FLAT_STATE_PATHS` automatically | ✅ |
| 3.2 | `state.js` now reads through the bridges and writes via dispatch; the flat `state.X = Y` syntax still works | ✅ |
| 3.2 | `stateStore.dispatch({ type: 'state/set' | 'state/batch' | 'state/patch-namespace' | 'state/reset' })` all route to the right bridge | ✅ |
| 3.3 | `resetState()` is a single `stateStore.dispatch({ type: 'state/reset' })`; the 60-line hand-maintained list is gone | ✅ |
| 3.4 | `createImmutableBridge` uses shallow-freeze so legacy `state.kb.boundariesHistory.push(...)` keeps working; the bridge's `revision` is what powers change detection | ✅ |
| 3.4 | A nested namespace Proxy lets `state.session.phase = "x"` route through the same dispatch path as `state.phase = "x"` | ✅ |
| 3.4 | `state.session[Symbol.iterator]` / `JSON.stringify` / `Object.keys(state.session)` all see the live bridge snapshot — the legacy test contract is preserved | ✅ |
| 3.4 | `stateStore.subscribe()` listeners fire synchronously per dispatch (matching the original `notify()` semantics); the `deferNotify` flag still opts into RAF coalescing | ✅ |

## 2. New files

| Path | Lines | Purpose |
|---|---|---|
| `src/state/bridges.ts` | 313 | One `createImmutableBridge` per namespace (session / kb / search / call / ui / exam). Each exports a typed `Action` union, a pure reducer, and the bridge instance |
| `test/stateFoundation.test.mjs` (new contract) | 145 | Six scenarios covering the M3 surface: flat-key reads, `state/set` and `session/append-message` notifications, batched updates with one notification, indexed message actions, deferred stream coalescing, and full reset |

## 3. Modified files

| Path | Change |
|---|---|
| `src/state.js` | Replaced the hand-rolled Proxy + stateStore IIFE with a thin facade that reads/writes through per-namespace bridges. Sibling state slots (`tutorAttachments` / `tutorPartsTemplate`) live on a small inner proxy that resets to `null` on `state/reset`. Added a per-namespace Proxy so `state.session.phase = "x"` dispatches the same as `state.phase = "x"`. Added `if (typeof window !== "undefined")` guards so the module is importable from Node tests. Window exports for the per-namespace bridges (`__socratesSessionBridge` etc.) are now published alongside `state` and `stateStore` |
| `src/state/index.ts` | Re-exports all six bridges (incl. `uiBridge` and the new `namespaceBridges` map). Keeps `FLAT_STATE_PATHS` auto-derived from each namespace module's `*_FLAT_KEYS` constant |
| `src/state/session.ts` | Adds an explicit `ChatMessageShape` type and a concrete return-type signature on `createInitialSessionState` so the bridge reducer can use proper array types |
| `src/lib/bridge/createImmutableBridge.ts` | `deepFreeze` → `shallowFreeze`. The top level stays frozen for identity stability (and so `useSyncExternalStore`'s snapshot equality works), but nested objects/arrays remain mutable so legacy `state.kb.boundariesHistory.push(...)` patterns keep working. The `immutableBridge.test.mjs` was updated to assert the new shallow-freeze contract |
| `src/types/legacy-global.d.ts` | Adds the typed `stateStore` shape (`read`/`dispatch`/`getSnapshot`/`subscribe`) and a `StateStoreAction` union so TypeScript callers get the action contract without falling back to `unknown` |
| `src/chat/format.ts`, `src/chat/quickActions.ts` | Two `stateStore.read('X')` consumers get an explicit `as` cast where the value is used in a typed context (`string \| null`, `Array<{name, status}>`, `number`) |
| `src/chat/api.js` | Removed two `var state=window.state;` lines that were declared but never used (uncovered while running ESLint on the new state.js) |
| `src/chat/diagnosticParser.js` | Fixed a missing `)` on the `setLastCallError("Diag JSON parse failed: " + …)` call — this had been a parse error since M1 |
| `test/mistakeBook.test.mjs` | Added a tiny `stateStore` shim to the test harness so the M3 `MistakeBook` contract (state writes go through dispatch) can be exercised in isolation |
| `test/immutableBridge.test.mjs` | Updated the `nested frozen` assertion to match the new shallow-freeze contract |

## 4. Verification commands and outcomes

All commands were run from `c:\Users\Jiacheng\Desktop\Socrates\frontend`.

### 4.1 `npm run lint` (the merge gate: `tsc --noEmit`)

```
> socrates-app@1.0.0 lint
> tsc --noEmit
```
Exit code: 0. **PASS.**

### 4.2 `npm run lint:eslint`

```
✖ 711 problems (0 errors, 711 warnings)
```

Zero errors. The 711 warnings are all from the existing source — no new warnings introduced by M3. **PASS.**

### 4.3 `npm run test:unit`

```
1..308
# tests 308
# pass 308
# fail 0
# cancelled 0
# skipped 0
# duration_ms 5615.8122
```

**308/308 PASS.** The new `stateFoundation.test.mjs` (6 scenarios) is part of this count and exercises the bridge facade end-to-end.

### 4.4 `npm run build`

```
✓ built in 7.13s
```

```
dist/assets/ui-ke0Jasqo.js        409.14 kB │ gzip: 127.70 kB
dist/assets/index-DwnT9bdn.js   1,388.58 kB │ gzip: 415.97 kB
dist/assets/style-*.css          926.97 kB │ gzip: 236.52 kB
... (vendor bundles unchanged)
```

**PASS.** `ui` chunk grew by ~5 KB (the new bridges + per-namespace proxy plumbing). Style bundle is byte-identical to M1.

## 5. Behavioural parity

The M3 facade preserves every contract the legacy `state.js` exposed:

| Legacy pattern | M3 behaviour |
|---|---|
| `state.topic` read | `stateStore.read('topic')` → live bridge snapshot value |
| `state.topic = "x"` | Dispatched as `session/set { key: 'topic', value: 'x' }` via the Proxy |
| `state.session.phase = "x"` | Goes through the namespace Proxy → `sessionBridge.dispatch({type:'session/set', key:'phase', value:'x'})` |
| `state.kb.boundariesHistory.push(item)` | Push works (top-level snapshot is shallow-frozen, the array itself is mutable) |
| `stateStore.dispatch({type:'state/set', key:'topic', value:'x'})` | Routes to `sessionBridge` (session is the namespace for `topic`) |
| `stateStore.dispatch({type:'session/append-message', payload})` | Returns the new message's index |
| `stateStore.dispatch({type:'session/update-message', index, clientId, patch})` | Returns the updated message, or `null` when the `clientId` doesn't match (silent no-op) |
| `stateStore.dispatch({type:'session/remove-message-at', index, clientId})` | Returns the removed message, or `null` when the `clientId` doesn't match |
| `stateStore.dispatch({type:'session/truncate-messages-after', index})` | Returns the dropped messages |
| `stateStore.dispatch({type:'state/batch', patch:{topic, phase, _userScrolledAway}})` | Single subscriber notification (one batch = one notify) |
| `stateStore.dispatch({type:'state/reset'})` | Every bridge resets; sibling state (`tutorAttachments`, `tutorPartsTemplate`) goes back to `null` |
| `stateStore.subscribe(listener)` | Synchronous notification per dispatch; RAF coalescing only when an action sets `deferNotify: true` |

## 6. Non-goals respected

- **`STATE_FLAT_TO_NS` is deleted.** Each namespace module declares its own `*_FLAT_KEYS` constant; `FLAT_STATE_PATHS` is composed from those, so adding a new field only requires editing the right namespace module.
- **No `main.js` mutation cleanup.** `state.X = Y` and `stateStore.read('X')` still work everywhere; the migration to direct `useSessionSelector(...)` hooks can proceed module-by-module without blocking M3.
- **No change to the React-side bridge files** (`chatRuntime.bridge.ts`, `attachments.bridge.ts`, etc.). They continue to use `createImmutableBridge` as before; the only contract change is the shallow-freeze (which they don't depend on).
- **No deletion of `windowExports.js` or `ui/delegate.js` yet.** Those belong to M4 and remain on the legacy `data-action` path until their consumers are migrated.

## 7. Migration notes for M4

- The bridges are now exposed on `window.__socrates{Session,Kb,Search,Call,Ui,Exam}Bridge`. React code can subscribe via `useBridge(window.__socratesSessionBridge)` instead of going through `stateStore` — that's the recommended direction for any new React-side consumer.
- The namespace Proxy `window.state.session` is intentionally a *Proxy*; if M4 needs plain object equality (`===`) over a namespace snapshot, use `stateStore.read('session')` (which returns the bridge snapshot directly) or `bridge.getSnapshot()`.
- `stateStore.dispatch({ type: 'session/set' | 'session/patch' | 'session/reset' })` is now part of the public surface. Existing `state/set` callers keep working; new code can use the namespace-prefixed forms directly.
- `state.tutorAttachments = [...]` and `state.tutorPartsTemplate = ...` continue to work (legacy compat for the two slots that predate the namespace split) and are reset to `null` by `state/reset`.
- `createImmutableBridge`'s shallow-freeze is a deliberate trade-off: deep-freeze would have broken the test `state.kb.boundariesHistory.push(...)`. The top-level snapshot identity stays stable via shallow-freeze + `revision++`, which is what `useSyncExternalStore` actually compares against.

## 8. M4 next steps (pending — not part of this PR)

`windowExports.js` (477 lines, ~75 `window.X = X` assignments) and `ui/delegate.js` (444 lines) are still in place. The data-action surface lives in:

- 7 `data-action` literals in React components (`MessageToolbar.tsx`, `CanvasToolbar.tsx`, `SettingsModal.tsx`) — these can become `onClick` handlers in-place
- ~10 `data-action` strings in legacy UI scripts (`viz.js`, `toolCards.js`, `settings.js`, `effortPicker.js`, `voiceInput.js`, `displayPrefs.js`)
- 4 direct `data-action` queries in `main.js` (thumbs-up/down)

Estimated M4 scope: ~250 LOC of refactoring across these files, plus a 82 KB → ~8 KB split of `index.html`. The full plan is in `M4_PLAN.md` (to be drafted).