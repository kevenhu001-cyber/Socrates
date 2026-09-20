# Visual capture harness

Renders the exported Expo web build against a fully mocked `/api/v2` backend
and captures a fixed matrix of UI states as PNGs. Used for UX audits and
visual regression evidence — **it does not change or exercise any app source
directly**; everything is driven through the browser.

## Usage

```sh
cd mobile
npm run visual:all        # export + serve + capture
# or separately:
npm run visual:build      # expo export --platform web -> dist-visual/
npm run visual:capture    # playwright run -> scripts/visual/out/*.png
npm run visual:capture -- 04,07   # only states whose names start with 04 or 07
```

Output: `scripts/visual/out/<state>-<viewport>[-light].png`
(phone 390x844 @2x, wide 1280x800). `out/` and `dist-visual/` are gitignored.

Exit code is non-zero if any state's anchor never appears or a page logs a
console error. The server on `127.0.0.1:8787` is auto-started and stopped;
to run it by hand: `node scripts/visual/serve.mjs`.

## How it works

- `serve.mjs` — dependency-free static server for `dist-visual/` (SPA
  fallback to `index.html`). Override port/host via `VISUAL_PORT`/`VISUAL_HOST`.
- `capture.mjs` — launches Chromium (Playwright resolved from the repo's
  existing `frontend/` install), seeds the auth-token localStorage keys from
  `src/data/api/tokenStore.ts`, routes `**/api/v2/**` to `fixtures/*.json`,
  and drives each state through the real UI (drawer, composer, modals).
- `fixtures/` — realistic session/message/provider/project payloads matching
  `@socrates/contracts` field names. `_ageMinutes` on session list entries is
  a harness hint re-based to `Date.now()` at serve time so the drawer's
  relative-time buckets stay populated; it is stripped before responding.

## Harness-level interventions (read before trusting the pixels)

1. **Composer draft**: RNW's controlled `TextInput` ignores synthetic
   keystrokes in this build, so `06-composer-focused` sets the draft via the
   native value setter + `input` event.

## State matrix

| State | Content |
| --- | --- |
| 01-auth | signed-out AuthScreen |
| 02-home | signed-in empty NewChatScreen (+light) |
| 03-home-drawer | Home with AppDrawer open / permanent sidebar |
| 04-chat | multi-turn seeded chat: heading, list, inline code, fence, table (+light) |
| 05-chat-stream | mid-stream assistant message (Thinking row) |
| 06-composer-focused | composer focused with a 2-line draft |
| 07-composer-attachment | pending attachment chip |
| 08-tools-menu | ComposerToolsMenu open |
| 09-model-picker | ModelPickerModal — **wide only**; the header chip is gated on `!isCompact`, so no phone-width trigger exists |
| 10-settings | Settings (transparentModal) |
| 11-profile | ProfileOverlay |
| 12-msg-actions | assistant message action toolbar, scrolled into view |
