# Unified Intelligent UI and visualization tools

The SPA's `render_intelligent_ui` tool now composes controls, local actions,
computed results and existing native visualization engines in one surface.
The primary contract is input -> state -> action/derived value -> visible output
or an intentional form submission; validation is independent of the tool's name.
`render_visualization`, native JSON nodes and old message formats remain readable.
The Universal App retains its existing generic Intelligent UI fallback; this
change does not add an OpenUI runtime to native clients.

## Composition

For visual tools, bind controls and visual payloads to the same OpenUI state:

```text
root = Col([amount, result, visual])
$n = 2
amount = Slider($n, 1, 8, 1, "Amount")
result = Text("Amount: " + $n)
visual = Visualization("bar", "Amount", {categories:["A"],series:[{name:"Amount",data:[$n]}]}, "Amount controlled by the slider")
```

`Visualization(template, title, payload, accessibilitySummary, caption?)` reuses
the `render_visualization` payload contract and existing lazy engines. ECharts
payload changes update the same chart instance. Other engines remount their
visual card when their payload changes; OpenUI control state stays mounted.
The simple OpenUI `Chart` is still available for lightweight charts.

A pocket calculator remains one optional deterministic component:
`root = Col([Calculator("计算器")])`. It uses immediate pocket-calculator
arithmetic (2 + 3 × 4 = 20), with decimal entry, repeated operations, clear,
backspace, sign changes and division-by-zero handling.

## Generation and validation

`frontend/scripts/generate-openui-prompt.mts` generates the model guidance and
parser schema from the actual library. Regenerate with `npm --prefix frontend
run generate:openui`. The server uses pinned `@openuidev/lang-core` 1.0.1, without
React, to parse completed source. Shared DOM-free checks reject missing roots,
incomplete programs, unresolved references, undeclared state, unbound inputs,
enabled buttons without valid actions and unsupported Query/Mutation calls.
Dataflow checks reject inputs without consumers and actions that only update
unused state. They follow dependencies backwards through local actions and
recognize explicitly submitted form fields. Legacy native buttons also need
a supported explicit action and safe state keys. Source
patches receive the same checks before committing their revision. Embedded
Visualization nodes also receive the existing native template/payload validation
when their defaults can be evaluated without client-only library functions.

Buttons require explicit local or host actions. Missing actions render disabled
and cannot accidentally send a button label to chat. Client-side failures expose
an explicit AI repair action carrying diagnostics, source and current local
state, respecting readonly views. Runtime errors and non-finite state values
surface a repair notice rather than silently passing as successful results.
The scalar-expression checker also diagnoses division/remainder by zero and
numeric overflow in active output/action branches, respecting condition guards
and disabled actions. This is necessary because the pinned OpenUI evaluator
returns 0 for division by zero. While the local result is known invalid, result
components are hidden and inputs stay editable. No vendor runtime is patched.
The repair is a user-triggered follow-up, not an unbounded automatic retry loop.

These checks verify the declared program structure; they cannot prove arbitrary
model-generated business logic correct. The built-in calculator has deterministic
behavior and regression coverage; custom tools still need behavior tests.
Browser tests use model fixtures, not a live provider's generation.

## Visual system

Tool surfaces, cards, forms, segmented choices, controls and repair notices use
one restrained neutral style inspired by OpenAI's interface: clear typography,
generous spacing, quiet outlines and consistent hover/focus/disabled states.
All palette values come from existing theme tokens. The app shell, favicon and
palette ownership are unchanged; tools support light/dark and narrow screens.

The controls are drawn as tools rather than as raw form fields:

- A slider paints its own rail, filled portion and knob from theme tokens. The
  native range input stays transparent above the rail, so it keeps the keyboard
  contract, the pointer target and the `slider` role, while the focus ring
  lands on the knob instead of a frame drawn around a track.
- The pocket calculator reads as one instrument: a display panel, quiet
  function keys, a grouped operator column and a single accent action.
- Segmented choices hug their content instead of stretching into full-width
  tabs, and one short field no longer spans the whole card.
- An embedded visualization no longer draws a second frame inside the card
  that holds it, and the chart toolbar joins the tool's own style.

No HTTP endpoint, OpenAPI route, database schema or migration changes are needed.
Deploy the server and SPA together. Rollback both together; old UI programs
remain stored unchanged, and restoring the previous release restores its previous
validation and button behavior. Install hooks remain restricted to esbuild.

## Focused verification

- Frontend: lint, production build, `openUi`, `openUiTools`, `intelligentUi`, and
  visualization unit coverage.
- Server: typecheck, service-boundary guard, `intelligentUi` and `turnEvents` tests.
- Universal App: typecheck and the shared packages DOM guard.
- Playwright: `openui.spec.mjs` covers calculator arithmetic/keyboard on desktop
  and mobile, native chart state updates without remounting, explicit repair,
  and existing stream, source-patch and history behavior.

The shared semantic checker uses the existing runtime `.js` + `.d.ts` pattern of
`turnRuntime`/`intelligentUiValidation`: server emitted JavaScript imports it
without pulling TypeScript source outside the server build's root directory.

`e2e/intelligent-tools.spec.mjs` exercises the same generated program across
light, dark and mobile: edit a study plan and inspect actual chart data; append
and clear tasks; filter table rows; switch views while preserving local state;
submit form values; and repair an invalid computed result with current inputs.
These are representative general workflows, not calculator-specific rules.

Verified locally on 2026-10-22: frontend lint/build, server build/typecheck and
service-boundary guard, Universal App typecheck, and DOM-free/CSS ownership,
size-ladder, i18n and CSP guards passed. Focused frontend unit coverage: 28 passed;
server: 18 passed. Browser regression: 23 passed; after the final control-cascade
fix, seven targeted appearance/interaction tests passed. A further targeted test
verifies invalid-result recovery by correcting inputs without an AI call.
Desktop 1440×900 and mobile 390×844 screenshots were inspected for typography,
spacing, control hierarchy, theme contrast and overflow. Browser plugin was not
available; validation used repository Playwright against the production SPA at
http://127.0.0.1:4173 with mocked model responses. Nothing was deployed.
