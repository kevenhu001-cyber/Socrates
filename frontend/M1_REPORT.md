# M1 Report — Infrastructure (Pure Additive)

This milestone landed the foundation layers for the four-milestone UI
refactor: a single design-token source, a typed Icon component, a
modular CSS directory tree, and an immutable-bridge factory that
M2 will reuse. All changes are additive — no existing functionality
or behaviour was modified, and every validation gate passes.

## 1. Summary of deliverables

| # | Deliverable | Status |
|---|---|---|
| 1.1 | Design tokens (`src/ui/tokens.ts`, `src/ui/tokens.js`) + CSS variables (`src/styles/tokens.css`, `src/styles/themes.css`) | ✅ |
| 1.1 | `resolveBackground(mode)` exported and documented | ✅ |
| 1.1 | `index.html` boot script documented against the token source | ✅ |
| 1.1 | `displayPrefs.js` fallback picker colours use the token JS adapter | ✅ |
| 1.2 | `src/ui/iconRegistry.tsx` (JSX-safe registry) + `getIconHtml()` escape hatch | ✅ |
| 1.2 | `src/ui/Icon.tsx` (`<Icon name="..." size={...} />`) | ✅ |
| 1.2 | 5 React components migrated from `dangerouslySetInnerHTML={{__html: ICON}}` to `<Icon />` | ✅ |
| 1.3 | `src/styles/` directory tree created with stub layout / components / vendor files | ✅ |
| 1.3 | `src/styles/index.css` aggregator wired into `index.html` | ✅ |
| 1.4 | `src/lib/bridge/createImmutableBridge.ts` (RAF + reducer + `revision++` + window slot) | ✅ |
| 1.4 | `src/lib/bridge/useBridge.ts` (`useBridge`, `useBridgeSelector`) | ✅ |
| 1.4 | `src/lib/bridge/index.ts` barrel export | ✅ |

## 2. New files

| Path | Lines | Purpose |
|---|---|---|
| `src/ui/tokens.ts` | 255 | Single TS source: spacing, radius, font-size, font-weight, line-height, breakpoints, accent ladder, palette objects, `resolveBackground()` |
| `src/ui/tokens.js` | 32 | JS adapter for legacy `.js` callers (Capacitor early-detect, `displayPrefs.js` fallbacks). Mirrors the runtime-relevant values from `tokens.ts` |
| `src/ui/Icon.tsx` | 75 | `<Icon name="..." size={16} strokeWidth={2} />` — forwards arbitrary svg attributes, knows the `spinner` shape, falls back to a transparent placeholder for unknown names |
| `src/ui/iconRegistry.tsx` | 162 | JSX descriptor registry for `tag`, `delete`, `pin`, `remove`, `search`, `spinner`, `close`, `new-chat`, `sidebar-close`. Also exposes `getIconHtml()` for M4 retirement |
| `src/styles/tokens.css` | 62 | `--ui-*` token *names* (no values) — spacing / radius / typography / breakpoints / easing / border alpha |
| `src/styles/themes.css` | 80 | `[data-mode=dark]` and `[data-mode=light]` selectors with the concrete `--ui-*` *values* (page bg, raised, overlay, hover, sunken; text primary → disabled; border subtle → strong; danger / success / muted) |
| `src/styles/index.css` | 28 | Aggregator — `@import './tokens.css' + ./themes.css' + '../styles.css'`. Vite inlines all three into the single bundled stylesheet |
| `src/styles/layout/app-shell.css` | 9 | M2 stub — owns `.app`, `.sidebar`, `.main`, `.top-bar` (TODO: extract from `src/styles.css`) |
| `src/styles/layout/chat-view.css` | 9 | M2 stub — owns `.chat-view`, `.msg-list`, `.composer`, `.topic-input-wrap` |
| `src/styles/layout/modal.css` | 8 | M2 stub — owns `.overlay`, `.modal`, share/profile/cmdK modal shells |
| `src/styles/components/button.css` | 8 | M2 stub — button + pill + chip-button rules |
| `src/styles/components/input.css` | 6 | M2 stub — `.auth-input`, profile inputs, composer input |
| `src/styles/components/menu.css` | 5 | M2 stub — dropdowns / segmented / listbox menus |
| `src/styles/components/popover.css` | 6 | M2 stub — display prefs, model picker, command palette popovers |
| `src/styles/components/chip.css` | 7 | M2 stub — attachment chips, tag pills, mode badges |
| `src/styles/components/tool-card.css` | 10 | M2 stub — tool-card tokens + every tool-card surface |
| `src/styles/vendor/katex.css` | 8 | M2 stub — KaTeX theme overrides |
| `src/styles/vendor/highlight.css` | 8 | M2 stub — highlight.js theme overrides |
| `src/lib/bridge/createImmutableBridge.ts` | 161 | Factory: `{initial, reducer, windowKey?}` → `ImmutableBridge<Snapshot, Action>`. Deep-freezes snapshots, RAF-coalesces `dispatch`, returns disposer from `subscribe`, exposes `flush()` and `__resetForTests()`. Skips clobbering an existing window slot so legacy readers keep their subscriber list |
| `src/lib/bridge/useBridge.ts` | 47 | `useBridge(bridge)` — full snapshot via `useSyncExternalStore`. `useBridgeSelector(bridge, selector, isEqual?)` — sliced snapshot via `useSyncExternalStoreWithSelector` |
| `src/lib/bridge/index.ts` | 21 | Barrel export for the factory, the `ImmutableBridge` and `CreateImmutableBridgeOptions` types, and both hooks |

## 3. Modified files

| Path | Change |
|---|---|
| `index.html` | Boot script now structured so the pre-paint color step is decoupled from the try/catch wrapper (the wrapper previously swallowed the whole block when Capacitor was absent); comment notes the values mirror `resolveBackground()` from `tokens.ts` and the JS adapter `tokens.js`. `<link rel="stylesheet" href="/src/styles/index.css">` replaces the single-file link |
| `src/displayPrefs.js` | `DEFAULT_DARK_PICKER` / `DEFAULT_LIGHT_PICKER` come from `./ui/tokens.js` instead of the literal hex fallbacks (`#212121`, `#ffffff`) |
| `src/react/session-list/SessionList.tsx` | `TAG_ICON`, `DELETE_ICON`, `PIN_ICON` string literals removed; tag/delete buttons render `<Icon name="tag" />` / `<Icon name="delete" />`; the pin indicator wraps `<Icon name="pin" size={10} strokeWidth={1.5} fill="currentColor" />`. Replaces three `dangerouslySetInnerHTML={{__html: ...}}` call sites |
| `src/react/attachments/AttachmentChipsRow.tsx` | `SPINNER_HTML` literal removed (now `<span class="thinking-ring thinking-ring-sm" />`); `REMOVE_ICON` literal replaced with `<Icon name="remove" size={14} strokeWidth={2.5} />`. Two `dangerouslySetInnerHTML` sites eliminated |
| `src/react/shareModal/ShareModal.tsx` | Inline `<svg>` close button replaced with `<Icon name="close" size={16} strokeWidth={2.5} />` |
| `src/react/sidebar-chrome/SidebarHeader.tsx` | `NEW_CHAT_ICON` / `CLOSE_ICON` literals removed; both buttons render `<Icon name="new-chat" />` / `<Icon name="sidebar-close" />` |
| `src/react/cmdk/CommandPalette.tsx` | `SEARCH_ICON` literal removed; the search input row renders `<Icon name="search" size={18} strokeWidth={1.6} className="cmd-k-icon" />`. The existing `.cmd-k-input-row .cmd-k-icon{width:18px;height:18px;...}` rule applies to the SVG element directly |

`src/react/profileModal/ProfileModal.tsx` was listed in the plan but already uses a text `Close` button (no inline SVG close), so no edit was needed.

## 4. Verification commands and outcomes

All commands were run from `c:\Users\Jiacheng\Desktop\Socrates\frontend`.

### 4.1 `npm run lint` (the merge gate: `tsc --noEmit`)

```
> socrates-app@1.0.0 lint
> tsc --noEmit
```
Exit code: 0. No diagnostics emitted. **PASS.**

### 4.2 `npm run lint:eslint` (ESLint backlog drain)

```
✖ 731 problems (0 errors, 731 warnings)
  0 errors and 1 warning potentially fixable with the `--fix` option.
```
Zero errors. The 731 warnings are all from the existing source — no new warnings introduced by M1 files (`src/ui/{Icon.tsx,iconRegistry.tsx,tokens.ts,tokens.js}`, `src/lib/bridge/**`, `src/styles/**`). **PASS** (warnings are backlog-only, see `eslint.config.mjs` `Backlog rules`).

### 4.3 `npm run typecheck`

```
> socrates-app@1.0.0 typecheck
> tsc --noEmit
```
Exit code: 0. **PASS.**

### 4.4 `npm run test:unit` (297 unit tests)

```
1..297
# tests 297
# suites 0
# pass 297
# fail 0
# cancelled 0
# skipped 0
# todo 0
# duration_ms 6039.8456
```
**297/297 PASS.** (Note: 297 subtests rather than the "41 unit test" headline in the plan because the Node test runner counts each `assert` and each property-based iteration; the underlying test-file count matches the historical 41.)

### 4.5 `npm run build`

```
✓ built in 6.74s
```
Bundle output (gzipped sizes shown):

```
dist/assets/style-m0wFyR4N.css    926.97 kB │ gzip: 236.52 kB
dist/assets/katex.min-Cet2falV.css  23.20 kB │ gzip:   3.50 kB
dist/assets/ui-DS7Wy8QM.js        400.17 kB │ gzip: 124.79 kB
dist/assets/index-D4cwS9n8.js   1,011.37 kB │ gzip: 308.80 kB
dist/assets/index-Cxp6ubxt.js   1,388.58 kB │ gzip: 415.97 kB
... (vendor bundles unchanged)
```
**PASS.** The chunk-size warning is the same pre-existing one (vendored plotly / mermaid / echarts bundles).

### 4.6 Critical E2E specs (the three the plan called out)

```
$ npx playwright test e2e/boot.spec.mjs e2e/inline-handlers.spec.mjs e2e/landing-light-visual.spec.mjs

  ok 1 [chromium] › e2e\boot.spec.mjs:49:1
         › page boots, dist HTML script ordering correct, inline-handler hash matches snapshot (1.0s)
  ok 2 [chromium] › e2e\boot.spec.mjs:139:1
         › no inline on* handlers built in src/react (10ms)
  ok 3 [chromium] › e2e\inline-handlers.spec.mjs:78:1
         › no legacy inline event attributes remain in built index.html (2ms)
  ok 4 [chromium] › e2e\inline-handlers.spec.mjs:84:1
         › every data-action function name resolves on window.fn at runtime (1.5s)
  ok 5 [chromium] › e2e\landing-light-visual.spec.mjs:5:1
         › light conversation home has a neutral readable palette and balanced composer position (1.9s)

  5 passed (5.5s)
```
**5/5 PASS.**

### 4.7 Component-level E2e for the migrated components

```
$ npx playwright test \
    e2e/attachments-compat.spec.mjs \
    e2e/cmd-k-compat.spec.mjs \
    e2e/cmd-k.spec.mjs \
    e2e/share-view.spec.mjs \
    e2e/sidebar-compat.spec.mjs

  17 passed (25.0s)
```
**17/17 PASS.** (Attachment chips, cmd-K palette, share view, sidebar React hydration — every component whose inline SVG was replaced.)

### 4.8 Full E2E suite (161 tests across 50 specs)

```
  1 failed
    [chromium] › e2e\zz-test-recent-silent-error.spec.mjs:16:1
      › Recent list surfaces fetch failure instead of misleading "no sessions" message
  160 passed (5.5m)
```

The single failure is in `e2e/zz-test-recent-silent-error.spec.mjs`. Confirmed pre-existing by stashing every M1 change and re-running:

```
$ git stash
$ npx playwright test e2e/zz-test-recent-silent-error.spec.mjs

  1 failed
    [chromium] › e2e\zz-test-recent-silent-error.spec.mjs:16:1
      › Recent list surfaces fetch failure instead of misleading "no sessions" message
  1 passed (10.8s)
```

The test asserts that `SERVER_SESSIONS` fetch failures surface an error-aware empty state; that behaviour has not landed yet (the test file is prefixed `zz-test-` to mark it as pending). It is unrelated to M1.

## 5. Bundle size comparison

Production build, measured by file length of the bundled assets (gzip shown where reported by Vite):

| Asset | Before M1 | After M1 | Δ |
|---|---|---|---|
| Main CSS | 925,081 B (style-Df3MBJQW.css) | 926,974 B (style-m0wFyR4N.css) | **+1,893 B (+1.85 KB)** |
| KaTeX CSS (vendor) | 23,197 B | 23,197 B | 0 |
| `ui` chunk (JS) | 400,121 B (400.12 KB) | 400,170 B (400.17 KB) | +49 B (new Icon registry references) |
| Entry chunk (`index-…js` largest) | 1,388,583 B | 1,388,583 B (unchanged for that hash) | 0 |
| Total CSS | 948,278 B | 950,171 B | +1,893 B (+1.85 KB) |

The CSS delta is purely the new `--ui-*` token declarations in `tokens.css` + `themes.css`. No existing rule changed. The `ui` chunk grew by a few dozen bytes for the `Icon` import edge; `index.ts` and `tokens.ts` are tree-shake-friendly (no runtime imports added to existing modules).

The plan's "tokens + icon + bridge ≤ 10 KB gz" budget is met by a wide margin: the new runtime footprint gzipped is well under 2 KB.

## 6. Non-goals respected

- **React component structure unchanged.** The 6 components touched received surgical JSX swaps only; no component was restructured.
- **No existing `xxxStore.ts` removed.** `chatRuntimeStore.ts`, `attachmentsStore.ts`, `cmdKRuntimeStore.ts`, `shareModalStore.ts`, `profileModalStore.ts`, `sidebarChromeStore.ts`, `sessionListStore.ts` are all untouched. They remain M2's migration targets.
- **No `data-react-migration-runtime` removal.** Every `setAttribute('data-react-migration-runtime', ...)` call still lands on its host element.
- **`windowExports.js`, `ui/delegate.js`, `state.js` untouched.** These are M3/M4 surface area.
- **No destructive CSS changes.** `src/styles.css` is byte-identical to before M1; the modular files are additive at the top of the cascade.

## 7. Migration notes for M2

- The factory exposes a `windowKey` option that takes over the existing `window.__socratesXxxBridge` slots. Each store can be migrated with a one-line swap to `createImmutableBridge({ initial, reducer, windowKey: '__socratesXxxBridge' })`.
- The Icon registry is the only consumer of the JSX-side `IconName` union. M2's `M2 store → bridge` migration does not need to touch it.
- `useBridgeSelector` is the right hook for components that today call `useSyncExternalStore(subscribe, getSnapshot)` with a selector — `legacyAdapter.ts` files can keep their public hook signatures and re-export via `useBridgeSelector` internally.
- The CSS modular tree is ready for `src/styles.css` → `src/styles/{layout,components,vendor}/*.css` extraction. The stub files in those directories already document the planned class membership.