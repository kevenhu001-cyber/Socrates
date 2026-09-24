# ADR 0013 — `frontend/src/` 一级目录合并方案

- 状态：Accepted (ADR 层面；实施进入多 PR 路线图，每 PR 可独立 revert)
- 日期：2026-09-20
- 决策者：项目所有者 + AI 协作会话
- 关联：`docs/adr/0003-structural-debt-categories.md` (P2.4)、`docs/audits/2026-09-20-structural-review.md` F-009

## 背景（2026-09-20 决策快照）

`frontend/src/` 当前有 **27 个一级子目录**。其中：

- `state/`（reactive state，bridges.ts 等） vs `store/`（createDomainStore.ts + index.ts）vs `lib/`（socratesWasm.js + `lib/bridge/`）—— 三处都涉及"状态管理"，但分散在不同语义名后。
- `chat/`（api.js, agentStream.js, diagnosticParser.js 等）vs `render/`（assistantHtml.ts, canvasWrap.ts, helpers.ts 等）vs `state/`—— 实际处理"消息流"时要在 3 个目录间跳转。
- `util/`（api.js, colors.js, ids.js, safe.js）vs `types/`（legacy-global.d.ts, svg-raw.d.ts）—— 都是跨切面工具，但拆两个目录。
- `ui/` 内又有 `ui/icons/`, `ui/keyboard/` 子目录；`react/` 内 25+ feature-folder 子目录（含 `react/sidebar` vs `react/sidebar-chrome`，定位模糊）。

具体影响：

1. **Onboarding 心智成本**：新人"找消息流相关代码"必须在 3 个目录间跳转，"找状态代码"在 2-3 个目录间跳转。
2. **跨目录 import 堆积**：`frontend/src/app/legacyBridge.js` import 自 state/store/chat/render/util，每个 PR 改动相关面都要扫多个目录。
3. **CI 影响面噪音**：`eslint` 与 `dependency-cruiser` 边界规则按目录粒度生效；目录越多，"触发"对读 PR diff 的人来说越难读。

## 实施现状（截至 2026-09-23）

- `frontend/src/` 当前有 25 个一级目录；本轮没有移动或批量重命名目录。
- 前端仍是混合架构：`react/` 管理一批 React/TypeScript 界面，`chat/`、`session/`、`render/` 和 `ui/` 保留 JavaScript 运行逻辑与兼容层。目录之间有跨层引用，迁移应沿用户流程逐段进行。
- `frontend/README.md` 现在列出入口、运行职责和样式级联。同名 `.js` / `.ts` 模块不应据文件名推断为重复实现，迁移前需要检查导入方与导出契约。
- 本轮把 composer 工具调用与编辑器打开菜单的入口接到 `getLegacyActions().composer`，但会话流、旧菜单别名和多数 `window.*` 兼容访问仍保留。目录合并路线仍待独立 PR 和逐项验证。

## 备选方案

### A. 维持 + 文档 INDEX
- 写 `frontend/src/README.md` 列出每个目录职责清单。
- **不采纳**原因：与"结构化边界由 IDE/CI 验证"治理目标冲突。

### B. 激进一步到位：把 27 个目录合并到 6 个（domain 化）
- 目标：`features/`、`state/`、`render/`、`ui/`、`infra/`、`legacy/`。
- **不采纳**原因：单 PR diff 太大；任何遗漏 = 改主入口 import 链数百行；不可分阶段回滚。

### C. 按"职责接近成对"分组逐步合并，每组单 PR（采用本 ADR）
- 6 PR 系列：
  - PR-0013.1：`state/` ∪ `store/` ∪ `lib/` → `state/`（保留 lib 子目录作为 wasm/bridge）
  - PR-0013.2：`chat/` ∪ `render/` 部分 → `chat/` 重组成 `runtime/`、`ui/`、`markup/`（保留 `render/` 为 markdown/katex helper）
  - PR-0013.3：`util/` ∪ `types/` → `util/` 配合子目录
  - PR-0013.4：评估 `react/sidebar` vs `react/sidebar-chrome`，合并或重启单一 sidebar/
  - PR-0013.5：`agent/`、`app/`、`tutor/` —— 按职责收敛
  - PR-0013.6：`vendor/`、`vendor-files/`、`prompts/` —— 资源目录不动（已经在 ADR 0011/ADR 0003 范围内）；本 PR 决定"是否在 `src/ASSETS.md` 加索引"
- **采纳**原因：与 P2 "每 PR 单一子目标、可独立 revert"模板一致；不引入跨目录大重命名。

## 决策

采用 **C**。每个 PR 的目标分组与节奏：

| PR | 合并 | 目标目录 | 风险点 |
| --- | --- | --- | --- |
| 0013.1 | `state/` ∪ `store/` ∪ `lib/`（不含 `lib/bridge`） | `state/`（含 `state/bridge/`、`state/wasm/`） | bridges.ts 与 createDomainStore.ts 之间已有引用；本 PR 不改 import path，把三者目录并列放在 `state/` 下，第二步再合并 |
| 0013.2 | `chat/` ∪ `render/assistantHtml*`、`render/canvasWrap*` | `chat/runtime/`、`chat/markup/` | chat/api.js 等保持独立；render/ 仅留 markdown.ts / viz.js / helpers.ts / katexRefresh / markdownRender 等纯渲染 |
| 0013.3 | `util/` ∪ `types/` | `util/`（`util/types/`） | legacy-global.d.ts 等几行 d.ts 影响 React 类型，但迁移只是 path 变更 |
| 0013.4 | `react/sidebar/` ∪ `react/sidebar-chrome/` | `react/sidebar/`（chrome 转为子模块） | 决定 chrome 是 RN-only 适配层还是桌面 chrome 子模块，影响"是否拆 `react/sidebar/desktop.tsx` 与 `react/sidebar/mobile.tsx`" |
| 0013.5 | `agent/`、`app/`、`tutor/` 评估 | 评估后再决定 | tutor.js 可能是被业务 wizard 取代的 legacy；agent 与 app 可能能合并 |
| 0013.6 | `vendor/`、`vendor-files/`、`prompts/` 索引 | 新建 `frontend/src/ASSETS.md` 与 `frontend/src/PROMPTS.md` | 不动目录结构，仅做 INDEX |

最终目标数：从 27 → 约 14 个一级目录。

## 影响

- **代码**：每个 PR 涉及 import 路径批量更新；ESLint `no-restricted-imports` + IDE 自动化重命名 + grep 双重保险。
- **测试**：`frontend/test/` 路径不参与本 ADR（test 已被 tools 如 Vitest 解析）；Playwright 不变。
- **构建**：bundle graph 因为 import 路径变化会有微小 reorder；visual smoke 必须有 0px 漂移。
- **CI**：`ci.yml` `paths` 触发对 `frontend/**` 已经广覆盖；每 PR 自动获 CI 验证。
- **数据**：无 schema 变更。

## 可逆性

- 回滚成本：低。每个 PR 是 squash 单 commit + 单一目录/文件集；revert 单一 PR 不扩散。
- 回滚步骤：`git revert <PR-sha>` 单 squash commit。
- 边界保护：
  - PR-0013.1 不改 `lib/bridge/` 的对外引用（`window.__socrates*Bridge` 桥接层）；
  - PR-0013.4 拆 desktop/mobile 前必须先有 ADR 决议；
  - PR-0013.5 在 `tutor.js` 处置前必须验证"`docs/plans/exam-product-replacement.md`"里不再引用旧 API。

## 相关链接

- `docs/audits/2026-09-20-structural-review.md` F-009（一级目录分析）
- ADR 0001 / 0002（M1/M2 React 化迁移范畴）
- ADR 0011（vendor 来源策略，本 ADR PR-0013.6 与之配套）
- ADR 0012（styles.css 拆分，`styles/index.css` 是同等级别的"模块聚合入口"，本 ADR 在 frontend/ 上与之同形）
