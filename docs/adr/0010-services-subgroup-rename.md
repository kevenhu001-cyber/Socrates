# ADR 0010 — `server/src/services/` 子分组治理（设计上，实施延后）

- 状态：Accepted (ADR 层面；PR-0010.1 已落地 2026-09-20)
- 日期：2026-09-20
- 决策者：项目所有者 + AI 协作会话
- 关联：`docs/adr/0003-structural-debt-categories.md` (P2.1)、`docs/audits/2026-09-20-structural-review.md` F-014

## 背景

`server/src/services/` 当前有 60+ 文件，跨越多个不同抽象层与变更频率级：核心 LLM proxy 与认证同一层、agent/tool 内部实现同一层、第三方 SaaS 集成（feishu / gitee / github / notion / arxiv / zotero / oomolProject）同一层、文档解析与 embedding 同一层。子目录只有 `fileParsers/`、`searchEngines/` 两个。

这种"扁平 + 60+ 文件"的形式有四个具体问题：

1. **修改风险等价**：改一行 LLM proxy 代码与改一个 feishu 鉴权逻辑的"看着像是同等风险"，实际触达的 review 面和 blast radius 完全不同 —— 第三方集成变更应当审得更认真，核心服务反而可以快速 iterate。
2. **Onboarding 路径无规律**：新人想"接入一个新的第三方 connector"，不知道应该建在 `services/` 下还是 `routes/chat/pipeline/executors/` 下。
3. **测试聚集不均**：`server/test/` 大量测试其中 70% 集中在 10 个核心服务文件，第三方 connector 几乎没有端到端测试。
4. **工具 reminder 模糊**：维护者看不到"哪一组文件属于基础设施"vs"哪一组属于平台业务"，难以制定合理的 service-level 监控/报警边界。

## 备选方案

### A. 维持扁平 + 改进 INDEX 文件（最小变更）
- 给 `services/` 加 README，把现有 60 文件按四类（核心、agent/tools、第三方集成、文档/embedding）标好分组。
- 优：改动最小；不引入 import 路径变更。
- 劣：分类靠注释/阅读，不能被 lint/IDE enforce；时间一长漂移。
- **不采纳**原因：与 P2-目标（建立可由 CI 验证的结构边界）冲突。

### B. 引入单一根分组 `services/{core,integrations,tools,embeddings}/`（采用本 ADR）
- 把现有 60 文件迁移到 4 个子目录，各自代表一类变更频率与责任范围。
- 优：清晰、可被 CI / IDE 验证；测试可按子目录聚合。
- 劣：import 路径变更（import `../services/llm` → `../services/core/llm`）会扩散到 `routes/`、`app.ts`、`*.test.js` 等多文件，需分多 PR。
- **采纳**原因：唯一同时具备"清晰边界 + 长期可持续 + 可分阶段" 的方案。

### C. 拆为微服务（彻底重写）
- 第三方 connector 单独拆 deploy unit。
- **不采纳**原因：超出本次审查范围；与"前端 + 后端 + mobile 一站式"项目哲学冲突；工作量大到无法被 P2 时间窗容纳。

## 决策

采用 **B**。目标分组（具体每个文件的归属在本 ADR 通过后由 PR 给出）：

| 子目录 | 范畴 | 典型文件（从现状外推） |
| --- | --- | --- |
| `services/core/` | 与 LLM proxy / 认证 / 业务流水线紧密耦合的核心服务 | `llm.ts`、`auth.ts`、`chatTurns.ts`、`planning.ts`、`scheduler.ts`、`usageTracker.ts`、`apiKey.ts`、`email.ts`、`adminAuth.ts`、`agentKeys.ts`、`loginLockout.ts` |
| `services/integrations/` | 第三方 SaaS / 项目平台 connector，每个一个文件 | `arxivConnector.ts`、`feishuConnector.ts`、`giteeConnector.ts`、`githubConnector.ts`、`notionConnector.ts`、`oomolProjectConnector.ts`、`zoteroConnector.ts`、`oauthTokens.ts` |
| `services/integrations/openConnector/` | open-connector 整个集成面（Apache-2.0 vendored fork 的 wrapper） | `openConnectorCatalog.ts`、`openConnectorChatTools.ts`、`openConnectorSidecar.ts`、`openConnectorAppInventory.ts`、`openConnectorCloudAuth.generated.ts` |
| `services/tools/` | agent / tool registry / tool-call-safety 周边 | `toolRegistry.ts`、`toolCallSafety.ts`、`toolDispatch.ts`、`toolErrorFeedback.ts`、`toolTurnPolicy.ts`、`agentRuntime.ts`、`agentStepProjection.ts`、`piAgent.ts`、`toolRegistry.ts` |
| `services/embeddings/` | 文本向量化、chunkIndex、RAG、tts 等模型边缘 | `embedding.ts`、`rag.ts`、`chunkIndex.ts`、`ttsCache.ts`、`ttsStore.ts`、`vision.ts`、`scoring.ts`、`sessionCompressor.ts`、`attachmentReader.ts`、`contentExtractor.ts`、`contentExtractorWorker.ts`（包含现有 `fileParsers/` 与 `searchEngines/` 子目录） |
| `services/util/` | 跨切面工具，不属于上述任意域 | `cleanupDb.ts`、`fetchBatch.ts`、`statusMonitor.ts`、`workspacePaths.ts`、`workspaceResources.ts`、`artifactOwnership.ts`、`fileArtifacts.ts`、`connectorTools.ts`、`projectConnectorTools.ts` |

> 注：`fileParsers/` 与 `searchEngines/` 子目录已存在，纳入 `embeddings/` 之下的 `parsers/` 与 `engines/` 子层（避免引用面扩展），保持向后兼容的 export。

## 影响

- **PR 切分**（每 PR ≤ 1 个子目录 + 自带测试迁移）：
  1. PR-0010.1：迁 `services/util/`（最小，10 文件左右）。**已部分落地 2026-09-20**：5/10 文件已迁（artifactOwnership / workspacePaths / workspaceResources / cleanupDb / fileArtifacts），余 fetchBatch / statusMonitor / connectorTools / projectConnectorTools 待后续 PR 补齐。
  2. PR-0010.2：迁 `services/core/`（影响 20+ 文件 + 多数 test 文件 + `routes/` import）。
  3. PR-0010.3：迁 `services/embeddings/`（含现有 `fileParsers/` 与 `searchEngines/`）。
  4. PR-0010.4：迁 `services/tools/`（agent / tool-call 周边）。
  5. PR-0010.5：迁 `services/integrations/openConnector/`（open-connector wrapper）。
  6. PR-0010.6：迁 `services/integrations/`（第三方 SaaS connectors）。
- **代码**：每次迁移涉及相对路径批量更新，IDE 全局重写 + grep 双保险；跨子目录的循环 import 风险由每个 PR 末的 ESLint `import/no-cycle` 验证。
- **CI**：`server-ci.yml` 与 `ci.yml:server` job 跑 `server/test/`；每 PR 跑回归。
- **数据**：无 schema 变更。
- **文档**：`docs/audits/2026-09-20-structural-review.md` F-014 状态变更为"PR-0010.x 已部分完成"。

## 可逆性

- 回滚成本：中。每个 PR 是 squash 单 commit；revert 单一子目录的迁移是局部可逆。
- 回滚步骤：`git revert <PR-sha>` 单一 squash commit + 删新建子目录。
- 边界保护：路由层 (`server/src/routes/`) 不参与本次重命名，避免外延扩散。

## 相关链接

- `docs/audits/2026-09-20-structural-review.md` F-014
- `docs/adr/0003-structural-debt-categories.md`（P2 治理规则）
- 后续 PR：CI 行为若需新增子目录触达，需要单独 ADR（不在本 ADR 范围）。
