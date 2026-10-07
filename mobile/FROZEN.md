# mobile/ — FROZEN as of 2026-10-06

`mobile/` 不再接受新功能、视觉 parity、对齐重构。

- 允许：release-blocking 的安全 / crash / data-loss 修复，且必须最小 diff + 回归用例。
- 禁止：Web/Mobile UI parity、新路由、新组件、主题重做、大重构。
- 新工作一律去 `apps/socrates/` + `packages/`（Universal App，RN + Expo + RN Web + Zustand + Reanimated）。
- `frontend/` 是当前唯一的视觉/功能基准；`apps/socrates/` 达到基准前不扩大迁移范围。
- 仍可运行既有校验（`npm run typecheck`、`npm test`），但仅用于上述允许的修复。
- CI parity pin retired: `npm run check:parity` was removed from `build-apk.yml` on 2026-10-07 — a frozen baseline can never track `frontend/` HEAD again. The script remains for manual audits only.
