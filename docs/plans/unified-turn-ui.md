# Unified turn UI — 2026-10-17

Implemented in the Vite frontend, which remains the visual baseline for the Universal App.

An assistant turn now has one `TurnActivitySurface`: a collapsed disclosure containing explicitly public reasoning summaries and tool activity. Intent can label the initial waiting state and is retained inside the live disclosure. Completed outcome summaries do not create an additional surface. Reasoning duration still comes from merged observed reasoning intervals; raw provider reasoning never enters this component.

Tool details and agent step history belong inside the disclosure. Interactive tool results remain at their original prose anchors, and approval prompts, tool failures and retry actions remain outside the disclosure. Tool activity uses the 14px body-small token. The activity heading has one breathing dot; text and tool glyphs stay still. Disclosure motion takes 160ms and respects reduced motion. Cursor geometry also covers the evidence wrapper, so settling does not remove an extra text line.

Assistant actions are Copy, Regenerate, Helpful, Not helpful and More on desktop. Mobile shows Copy, Regenerate and More; feedback moves into More. Secondary actions retain their existing callbacks. The native popover supports outside dismissal, Escape, focus restoration and arrow-key navigation.

`IntelligentSurface` separates the document from its presentation shell. It supports `inline`, `compact`, `carousel`, `fullscreen` and `pip` through the renderer's `displayMode` prop and local controls. Carousel scrolls root nodes horizontally; compact limits document height; floating mode provides an inline return action. Fullscreen uses a native modal dialog with focus containment, Escape, scroll locking and focus restoration. The same nodes stay mounted across every mode, preserving input values, local tab state and incoming document patches.

This change does not add display-mode fields to the server tool protocol or persist a user's mode choice. Provider adapters, plan editing, mid-turn steering, durable artifact revisions and bounded transcript mounting remain separate work.

Focused coverage lives in `turnActivitySurface.test.mjs`, `toolRunRow.test.mjs`, `thinkingPanel.test.mjs`, `agentSteps.test.mjs`, `unified-turn-ui.spec.mjs` and the existing tool, motion, streaming and message-list regression specs. Build before running Playwright against `dist/`.

Validation: root `npm run lint`, frontend `npm run build`, 60 focused unit tests, and 77 distinct browser cases passed across incremental runs. Desktop, phone and fullscreen screenshots were inspected. The same baseline reproduced the old cursor height regression, which this change fixes and verifies on desktop and mobile.

Two browser cases failed on the first pass. Both were reproduced on an isolated worktree of HEAD `e6331030` with a clean build and a free port, and they are now resolved.

**`composer-tool-visual.spec.mjs:5` — fixed, not a baseline.** `ui/effortPicker.ts` sets the standard `hidden` attribute on desktop so reasoning effort lives in the top-bar configuration instead of the composer rail (`a1d66a66`, 2026-10-13, "progressively disclose composer effort control"). The author `display: inline-flex` on `#appShell .composer-shell .effort-picker` outranked the user-agent `[hidden]` rule, so the progressive-disclosure refactor never took effect and the pill leaked onto the desktop rail. `parity/composer-unified.css` now restates the hidden state at higher specificity; the desktop rail is `+ → prompt → mic → send`.

That fix exposed a stale assertion rather than a regression: `composer-parity.spec.mjs` still encoded the 2026-10-04 contract from `8912121c` ("align mobile UI with reference"), which expected the picker to be visible on desktop. The two specs were mutually unsatisfiable. The 2026-10-13 progressive-disclosure contract is the current one, so the parity assertion now expects no composer chip at the default (medium) effort on either surface — desktop hides the picker outright, and the phone rail only shows a chip for an explicitly chosen level (`composer-unified.css` hides `[data-effort="medium"]`). Both specs now pass together.

**`share-view.spec.mjs:105` — still a pre-existing baseline failure.** A public `?share=TOKEN` view expects zero `/api/auth/me` requests but observes one; it reproduces on isolated HEAD. Authentication behavior was not changed here.
