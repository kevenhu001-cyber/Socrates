# ADR 0003 — 结构与技术债分类治理规则

- 状态：Accepted
- 日期：2026-09-20
- 决策者：项目所有者 + AI 协作会话
- 关联：`docs/audits/2026-09-20-structural-review.md`、`docs/adr/README.md`

## 背景

在 2026-09-20 全仓结构审查中识别出 **15 条结构性问题**，散布在 `frontend/src/`、`server/src/`、`docs/`、`scripts/`、`mobile/docs/`、`.github/workflows/` 等多个层面，影响 onboarding、review、构建、CI 触发、视觉回归等多个流程。仓库目前**没有文档化的技术债分级与处理时间窗**，导致：
- 工程师凭直觉判断哪些"必须立刻修"，哪些"以后再说"。
- Review 摩擦：新人遇到 README/AGENTS.md 描述与代码不符时无法判断该信哪个。
- 历史债务反复累积，无 ADR 留痕。

需要一个**长期生效的债务分类治理规则**，用于：
1. 决策一条债务属于哪个级别。
2. 给出每个级别的处理时间窗与执行约束。
3. 让 P0/P1/P2 都有可验证的验收与回滚方式。

## 备选方案

### A. 不引入分级，沿用"修复就好"
- 不写文档，不划级，遇到什么修什么。
- **不采纳原因**：债的"必做度"被丢失，无人区分"今天要修"与"等下次"。
- 仅适合一次性小项目，不适合 1-2 周迭代周期的中型工程。

### B. 引入 L0/L1/L2 三档（采用本 ADR）
- P0 = 必须 ≤ 24 小时；
- P1 = 应该 ≤ 1 周；
- P2 = 计划 ≤ 下一季度。
- **采纳原因**：与本审查 15 条目自然对齐；时间窗可作为 PR SLA；与 ADR 治理模板对接容易。

### C. 采用行业标准尺度（Critical / High / Medium / Low）
- 与外部趋势一致，但与团队现有 P0/P1/P2 表达不一致，引入额外心智负担。
- **不采纳原因**：与 ADR 0001/0002 已有的表达形式冲突。

## 决策

采用 **B：P0/P1/P2 三档**。规则定义如下：

| 级别 | 含义 | 时间窗 | 单 PR 约束 | 验证基线 |
| --- | --- | --- | --- | --- |
| **P0** | "必须"。文档/事实对不上、gitignore 漏补、未清理的开发副产物明显出现。**阻断阅读、阻断 git clone、阻断新人 onboarding**。| **≤ 24 小时** | 单 PR 单 commit | 文本类：`grep` 不再出现旧描述；非文本类：`git check-ignore -v` 通过 / `Get-ChildItem` 不再返回 |
| **P1** | "应该"。CI 拓扑不一致、scripts/ 脚本无 INDEX、docs/ vs tasks/evidence/ 命名重复。**降低开发效率但不阻断**。| **≤ 1 周** | 单 PR，可多 commit | `npm run lint`、`npm run typecheck`、`npm run test:unit`、相关 Playwright spec |
| **P2** | "计划"。styles.css 巨型、frontend 27 个一级目录混乱、vendor 三选一、services/ 60+ 文件混编。**结构性问题，需多 PR 治理**。| **≤ 下一季度，分多 PR** | 每 PR 单一子目标，必须先有 ADR | 视觉基线 capture + E2E + visual diff + bundle 大小记录 |

**额外硬约束（适用于所有 PR，无论级别）**：

- 不得引入数据库 schema 变更。
- 不得修改 `deploy.sh` 主流程。
- 不得未经 ADR 删除 `server/src/index.js` 的 shim 行（保护 systemd 单元兼容性）。
- 每个 PR 是单一 commit（squash merge），标题前缀必须体现本次审查关联（如 `[P0]`、`[P1.1]`、`[P2.3]`）。
- 每个 P2 PR 必须留存视觉基线快照到 `frontend/e2e/__screenshots__/`。

## 影响

- **文档**：本 ADR 是后续所有结构治理 PR 的判据。`docs/audits/2026-09-20-structural-review.md` 把每条事实标注到对应级别。
- **流程**：每个 PR 必须在描述中引用本 ADR 编号 0003 与对应 F-XXX 编号。
- **CI**：暂未要求 CI 拦截 P 级标注（依赖 PR 模板）；后续如需要可在 `.github/PULL_REQUEST_TEMPLATE.md` 加 checklist。
- **代码**：本次审查本身即按本规则分级执行。

## 可逆性

- 回滚成本：极低。仅是一份 rule document，不改代码。
- 回滚步骤：删除 `docs/adr/0003-structural-debt-categories.md` 与 `docs/adr/README.md` 的对应行；但建议保留作为 ADR 体系建立的历史记录，仅在 `docs/adr/README.md` 中标记 `Status: Superseded by NNNN`。
- 关联：本 ADR 与 `docs/adr/README.md` 共同构成 ADR 治理基础设施；任何结构治理 PR 引用这两份。

## 相关链接

- 前置：`docs/audits/2026-09-20-structural-review.md`（本次审查的全文与 F-XXX 编号）
- 后续 ADR 预告：
  - 0004：.gitignore 漏洞补全与散落产物清理
  - 0005：server/src/services/ 子分组治理
  - 0006：frontend vendor-files 三选一精减决策
  - 0007：frontend 一级目录合并方案
  - 0008：styles.css 拆分与切片迁移路线图
  - 0009：CI workflow paths 触发规则整改
- ADR 模板：`docs/adr/README.md`
