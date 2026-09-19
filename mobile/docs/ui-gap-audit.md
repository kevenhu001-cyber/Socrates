# Current Web ↔ Expo UI gap audit

Audit date: 2026-09-19. The detailed status contract lives in
[`frontend-parity.md`](./frontend-parity.md); executable registration lives in
[`parity-manifest.json`](./parity-manifest.json).

The previous September 3 audit was removed because it described deleted
screens, unreachable components as future work, and superseded CSS metrics.
Do not use historical prose as an acceptance baseline.

## Fixed in the current alignment pass

- The Web baseline now tracks the latest commit touching `frontend/`.
- The parity check derives routes from `RootStackParamList` and
  `Stack.Navigator`, verifies mounted overlays, validates controlled WebViews,
  and rejects missing or asymmetric translations.
- All source translation calls are present in English and Chinese; the Tutor
  navigation label is consistently “辅导”.
- CmdK is mounted and reachable from Ctrl/⌘K and the drawer. Escape and
  Android back dismiss it before navigation.
- Phone home separates the optical-center greeting from the bottom safe-area
  Composer. Empty send has a real disabled presentation.
- Composer tools anchor above their trigger without an opaque page scrim; the
  phone-only menu follows the Web list treatment and hides the desktop footer.
- The temporary drawer now uses the opaque rail surface, 300dp width, 18dp
  trailing corners, 44dp rows, and the compact Web icon/type geometry.
- The shared stream contract and Mobile ToolCard handle `tool_approval`.
- Jest no longer relies on `forceExit`; the leaking Skeleton test unmounts its
  animation explicitly.

## Remaining release blockers

| Priority | Gap | Exit condition |
|---|---|---|
| P0 | No Android emulator/device is attached in this environment | Run the matrix on Android with IME, safe area, system back, permissions, AppState and WebView bridge coverage |
| P0 | Native Prompt Templates manager/repository is not implemented | CRUD, persistence and Composer selection use the shared `PromptTemplate` contract |
| P0 | Tool approval server continuation must be verified end-to-end | Decision endpoint, resumed run stream, rejection and interruption pass on Android |
| P1 | Chat citations and full message operation set are incomplete | citations, edit/delete/regenerate/branch/re-explain/feedback/read-aloud/search match Web behavior |
| P1 | Drawer footer and data-state visuals need final screenshot diff | all four viewports stay within 4dp/1dp tolerance |
| P1 | Tutor and business-directory pages retain spacing/hierarchy drift | loading/empty/data/error screenshots accepted in both locales/themes |
| P1 | tldraw/three.js artifact islands are not registered | CSP, bridge, reload/source/fullscreen/external-link/error fallback tests pass |
| P1 | Detox coverage is still shallow | authentication through artifact flows run in CI without manual setup |

## Evidence

Fast proxy screenshots are written outside the repository under
`/tmp/socrates-align-*.png`. They are diagnostic only. Android screenshots are
the release evidence and must be captured by the Detox matrix once an emulator
or device is available.
