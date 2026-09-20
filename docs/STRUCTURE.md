# `docs/` 结构与新建文档的存放约定

> 本目录的子目录分工是**长期治理约定**。新增文档时按本约定决定落点，不要再凭习惯放。

## 目录分工

| 子目录 | 用途 | 何时落这里 |
| --- | --- | --- |
| `docs/adr/` | **架构决策记录**（Architecture Decision Records） | 影响仓库结构、技术栈、对外契约、开发流程的决策。模板见 `docs/adr/README.md`。 |
| `docs/api/` | **对外 API 描述** | OpenAPI/AsyncAPI 等机器可读的接口契约。 |
| `docs/assets/` | **品牌与插图** | README 用的 hero 图、logo 衍生品。 |
| `docs/audits/` | **审计/复盘/合规报告** | 一次性或周期性的"现状评估 + 改前/改后"对比。例如 `audit-report.md`、`p0.1-edit-regenerate-audit.md`、`2026-09-20-structural-review.md`。**新审计默认落在 `docs/audits/`。** 命名约定：`YYYY-MM-DD-<scope>-<topic>.md`。 |
| `docs/plans/` | **设计、计划、迁移路线** | 仍在推进的迁移（`react-typescript-migration`、`rn-migration`、`unification-plan`）；待实施的重构设计；roadmap。**新计划默认落在 `docs/plans/`。** 命名约定：`YYYY-MM-DD-<topic>.md`（无年月前缀亦可，表示长期计划）。 |
| `docs/STRUCTURE.md` | 自身（你正在读） | — |

## 根目录只放 `STRUCTURE.md`

`docs/` 根目录不应再留存单独的审计或计划文档。如发现：

1. 该归 `docs/audits/` 的归 `docs/audits/`。
2. 该归 `docs/plans/` 的归 `docs/plans/`。
3. 该归 `docs/adr/` 的归 `docs/adr/`。

## `tasks/` 与 `docs/`

`tasks/` 是**外部项目管理面**（用于与外部任务列表同步）的桥梁，`tasks/evidence/` 是 2026-09-20 之前审计历史归档位。

| 子目录 | 用途 |
| --- | --- |
| `tasks/`（根） | 当下与项目所有者对账的活跃任务列表 |
| `tasks/evidence/` | 2026-09-20 之前的一次性 audit 历史（**冻结**，新审计请走 `docs/audits/`） |
| `tasks/archive/<YYYY-MM>/`（推荐） | 月度归档，证据文件多时按年/月分桶 |

**重要**：2026-09-20 起任何新审计报告不再写入 `tasks/evidence/`，统一进 `docs/audits/`。

## 文档命名与时序

- **带年月前缀** = "那时那刻的快照"（审计、特定日期的路线）：`docs/audits/2026-09-20-structural-review.md`、`docs/plans/2026-07-28-tutor-visualization-exam-design.md`。
- **不带年月前缀** = "长期有效主题"（ongoing migration、roadmap）：`docs/plans/react-typescript-migration.md`、`docs/plans/unification-plan.md`。
- **ADR** 用四位数零填充：`0001-…`、`0002-…`、`0003-…`，见 `docs/adr/README.md` 模板。

## 引用合法性

新增/移动文档时注意：

1. README.md / AGENTS.md / CLAUDE.md 里的 `[`docs/...`]` 链接保持正确。
2. 工作流与脚本（`scripts/`, `.github/workflows/`）里 hardcoded 的路径需同步更新。
3. ADR 之间的"前置/后置"链接写绝对 Markdown 路径（`../docs/adr/0003-…`），避免引用漂移。

## 相关文档

- 审计锚点：`docs/audits/2026-09-20-structural-review.md`
- ADR 模板与索引：`docs/adr/README.md`
- 结构治理规则：`docs/adr/0003-structural-debt-categories.md`
