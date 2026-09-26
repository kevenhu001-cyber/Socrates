# ADR 0014 — 移除 open-connector vendored fork，连接器集成收敛为 cloud-only

- 状态：Accepted
- 日期：2026-09-26
- 决策者：项目所有者 + AI 协作会话
- 关联：`docs/adr/0003-structural-debt-categories.md`、`docs/audits/2026-09-20-structural-review.md` (F-003)、`docs/adr/0010-services-subgroup-rename.md`（PR-0010.5 因本 ADR 作废）

## 背景

`open-connector/` 是 `oomol-lab/OpenConnector` 的 Apache-2.0 vendored fork，作为独立 sidecar 进程（默认 `127.0.0.1:3101`）为 Socrates 提供 provider 元数据、凭据存储与动作执行。F-003 记录了它的集成拓扑与文档漂移问题。

2026-09-26 的事实核查确认两点：

1. OOMOL 提供**托管收费 runtime**（免费额度内每月约 2 万次调用），Socrates 已通过 npm 包 `@oomol-lab/connector`（`ProjectConnector` SDK）+ `OOMOL_PROJECT_API_KEY` 走云端网关完成 legacy 连接器（github/gmail 等）的 connect / poll / execute 闭环。
2. 部署环境（`server/.env*`）**从未配置** `OC_SIDECAR_URL` / `OC_SIDECAR_ADMIN_TOKEN` / `OC_SIDECAR_RUNTIME_TOKEN`——sidecar 路径在生产中从未启用，`oc_*` 聊天工具执行实际会失败。自托管这棵 fork 树没有承担任何真实流量，反而带来体积、审计面与 `existsSync(providers/)` 测试耦合（F-003）。

## 备选方案

### A. 保留 fork，仅补文档
- 优：零代码风险。
- 劣：继续为一条从未启用的执行路径维护 ~1 万行 vendored 代码 + codegen 脚本 + CI 耦合；与托管 runtime 功能完全重叠。
- **不采纳**原因：sidecar 无真实使用，维护成本无对应收益。

### B. 只删目录，保留 server 侧 sidecar 代码
- 优：改动最小。
- 劣：`openConnectorSidecar.ts` 与 `projectConnectors.ts` 的 sidecar 分支变成指向不存在目录的死代码；`openConnectorCatalog.ts` 的 fallback 构建器失去存在意义；测试里 `existsSync(providers/)` 断言仍会悬空报错。
- **不采纳**原因：留下半截死拓扑，比不删更糟。

### C. 彻底 cloud-only（采用本 ADR）
- 行动：删除 `open-connector/` 整棵树 + `scripts/gen-oc-cloud-auth.mjs`；删除 `server/src/services/openConnectorSidecar.ts`；`oc_*` 工具的 connect / poll / execute 全部改走 `@oomol-lab/connector` 网关（与 legacy 连接器同一 `connectViaGateway` / `project.execute` 路径）；catalog 收敛为「云快照 + stub」两态；前端删除已失效的 bring-your-own OAuth 对话框。
- 优：连接器集成只剩一条执行路径；`oc_*` 工具从「配置了也跑不通」变为真正可用。
- 劣：放弃本地自托管能力（如未来 OOMOL 停止托管，需重新引入 sidecar）；`openConnectorCloudAuth.generated.ts` 失去生成器，转为手工维护的冻结快照。
- **采纳**原因：项目所有者明确选择「彻底 cloud-only」。

## 决策

采用 **C**。落地内容：

1. **删除**：`open-connector/`（git rm）、`scripts/gen-oc-cloud-auth.mjs`、`server/src/services/openConnectorSidecar.ts`。
2. **执行路径**：`executeOpenConnectorTool` 改走 `getProjectConnector().execute(externalUserId, actionId, input, { connectionName, connectedAccountId })`，未配置网关时 fail-closed 返回 `project_connector_not_configured`。
3. **catalog**：删除 `buildOpenConnectorCatalogItems` / `buildOpenConnectorCatalogWithFallback`；新增 `buildOpenConnectorStubCatalog`（无网关时全量 stub），有网关时走 `buildOpenConnectorCatalogForCloud`（基于冻结快照 `OPEN_CONNECTOR_CLOUD_AUTH`）。
4. **路由**：`projectConnectors.ts` 的 list / connect / poll / disconnect / oauth-config 全部去 sidecar 分支；`PUT oauth-config` 保留为对旧客户端返回 400 `cloud_managed`。
5. **快照文件**：`openConnectorCloudAuth.generated.ts` 原地保留，头注释标注为手工维护的冻结快照（provider 认证元数据变更时直接改此文件）。
6. **前端**：`nav.js` 删除 BYO OAuth 对话框（`prepareOpenConnectorOAuth` / `openOAuthAppDialog`），`openConnectorAvailable` 兼容读取 `cloud` 标志；`WorkspacePage.tsx` 注释同步。
7. **API 契约**：`GET /api/project-connectors` 响应结构不变（`openConnector: { available, cloud }`、per-item `available`），mobile 无需改动。

## 影响

- 代码：`server/src/{services,routes}` 6 文件、`server/test/openConnectorCatalog.test.js`（去 `existsSync` 耦合，19 用例全绿）、`frontend/src/{sidebar/nav.js,react/pages/workspace/WorkspacePage.tsx}`、`frontend/e2e/plugin-directory.spec.mjs`（仅措辞）。
- 数据：无 schema 变更；`projectConnectorConnections` 行格式不变。
- 部署：不再需要 sidecar 进程 / `OC_SIDECAR_*` 环境变量；唯一依赖是 `OOMOL_PROJECT_API_KEY`。回滚一次连接器故障即可，无需服务编排变更。
- 文档：`AGENTS.md`（open-connector 条目改为已移除）、`scripts/README.md`（删 `gen-oc-cloud-auth.mjs` 行）、`docs/adr/0010`（PR-0010.5 作废标注）、本 ADR 入索引。

## 可逆性

- 回滚成本：中。代码与测试可 `git revert` 恢复；但 `open-connector/` 树需从 `oomol-lab/OpenConnector` 上游重新 clone 并按快照文件对版本。
- 回滚步骤：`git revert <本 PR>`；如恢复自托管，还需重新提供 sidecar 部署与 `OC_SIDECAR_*` 配置。
- 边界保护：`OPEN_CONNECTOR_CHAT_TOOLS` allow-list、参数校验（如 Jimeng prompt ≤800 字符）、fail-closed 语义均保留，回滚或换 provider 不影响工具面契约。

## 相关链接

- `docs/audits/2026-09-20-structural-review.md` F-003（集成拓扑失配）
- `docs/adr/0003-structural-debt-categories.md`（治理规则）
- `docs/adr/0010-services-subgroup-rename.md`（PR-0010.5 `services/integrations/openConnector/` 迁移因本 ADR 作废）
- [OOMOL OpenConnector 上游](https://github.com/oomol-lab/OpenConnector)
