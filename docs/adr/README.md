# ADR — Architecture Decision Records

本目录是 Socrates 的**架构决策记录**（Architecture Decision Records）主索引。所有影响仓库结构、技术栈选型、长期方向、对外契约或开发流程的重大决策，都必须先写一份 ADR，再写代码。

## 使用规则

1. **命名**：`NNNN-<kebab-case-slug>.md`，4 位序号自增。
2. **状态**：必填字段。值仅在 `Proposed` / `Accepted` / `Superseded by <NNNN>` / `Deprecated` 之内变更。
3. **每个新 ADR 必含**：背景、备选方案、决策、影响、可逆性、相关链接。
4. **不写决定的 ADR 不予合入**。纯笔记请放 `docs/plans/` 或 `tasks/evidence/`。
5. **被取代的 ADR 必须保留**，并在头部增加 `Status: Superseded by NNNN`。

## 模板

复制下面整段，从 `## 背景` 起改写：

```markdown
# ADR NNNN — <一句话决策>

- 状态：Proposed
- 日期：YYYY-MM-DD
- 决策者：<谁定的 — 项目所有者 / 审阅会 / 自动化审计>
- 关联：<相关 ADR 编号或文档>

## 背景

<什么样的问题、信号、约束触发了这个决策。要给出会外人也看得懂的上下文。>

## 备选方案

### A. <路径名>
<一句话权衡 + 主要风险。>

### B. <路径名>
…

### C. 不动
<不做的代价。>

## 决策

选择 `<A/B/C>`。理由：<2-3 句>。

## 影响

- 代码：<哪些目录/文件会变>
- 数据：<schema、向后兼容>
- 部署：<worker restart、迁移、回滚>
- 文档：<哪些需要同步>

## 可逆性

- 回滚成本：<高/中/低>
- 回滚步骤：<git command 或 PR 模板>

## 相关链接

- <前置 ADR>
- <后置 ADR>
- <设计文档>
- <本次决策的 PR / 审阅记录>
```

## 现有 ADR 索引

| 编号 | 标题 | 状态 | 关联 |
| --- | --- | --- | --- |
| 0001 | Web 客户端路线：保留 Vite SPA，React/TS 化并对齐 LobeHub 分层 | Accepted | 起步决策 |
| 0002 | LobeHub 对齐范围与完成状态（M1–M4）| Accepted | 0001 |
| 0003 | 结构与技术债分类治理规则 | Accepted | `docs/audits/2026-09-20-structural-review.md` |
| 0009 | CI workflow paths 触发规则整改 | Accepted | 0003 |
| 0010 | `server/src/services/` 子分组治理（设计层） | Accepted | 0003、F-014 |
| 0011 | `frontend/src/vendor-files/` 来源与文档对齐 | Accepted | 0003、F-011 |
| 0012 | `frontend/src/styles.css` 拆分（按 `styles/` 子目录模块化）| Accepted | 0003、F-002/F-010 |
| 0013 | `frontend/src/` 一级目录合并方案 | Accepted | 0003、F-009 |

> 0004–0008 为预留号段（留给在审/草稿中的 P1 决策），当前未分配。新 ADR 从 0014 起取号。

后续新增 ADR 须在本表追加一行。
