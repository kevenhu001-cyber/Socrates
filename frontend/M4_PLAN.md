# M4 Plan — Removing Legacy Bridges

M4 deletes the two compatibility surfaces (`windowExports.js` and `ui/delegate.js`) and splits `index.html` so that every interactive element is owned by either a React component or a focused JS module that mounts its own listeners. This document lays out the concrete audit and a sequenced plan; the actual implementation is intentionally out of scope for the M3 PR.

## 1. Audit of legacy bridges

### 1.1 `windowExports.js` — 477 lines, ~75 `window.X = X` assignments

The file is a single side-effect module: every `window.X = X` line makes the bound function/value visible to inline `onclick="X()"` / `onkeydown="X()"` handlers in `index.html` and in dynamic innerHTML strings. A representative slice:

```js
window.apiConfig = apiConfig;
window.appMode = appMode;
window.thinkingOn = thinkingOn;
window.SERVER_HAS_BEAGLE_KEY = SERVER_HAS_BEAGLE_KEY;
...
```

To delete this file, every inline handler in `index.html` (and in dynamic innerHTML templates) must be replaced with either:
- a React component that owns the relevant host (`MessageToolbar`, `CanvasToolbar`, …)
- a focused JS module that mounts its own `addEventListener` once it sees its host element

### 1.2 `ui/delegate.js` — 444 lines

This module runs event delegation on `document.body`, dispatching `data-action` strings to window functions. The dispatch contract:

```
<button data-action="resetApp">New Chat</button>
<button data-action="openNav" data-action-arg="library">Library</button>
<input  data-action="setRecentsSearch" data-action-arg="value">
<form   data-action="submitAuthSignin" data-action-submit="true">
<button data-action="closeMorePopover;openSettings">Settings</button>
```

`data-action` is currently used in:

| Surface | File | Action literals |
|---|---|---|
| React message toolbar | `react/message-list/MessageToolbar.tsx:19` | (dynamic, per-row) |
| React canvas toolbar | `react/canvas/CanvasToolbar.tsx:49,60,69,77,85` | `canvas-original` `canvas-edit` `canvas-copy` `canvas-iterate` `canvas-fullscreen` |
| React settings modal | `react/settings/SettingsModal.tsx:34` | `close-settings-overlay` |
| Viz cards | `render/viz.js:109,111,113,124,587,678` | `viz-source` `viz-reload` `viz-expand` `viz-toggle-source` |
| Tool cards | `ui/toolCards.js:921,924,1010,1011` | `exec-expand` `exec-download` |
| Settings | `ui/settings.js:149,176,189` | `set-active` `remove-provider` |
| Effort picker | `ui/effortPicker.js:113,241` | `manage-models` |
| Voice input | `ui/voiceInput.js:24` | `toggleSpeechInput` |
| Display prefs | `displayPrefs.js:400` | `toggleDisplayPrefs` |
| Confirm dialog | `ui/confirm.js:19` | `closeConfirm` (comment only) |
| Thumbs feedback | `main.js:4392,4393` | `thumbs-up` `thumbs-down` |

### 1.3 `index.html` — 1046 lines / 82 KB

`index.html` is mostly inlined DOM that pre-dates the React migration. M4 splits it into a static shell (`<head>`, auth gate, app shell container, sidebars, composer, top bar, message list host) and lets React `createRoot` mount each section.

## 2. Proposed sequence

The order below minimises risk: each step is independently shippable and each leaves the existing fallback intact.

### Step 4.1 — React component cleanup (low risk, ~3 PRs)

Convert the four React components that still use `data-action`:

- `MessageToolbar.tsx` — switch to an `onClick` map keyed by the row's action name
- `CanvasToolbar.tsx` — already a React component; the `data-action` attribute is unnecessary. Replace each `data-action="canvas-X"` with an `onClick={…}` that calls the right window function via `window.__socratesLegacy` (the typed bridge) or directly
- `SettingsModal.tsx` — same pattern; the overlay close becomes `onClick={closeSettingsOverlay}` (already imported via `LegacyActions`)

**Acceptance**: `data-action` is no longer present in `react/**`. ESLint rule `react/no-unknown-property` would catch any regression.

### Step 4.2 — Legacy UI script migration (~5 PRs)

For each non-React file with `data-action` literals:

- **Viz cards (`render/viz.js`)** — the source already builds an HTML string; convert the buttons to attach `addEventListener` to each button in a single `forEach` after the HTML is injected. The `data-action="viz-source"` strings go away.
- **Tool cards (`ui/toolCards.js`)** — same pattern: build the HTML, then attach listeners in a loop. The `closest('[data-action=…]')` lookups in the existing click handler disappear.
- **Settings (`ui/settings.js`)**, **Effort picker (`ui/effortPicker.js`)**, **Voice input (`ui/voiceInput.js`)**, **Display prefs (`displayPrefs.js`)** — each owns a single host element; mount a listener once the host is in the DOM.

**Acceptance**: `ui/delegate.js` is no longer imported by `main.js`. The data-action attribute string disappears from `src/ui/**` and `src/render/**`.

### Step 4.3 — Static shell listener migration and `ui/delegate.js` deletion

Step 4.2 removes the `data-action` emitters from legacy-rendered UI, but the static shell in `index.html` still has its own controls. Migrate those controls in focused substeps before deleting the dispatcher: Auth, display preferences, sidebar/navigation, composer/mode, workspace controls, modal backdrops, then the final delegate removal.

**Acceptance**: after Step 4.3g, `ui/delegate.js` is no longer imported, the remaining static controls use direct listeners or React ownership, and `data-action` is absent from non-React source except for documented compatibility fixtures.

### Step 4.4 — `windowExports.js` audit

After steps 4.1–4.3, every inline `onclick="X()"` in `index.html` and in dynamic innerHTML has either been removed (the host is React-owned now) or has been replaced with an `addEventListener` in a focused JS module. The remaining `window.X = X` exports that no longer serve an inline handler can be deleted from `windowExports.js`.

Two-thirds of `windowExports.js` is reusable imports — keep those. The 75 `window.X = X` lines can be removed in groups of ~10 as the corresponding inline handlers migrate.

**Acceptance**: `windowExports.js` is ≤ 100 lines (or empty and ready for deletion). The `inline-handlers.spec.mjs` Playwright test still passes; the `data-action function name resolves on window.fn` assertion is replaced with a `window.__socratesLegacy` smoke check.

### Step 4.5 — `index.html` split

Move the static shell out of `index.html`:

```html
<!doctype html>
<html>
  <head>… CSS links, font preloads …</head>
  <body>
    <div id="authGate"></div>
    <div id="appShell"></div>
    <script type="module" src="/src/main.js"></script>
  </body>
</html>
```

`authGate` and `appShell` are React roots that own the rest of the DOM. main.js's `bootstrap.ts` runs once, mounts both roots, and the inline DOM disappears.

**Acceptance**: `index.html` ≤ 8 KB. No `data-action`, no inline `onclick`, no large inline style attributes.

### Step 4.6 — `bootstrap.ts` final form

After steps 4.1–4.5, `bootstrap.tsx` is a ~30-line module that:

1. Configures the mount registry (`runMountRegistry(document)`)
2. Creates the `authGate` and `appShell` React roots
3. Triggers the first workspace-route sync (the workaround for nav.js's early DOMContentLoaded)

**Acceptance**: `bootstrap.tsx` ≤ 30 lines. `data-react-migration-runtime` / `dataset.XReactHydrated` strings are gone from `src/main.js`.

## 3. Risks and contingencies

- **Risk: dynamic innerHTML still emits `data-action` somewhere we didn't audit.**
  Mitigation: grep across `src/**` after step 4.2 to confirm the contract holds before deleting `delegate.js`.
- **Risk: a sub-feature relies on `data-action="foo"` being available globally for tests.**
  Mitigation: every such feature should be moved to a typed React action (`window.__socratesLegacy.foo()`) before the deletion PR.
- **Risk: Playwright `inline-handlers.spec.mjs` fails on the new boot path.**
  Mitigation: update the spec to test `window.__socratesLegacy` instead. The spec's purpose (no inline `onclick`) is still meaningful after M4.

## 4. Estimated effort

- Step 4.1 — ~half a day
- Step 4.2 — ~2 days (5 sub-tasks, each with a smoke test)
- Step 4.3 — ~1 hour
- Step 4.4 — ~1 day (audit + targeted deletions)
- Step 4.5 — ~1 day (split `index.html`, rewire `bootstrap.tsx`, full Playwright smoke)
- Step 4.6 — folded into 4.5

Total: **~4–5 working days** of focused refactoring, plus a 1-week soak period before the deletion PR lands. The PR-by-PR split above means each merge keeps the existing fallback intact, so a partial completion of M4 is itself releasable.

## 5. What is *not* in M4

- The `main.js` 10K-line surface stays untouched. M4 removes its compatibility bridges; the runtime logic, SSE handlers, and tool pipeline remain.
- The CSS modularisation continues to live in the existing `src/styles/` stub tree (M1). M4 only touches `index.html`, not the styles.
- The `state.js` Proxy shim and `stateStore` facade stay in place — they were validated in M3 and remain useful for the legacy JS that hasn't been React-ified yet (mostly `main.js`).

## 6. Progress

### Step 4.5a — DONE (2026-09-01)

First increment of the `index.html` split: stripped the dead static inner markup of the four **React-owned overlays** (`#cmdKOverlay`, `#shareOverlay`, `#profileOverlay`, `#usageOverlay`). Each is mounted via `createRoot(overlay)` at boot (`hydrateCmdKOverlay` / `hydrateShareModal` / `hydrateProfileModal` / `hydrateUsageModal`), which replaces the host's children — so the ~200 lines of static modal markup was dead weight and its `data-action` attributes were never exercised at runtime.

| Overlay | Change |
|---|---|
| `#cmdKOverlay` | Inner `#cmdKModal` structure removed; `ui/cmdK.js` renderers are already no-ops that publish through the bridge (React owns `#cmdKInput` / `#cmdKResults`) |
| `#shareOverlay` | Inner `.share-modal` removed; `ui/share.js` `renderShareModal()` is already a no-op, bridge-driven |
| `#profileOverlay` | Inner 148-line profile card removed; `ProfileModal.tsx` renders the same element ids (`profileName`, `profileBody`, `profileTier`, `profileInstResponse`, …) |
| `#usageOverlay` | Inner `.usage-modal` removed; `UsageModal.tsx` renders `#usageBody` and the close button |

Each host keeps its `id`, `hidden` class, `role`/`aria-*`, and the backdrop-close `data-action` (`closeCmdK` / `closeShareModal` / `closeProfile` / `closeUsageModal` with `data-action-self-only`) so `ui/delegate.js` still dismisses on backdrop click. `#settingsOverlay` and `#confirmDialog` are **not** React-mounted and were left untouched.

**Impact**: `index.html` 1086 → 886 lines (82.5 KB → 68.9 KB), `data-action` count 182 → 150 (the removed ones are now React `onClick` handlers). The `boot.spec.mjs` inline-handler hash snapshot was regenerated (`d0995e29f01587a8`) since the hash is over the `data-action` attribute set.

**Verification**: `npm run lint` (tsc) pass · `lint:eslint` 0 errors · `test:unit` 309/309 · `npm run build` pass · Playwright focused specs 14/14 (`boot`, `inline-handlers`, `cmd-k`, `cmd-k-compat`, `share-view`, `react-compat`); **full suite green: 161/161 passed (5.5m, `full-suite-run3.txt`)**.

### Step 4.5b — DONE (2026-09-01)

`#settingsOverlay` is React-owned. `SettingsModal.tsx` renders the static skeleton (toggle track, provider-list container, tone-preset container, action buttons) into a body-level `#settingsModalReactRoot`; legacy `ui/settings.js` keeps publishing `open` + `externalApiOn` through `__socratesSettingsBridge` and still renders the dynamic provider rows / tone preset chips into the React-owned `#providerList` / `#tonePresetOptions` containers. The static `#settingsOverlay` markup in `index.html` was removed (no host change — `id`, `hidden`, `role`, `aria-*` stay so `delegate.js`'s `data-action-self-only` backdrop click and Esc still work until Step 4.3).

New files: `src/react/settings/{SettingsModal.tsx, settings.bridge.ts, types.ts, index.ts}`, `e2e/settings-modal.spec.mjs` (4 scenarios: open/close, backdrop + Esc, toggle persistence, add-provider legacy list). Mount spec added to `src/react/lib/boot/specs.tsx`.

**Verification**: `npm run lint` pass · `lint:eslint` 0 errors · `test:unit` 309/309 · `npm run build` pass · Playwright focused: 6/6 (`settings-modal.spec.mjs` 4 + `re-explain.spec.mjs` 2 confirm the React confirm dialog still resolves promises); full suite green: 161/161 passed.

### Step 4.5c — DONE (2026-09-01)

`#confirmDialog` is React-owned. `ConfirmDialog.tsx` renders the overlay shell (title, message, Cancel/OK buttons) into a body-level `#confirmDialogReactRoot`; legacy `ui/confirm.js` keeps the `showConfirm(...)` Promise resolver and publishes `{open, title, msg, danger}` through `__socratesConfirmBridge`. React mirrors visibility, renders the danger-vs-primary button class, and owns the Esc + backdrop-close listeners (the legacy `installModalA11y` registration that pre-mounted the overlay is gone). The static `#confirmDialog` markup in `index.html` was removed.

New files: `src/react/confirm/{ConfirmDialog.tsx, confirm.bridge.ts, types.ts, index.ts}`. Mount spec added to `src/react/lib/boot/specs.tsx`. The snapshot hash regenerated from `d0995e29f01587a8` → `69b6237ce92445fd` (the 4.5a–4.5c static markup removal netted `index.html` to 842 lines / 66 KB; `data-action` count is now ~146).

**Verification**: `npm run lint` pass · `lint:eslint` 0 errors · `test:unit` 309/309 · `npm run build` pass · Playwright: `re-explain.spec.mjs` "cancelling the re-explain confirm" + `settings-modal.spec.mjs` (which exercises the legacy `addProvider` flow and the React settings overlay) both pass.

### Step 4.3 rebaseline (2026-09-01)

The original Step 4.3 estimate assumed that Step 4.2 would leave `ui/delegate.js` unused. The audit after 4.2 found that the static shell in `index.html` still contained 143 `data-action` attributes across roughly 40 actions, while `windowExports.js` still exposed about 100 `window.X = X` bindings. Step 4.3 is therefore split into independently reviewable substeps: Auth, display preferences, sidebar/navigation, composer/mode, workspace controls, modal backdrops, and finally delegate deletion.

### Step 4.3a — DONE (2026-09-01)

The static auth gate now owns its interactions through `mountAuthListeners()` in `src/auth/index.js`. The module mounts idempotent direct listeners (with a disposer) for auth tabs and roving keyboard navigation, view links, code-login controls, and all auth form submissions. The auth markup in `index.html` no longer emits auth `data-action`, `data-action-submit`, or `data-action-keydown` attributes, and the corresponding 14 registrations were removed from `ui/delegate.js`.

| Surface | Change |
|---|---|
| Auth tabs | Direct click + keyboard listeners for `switchAuthTab` / `focusAuthTab` |
| Auth links | Direct listeners for sign-in, register, forgot-password, verification, and code-login transitions |
| Auth forms | Direct `submit` listeners for sign-in, register, resend, forgot-password, and reset-password |
| Verification/code actions | Direct listeners for resend, send-code, login-with-code, and reset-success sign-in |

Regression coverage: `e2e/auth-direct-handlers.spec.mjs` verifies the auth gate with zero auth `data-action` nodes, exercises the register/forgot/code flows, checks submit validation, and checks roving-tab keyboard behavior. The boot hash snapshot was regenerated for the new static attribute set; its remaining `data-action` floor now intentionally excludes the directly-mounted auth gate.

**Verification**: `npm run lint` pass · `npm run lint:eslint` pass (pre-existing warnings only) · `npm run test:unit` pass · `npm run build` pass · focused Playwright smoke **11/11 passed** (`boot`, `auth-direct-handlers`, `inline-handlers`, `settings-modal`, `re-explain`).

### Step 4.3b — DONE (2026-09-01)

The display-preferences module now owns the static display controls through `mountDisplayPrefsListeners()`. It mounts direct listeners for the popover trigger, theme toggle, text-size and content-width segments, accent presets/custom color, grid toggle, and dark/light background pickers plus reset buttons. The corresponding display `data-action` / `data-action-input` attributes and 10 registrations were removed from `index.html` and `ui/delegate.js`; `windowExports.js` bindings remain intentionally available for the 4.4 bridge audit.

`home-customization.spec.mjs` and `theme-system.spec.mjs` now target the stable `#displayPrefsBtn`. New coverage in `e2e/display-prefs-direct-handlers.spec.mjs` verifies that the display subtree has no delegated actions and exercises persistence for font, width, accent, grid, and both background modes, including reset paths and outside-click close behavior.

**Verification**: `npm run lint` pass · `npm run lint:eslint` pass (pre-existing warnings only) · `npm run build` pass · focused Playwright smoke **10/10 passed** (`display-prefs-direct-handlers`, `home-customization`, `theme-system`, `boot`, `auth-direct-handlers`, `inline-handlers`).

### Step 4.2 — DONE (2026-09-01)

All `data-action` emitters/readers in `src/ui/**` and `src/render/**` migrated to direct listeners or class-based dispatch. `ui/delegate.js` stays imported (it still serves the static `index.html` buttons until Step 4.5), and its `toggleDisplayPrefs` / `toggleSpeechInput` / `startSession` / `handleSendClick` registrations remain needed.

| File | Change |
|---|---|
| `ui/effortPicker.js` | "Manage models…" button no longer emits `data-action="manage-models"`; the delegated menu click handler matches `.model-picker-add` instead |
| `ui/settings.js` | `data-action="set-active"` / `data-action="remove-provider"` removed from the provider rows — `_onProviderListClick` already dispatched those by class (`provider-active-btn` / `provider-del`) |
| `ui/toolCards.js` | `exec-artifact-btn` buttons no longer emit `data-action="exec-expand|exec-download"`; the wrap click handler discriminates by element (`a.exec-artifact-btn` = download, `button.exec-artifact-btn` = expand) |
| `render/viz.js` | `vizActions()` / error banners no longer emit `data-action="viz-*"` / `viz-toggle-source`; `_bindAction` now dispatches by class (`viz-btn-source|viz-btn-reload|viz-btn-expand|viz-error-btn`) with a `data-action` fallback for legacy markup; `processPendingVizActions(root)` and `_bindActionsInCard` scan `.viz .viz-btn, .viz .viz-error-btn` instead of `[data-action]` |
| `displayPrefs.js` | `toggleDisplayPrefs()` looks up the toggle by `#displayPrefsBtn` (id added to the `index.html` button) instead of `[data-action="toggleDisplayPrefs"]` |
| `ui/voiceInput.js` | `setListening()` dropped the dead `[data-action="toggleSpeechInput"]` loop (no such buttons exist); only `#startBtn` / `#sendBtn` are toggled |

Deferred (documented, not in the 4.2 target list): `main.js:4392-4393` (`[data-action="thumbs-up|down"]` dead optimistic-UI block, no caller passes `bar`), `ui/composerTools.js:119` (`[data-action],[data-composer-action]` defensive fallback for legacy menu items — items now emit `data-composer-action`), `ui/delegate.js` itself, and all static `index.html` `data-action` attributes (Step 4.5).

**Verification**: `npm run lint` (tsc) pass · `lint:eslint` 0 errors (only pre-existing warnings) · `test:unit` 309/309 · `npm run build` pass · Playwright: full suite 159 passed / 2 failed, where the 2 were pre-existing (see Bug fixes below); after the fixes, **full suite is green: 161/161 passed (5.4m, `full-suite-run2.txt`)**.

### Pre-existing bug fixes (landed before Step 4.2)

While re-verifying the full suite, two pre-existing failures were fixed:

1. **Approval POST silently dropped after a finished turn** (`e2e/codex-panel.spec.mjs` "approval decision uses the durable run and approval ids").
   Root cause: `finish()` calls `toolRuntime.dispose()`, which pins `postFinishApprovalMessage` to the current message object, then applies the final `session/update-message` patch whose reducer replaces the message object (`{ ...current, ...patch }`). `activeMessage()`'s strict `current === postFinishApprovalMessage` identity check then failed, so `decideApproval` returned early without POSTing.
   Fix: `chat/toolRuntime.ts` `activeMessage()` compares ownership by `clientId`/`id` instead of object identity, so the store's object swap doesn't orphan the pending approval while a session switch is still refused. Regression test added: `test/toolRuntime.test.mjs` "decideApproval still POSTs after dispose when the store swaps the message object".

2. **Recents silent-error spec assumed English UI** (`e2e/zz-test-recent-silent-error.spec.mjs`).
   The failure empty-state copy is asserted with an English-only regex (`couldn't|failed|error|try again|retry`), but the app boots in zh. Both tests now pin `socrates-lang-app` to `en` (same pattern as `codex-panel.spec.mjs`). The feature itself was correct — the DOM showed the zh failure message + retry.

(`e2e/composer-auto-resize.spec.mjs:86` also failed once in the baseline run but is timing-flaky — it passed on re-run both before and after these changes.)

### Step 4.1 — DONE (2026-09-01)

`data-action` is gone from `src/react/**` (verified: `grep -r "data-action" src/react` → 0 hits).

| File | Change |
|---|---|
| `src/react/message-list/MessageToolbar.tsx` | Dropped the `action` prop from `IconButton` and its `data-action={action}` attribute; every button already dispatched through `onClick` → `useMessageToolbarCallbacks` |
| `src/react/canvas/CanvasToolbar.tsx` | Removed the five `data-action="canvas-*"` attributes (buttons already had `onClick`) |
| `src/react/settings/SettingsModal.tsx` | Removed `data-action="close-settings-overlay"`; overlay backdrop close now checks `e.target === e.currentTarget`. (This component is currently **not mounted** — `mountSettingsModal` is exported but never called; the live overlay is the static `index.html` `#settingsOverlay`, which keeps its `data-action` until Step 4.5.) |
| `e2e/message-list-compat.spec.mjs` | Toolbar locators switched from `[data-action="copy"]` etc. to `button.msg-toolbar-btn[aria-label="Copy"]` etc. |
| `e2e/re-explain.spec.mjs` | `[data-action="re-explain"]` → `button.msg-toolbar-btn[aria-label="Re-explain from a different angle"]` (`[data-action="closeConfirm"]` on the confirm dialog is out of 4.1 scope and left untouched) |
| `e2e/inline-handlers.spec.mjs` | Updated the `close-settings-overlay` whitelist comment: the attribute still lives on the static `index.html` overlay and is closed by `ui/settings.js`'s own overlay click listener, not by delegate.js — entry stays until Step 4.5 removes the attribute from `index.html` |

Notes for later steps:

- `main.js:4392-4393` (`sendFeedback`'s `bar` optimistic-UI block) still queries `[data-action="thumbs-up"]` / `[data-action="thumbs-down"]`, but no caller passes `bar` (React calls `sendFeedback(id, rating)`), so the block is dead; left untouched per §5.
- `index.html:868` keeps `data-action="close-settings-overlay"` on the static `#settingsOverlay` until the Step 4.5 split.

**Verification**: `npm run lint` (tsc) pass · `lint:eslint` 0 errors (711 pre-existing warnings, unchanged from M3) · `test:unit` 308/308 · `npm run build` pass · Playwright: `boot`, `inline-handlers`, `message-list-compat`, `re-explain` all pass (12/12); full suite 157 passed / 4 failed, and the 4 failures (`codex-panel` approval ids, `zz-test-recent-cross-device`, `zz-test-recent-silent-error` ×2) were confirmed pre-existing by stashing the 4.1 changes and re-running — they reproduce without this work and touch none of the files changed here.
