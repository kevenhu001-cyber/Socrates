# Naming rules

Names describe ownership, not history. Do not add milestone codes (`M1`,
`P_*`, `B6 batch`) to new code; put the rationale in the commit or an ADR.

## File suffixes

| Suffix | Meaning | Must not contain |
|---|---|---|
| `.store.ts` | state + transitions for one feature | network I/O, DOM measurement |
| `.service.ts` | I/O or domain operation | React state, DOM writes |
| `.bridge.ts` | compatibility adapter to legacy `window.*` actions | new business rules |
| `.impl.ts` | lazy implementation behind a synchronous facade | a second public API |
| `.model.ts` | pure data/derivation | side effects |
| `.actions.ts` | typed command surface | state storage |
| `.types.ts` | types only | runtime values |

A file and a directory must not share the same basename at the same level.
Use `feature/index.ts` for the public entry instead of `feature.ts` +
`feature/`.

## Canonical names

- One message shape: `Message` in `packages/contracts` is the persisted
  canonical row. `ChatMessage` extends it with web-only ephemeral fields;
  `ProviderMessage` is the different LLM wire shape. Do not add another
  `LegacyChatMessage` / `StoredMessage` / `TurnMessage` alias.
- One turn: `Turn` is the durable unit; `TurnEvent` is its streamed record;
  `ChatStreamFrame` is the live SSE frame. Do not call all three "event".
- One UI layer name: `react/` is React DOM, `packages/ui/` is RN-Web shared
  presentation, `frontend/src/ui/` is legacy DOM adapters (not components).
- One intelligence-UI name: `openui` for the renderer and grammar; `intui.*`
  is only an i18n key prefix kept for compatibility.
- `native/` means the Android WebView bridge; React Native Web lives in
  `react/rn/`.

## Historical comments

If a comment explains why code is shaped a certain way, state the invariant and
link the ADR/plan. Do not cite a milestone number without a link. Prefer
"why this must stay true" over "extracted from main.js in batch B6".

The tree currently has no file/directory basename collisions. Keep it
that way: `feature/index.ts` is the public entry, never `feature.ts` plus
`feature/`.
