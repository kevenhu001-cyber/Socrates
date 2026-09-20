# ADR 0009 — CI workflow paths 触发规则整改

- 状态：Accepted
- 日期：2026-09-20
- 决策者：项目所有者 + AI 协作会话
- 关联：`docs/adr/0003-structural-debt-categories.md` (P1)、`docs/audits/2026-09-20-structural-review.md` (F-004)、`AGENTS.md`（CI 覆盖描述修订段）

## 背景

仓库有 9 个 GitHub Actions workflow，但路径触发规则不一致：

- `server-ci.yml`、`mobile-apk.yml`、`build-apk.yml`、`agent-tooling-ci.yml` 都已配置 `paths:` 限制 —— **触发是精准的**。
- `ci.yml`（前端 + 后端 + shared 的默认 merge gate）是 on-push-everything 类型 —— 任何改动都会触发 frontend / server 完整 build + Playwright smoke + WASM build。
- `build-capacitor-apk.yml` / `release-clients.yml` 等默认按需人工触发（`workflow_dispatch`），仅在 push 时按现有 `paths` 触发 —— 现状可接受。

具体成本：docs-only PR（如本次 P0 文档治理 PR、ADR 合入 PR）会触发 ci.yml 跑一次完整前端构建（约 5–10 分钟）+ Playwright setup（约 3 分钟）= 每次 docs 改动 8–13 分钟的 CI 时间浪费。本仓库最近的 ADR 治理频率较高，这种浪费成倍放大。

## 备选方案

### A. 给所有 workflow 加精确 paths 限制
- 优：CI 时间最少化。
- 劣：9 个 workflow 都要改，且其中部分 workflow 内部就跑 frontend / server tests —— 加了 paths 后容易漏掉跨子系统依赖（packages/ 同时被 mobile 与 frontend 消费）。
- **不采纳**原因：跨子系统依赖的全图不在本次审查范围内，盲目加 paths 会引入"漏触发导致测试盲区"风险。

### B. 只给 `ci.yml` 加 `paths-ignore:` 显式排除 4 类纯文档/配置改动（采用本 ADR）
- 优：单一文件变更；明确排除已知无 effect 的路径；影响最小、可逆性最高。
- 劣：仍以 push/PR 自动触发，未触发 docs-only CI 之后仍是零开销。
- **采纳**原因：把"不要为文档跑 10 分钟 build"这句约束具象到具体路径。

### C. 完全不动
- 优：变更最小。
- 劣：docs / README / .gitignore 改动浪费 CI 时间；现状与 `AGENTS.md` 之间的"哪些路径改触发哪条 CI"心智模型继续漂移。
- **不采纳**原因：与 P1-目标（低成本、可验证清理）冲突。

## 决策

采用 **B**。具体改动（仅 `.github/workflows/ci.yml`）：

在 `on.push` 与 `on.pull_request` 下加 `paths-ignore:` 段落，统一覆盖下列 8 个纯文档/配置路径：

| 路径 | 排除理由 |
| --- | --- |
| `docs/**` | 全部 docs/ 子目录（api/ spec 除外时见下） |
| `README.md`、`README.zh.md` | 仓库门面 |
| `AGENTS.md`、`CLAUDE.md` | 指引文档 |
| `.gitignore` | ignore 文件变更不需跑 build |
| `.hintrc` | Lint hint config |
| `.github/PULL_REQUEST_TEMPLATE.md` | PR 模板 |

**特别说明**：`docs/api/openapi.yaml` 理论上属于跨子系统契约，但本次评估决定：
1. 对 OpenAPI 变更的可执行验证（typegen / contract tests）尚未建立。
2. 把 `openapi.yaml` 单独从 `docs/**` 排除会让规则碎化；后续如需启动 contract test，再单独引入新 workflow 并精确 paths 触发 openapi.yaml。

## 影响

- **CI**：docs-only / README / .gitignore 类 PR 不再消耗 frontend / server / shared 三个 job 的时间（`ci.yml` 内无 Capacitor job；Capacitor 构建在 `build-capacitor-apk.yml`）。
- **覆盖**：所有代码改动仍会被 `ci.yml` 触发；不丢任何"该跑的测试"面。
- **AGENTS.md**：已修订 line 20 段（commit `be97018` 之前的状态恢复后的最新版），明确说明每条 workflow 的实际覆盖。
- **`docs/STRUCTURE.md`**：路径 + ADR 索引指向本文件。

### 已知约束：required checks 与路径跳过

GitHub 的语义是：被 `paths` / `paths-ignore` 跳过的 workflow **不会上报任何 check**，其关联 check 在 PR 上保持 "Pending"，不会被判为成功。因此：

- 如果 `main` 的 branch protection 把 `Frontend` / `Server` / `Shared packages & Rust protocol` 标记为 **required status checks**，纯文档 PR 会因 check 永远 Pending 而无法合并。
- GitHub 官方建议是"不要把可被跳过的 workflow 的 check 设为 required"。落地本 ADR 时的配套动作是二选一：
  1. 在 branch protection 中取消这三个 job 的 required 标记（接受 docs-only PR 无门禁）；或
  2. 增加一个同 job 名的 no-op mirror workflow（以相同路径的 `paths:` 正向触发），让 required check 始终有人上报。
- `ci.yml` 的 `paths-ignore` 注释内已写明同样警告；选择哪种缓解取决于仓库保护规则，未在本 PR 内决定。

## 可逆性

- 回滚成本：极低。删除 `paths-ignore:` 段恢复 on-everything 行为。
- 回滚步骤：
  ```bash
  git revert <本 PR>
  ```
- 关联：本 ADR 是 `docs/adr/0003-structural-debt-categories.md` 中 **P1.1** 的唯一条目；今后如需治理其他 workflow（例如对 `mobile-apk.yml` 的 `paths` 增加 `tools-rust/` 支持），各自开新 ADR 走相同的备选/决策/影响模板。

## 相关链接

- `docs/audits/2026-09-20-structural-review.md` 中 F-004（CI 实际覆盖与文档漂移）
- `docs/adr/0003-structural-debt-categories.md`（P 级定义）
- `docs/adr/README.md`（ADR 模板）

