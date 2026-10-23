# 系统稳定性加固交接文档

日期：2026-10-23
基线提交：`2a0a9a10`（`fix(llm): publish model capabilities so the client stops promising what the model cannot do`）
目标读者：接手继续做稳定性 / 体验修复的 coding agent
覆盖范围：全仓系统级稳定性分析（5 条系统性机制）的前 4 轮修复，合计 4 笔提交

## 0. 一句话状态

模型能力从"按品牌名猜"改为"按模型声明"，能力声明已经贯通服务端 → API → 浏览器 → UI；上下文预算从全局常量改为按模型窗口推导。四轮修复全部带反向验证，全量门禁绿。**遗留集中在：迁移落地、token 估算口径、跨端 SSE 契约、部署/CI 硬化**四块。

## 1. 开工前先读

按顺序：

1. `AGENTS.md`：仓库边界、CSS 层级、lint ratchet、增量测试规则。**必须遵守**，本轮所有改动都在它的约束内。
2. `docs/audits/2026-10-23-provider-api-contracts.md`：MiniMax / DeepSeek 官方契约核对结论（含未核对项的明确标注）。
3. `docs/audits/2026-10-23-response-latency-and-errors.md`：同日事故审计，本轮多条修复的来源。
4. `server/src/lib/modelCapabilities.ts`：**本轮新增的核心资产**，见第 4 节。
5. 本文档。

## 2. 背景：这次分析的结论

全仓排查收敛出 5 条系统性机制（不是零散 bug）：

1. **能力靠推断** —— 请求体靠品牌正则猜模型能做什么。
2. **一次修复只覆盖一个面** —— 同一语义在 server / frontend / apps 各实现一遍，改一处不覆盖另一处。
3. **状态先于决策提交** —— 状态先落库/落状态，决策失败后无法回滚。
4. **重试与中止所有权分散三层** —— 前端重试、服务端 turn、调度器各自决定，叠加出孤儿 turn 与重复气泡。
5. **成本只在成功路径计量** —— 失败/重试消耗的 token 不进账。

本轮四轮修复主要打在 1、2、4 上（3、5 留待后续，见第 6 节）。

## 3. 已完成的四轮修复

### 3.1 第 1 轮 `a5c3b188` —— 服务端：身份隔离 / 快照降级 / 错误契约统一

19 files，+661/−102。起因是会话提示快照被跨 provider 复用。

- **provider 身份隔离**：`chatPolicy.ts` 新增 `insertProviderIdentity()` + `BEAGLE_IDENTITY_MARKER`（插在 `FINAL_OUTPUT_CONSTRAINTS_MARKER` 之前，保证输出约束仍是提示最后一段）；`minimaxProxy.ts` 把 beagle 身份移出快照 initializer，改为按请求注入；`helpers.ts` 只在 `provider.isBuiltIn` 时注入。**修的问题**：会话切到用户自己的 BYOK key 后，后续每一轮都把 "You are Beagle" 发给用户自己的上游。
- **快照降级**：`sessionPromptSnapshot.ts` 新增 `resolveSessionPromptOrAssemble()` + `createDegradableResolver()`。缺迁移或瞬时 DB 错误时退化为逐轮装配，而不是让每一轮聊天都失败。**归属校验错误不降级**（`ApiError` 直接抛出），否则等于允许用别人的 session id。
- **调度器过度 catch**：`scheduler.ts` 收窄 quarantine catch（`controller.signal.aborted` 时跳过），新增 `abortActiveScheduledRuns()`。
- **错误契约统一**：`errors.ts` 的 `ApiError` 增加第 5 个构造参数 `retryable`；新增 `lib/sseErrorFrame.ts` 的 `buildSseErrorFrame()`，4 个 SSE 写出点共用；`middleware/error.ts` 增加 `LlmProviderError` 分支。
- **部署半部署**：`deploy.sh` 新增 `current_app_index_target()` / `rollback_frontend()`；`dist.previous` 缺失从静默 no-op 改为硬失败。

### 3.2 第 2 轮 `3a717b28` —— 前端：孤儿 turn 与恢复所有权

6 files，+448/−32。

- **孤儿 turn**：`turnClient.ts` 新增 `abandonServerTurn()`，`stream.ts` 的重试分支调用它（`opts.turnId` 存在时跳过）。**修的问题**：一次重试会开新的 server turn，而旧的 turn 一直生成上游 token 直到 120s 回收 —— 一次用户动作 = 多次并发付费生成。
- **双恢复路径**：`pendingTurnRestore.ts` 增加 `fallback` 回调参数 + `runFallback()`；`turn_failed` 与订阅失败改 `replaceWithError`；`loader.impl.ts` 不再直接调 `restoreInterruptedResponse`，只把 `restorePartialFallback` 交给 `reattachPendingTurn`。**修的问题**：刷新时中断回退合成一个带 Retry 按钮的气泡，同时 pending re-attach 又开一个实时气泡重放同一段答案 —— 同一段文字渲染两次，且回退的 Retry 按钮会中止实时气泡。
- **失败被当成成功**：`chatTurns.ts` 抽出 `runExecutionHeartbeat(controller, touch)`，心跳失败只 warn 不 abort。

### 3.3 第 3 轮 `fb95ad74` —— 能力表取代品牌正则 + 上下文预算

15 files，+1315/−113。

**背景**：请求体靠 `/qwen|qwq/`、`/minimax|deepseek|glm|kimi/` 猜模型能力。逐条核对官方文档后发现这些猜测在多处是错的：

| 模型 | 原行为 | 实际后果 |
| --- | --- | --- |
| `kimi-k3` / `kimi-k2.7-code` | 发 `thinking:{type:'disabled'}` | 供应商直接 400 |
| `glm-5.3` | 发 `thinking:{type:'disabled'}` | 供应商明确报错 |
| 思考型 Qwen（`qwen3.8-2.4t-a95b` 等） | 发 `enable_thinking:false` | **被静默忽略 → 选了 Instant 仍在思考** |
| DeepSeek | 发 `reasoning_effort:'medium'` | 供应商映射成 `high`，app 的 Medium 不是 Medium |

改动：

- **新增 `server/src/lib/modelCapabilities.ts`**：声明式能力表，每条附核对它的官方文档 URL。已收录：MiniMax M3 / M3.1-Flash / M2、DeepSeek（v4 + 旧名）、Qwen3（含思考型）、QwQ、GLM 4/5/5.2/5.3、Kimi K2.6/K2.7/K3、OpenAI gpt-4o/4.1/5/5.1/5.2/5-mini、GPT-6 家族。
- **未登记模型 = 显式 UNKNOWN 状态**，不是再猜一次：Instant 只用 OpenAI 标准字段 `reasoning_effort:'none'`；不发明任何厂商字段；不给没声明 effort 的模型发 effort。关不掉思考的模型在**发请求前**本地 400（`MODEL_MODE_UNSUPPORTED`），不等供应商报错。
- **`llmProtocol.ts` / `llm.ts`** 全部改为能力表驱动，删除品牌正则。
- **上下文预算按模型窗口**（原为全局 100K 常量）：1M 窗口的模型原来在 100K 就被压缩（白花钱做摘要），小窗口的模型则被放行到供应商用 context-length 400 拒收（兼容链视为终态）。预算基准是模型的**最大输入**窗口（context window 是输入输出共享的，总窗口 ≠ 输入上限）。未公布窗口的模型保留原预算。
- **顺带修一个真 bug**：压缩的 tail-only 标记原用 `[Context notice …]`，而 `splitPromptContext` 只认 `[Conversation summary …]` / `[Context summary …]` —— 标记被当系统初始化块**跟着被删的头部一起丢掉**，模型看到的是一个"凭空从头开始"的对话，完全不知道前面有被丢弃的轮次。
- **前端删除两处品牌正则**：`config/providers.ts` 的 `isReasoningProvider()`（按模型名决定发不发 effort，导致 `deepseek-chat`/`kimi-k2.6` 等整族模型的 Low/Medium/High 被静默丢弃）与 `isMiniMaxProvider()`（浏览器注入 MiniMax 专有的 `extra_body.reasoning_split`）。浏览器改为只表达意图。

### 3.4 第 4 轮 `2a0a9a10` —— 能力送到客户端，UI 不再承诺做不到的事

23 files，+582/−38。

第 3 轮的知识停在 API 边界，浏览器继续自己猜，后果是硬报错：

- 用户在任何模型上都能选 **Instant**；选到"始终思考"的模型 → 下一轮直接 400，UI 无任何提示。
- **存储的偏好会活过它对应的模型**：在支持 Instant 的模型上存的 instant，切到不支持的模型后，之后每轮都失败。

改动：

- **服务端发布能力摘要**：`routes/apiKeys.ts` 的 provider 列表每行带 `capabilities`（`isReasoning` / `supportsInstant` / `supportsEffort`），并随列表下发 `builtInCapabilities`（内置 provider 是系统行、不在调用者列表里）。内置模型名依然不暴露 —— 摘要只是布尔值，和它取代的粗粒度提示同级。`BEAGLE_IS_REASONING` 保留为运维方"上游根本不是推理模型"的开关，优先级高于能力表。
- **契约附加式**：`packages/contracts/src/index.ts` 加可选 `ProviderCapabilities`；`docs/api/openapi.yaml` 同步描述并重新生成 `site/openapi.json`。Universal App 与 Android 客户端零改动仍可用。
- **浏览器两处使用**：
  - 请求：模型做不到的 Instant 不再上网线 —— 降成 app 里最接近的档位（low），模型连档位都没有时干脆不发 effort 参数。**摘要缺失 = 什么都没听说过**，行为与之前完全一致。
  - 选择器：Instant 按钮禁用并说明原因，滑杆同步去掉该档位。**存储的偏好不动**，切回支持 Instant 的模型自动恢复。
- **清掉死信号**：SPA 里已无人读取的 `window.BEAGLE_IS_REASONING` 移除。

## 4. 本轮引入的核心架构：per-model 能力表

位置：`server/src/lib/modelCapabilities.ts`（服务端唯一权威），前端通过 API 拿到摘要。

### 4.1 设计原则（改这个文件前必读）

1. **能力属于模型，不属于品牌子串，也不属于端点主机名。**
2. **只收录已核对的家族**，每条附官方文档 URL。**未核对的一律不写** —— 一条未核对的登记会静默改变模型行为，正是这个文件要消灭的失败模式。
3. **未知是显式状态**（`UNKNOWN_CAPABILITY`），处理方式是"不发厂商字段"，不是再猜一次。
4. **模型 id 按最后一段路径匹配**（`Qwen/Qwen3-8B` 能命中，`my-deepseek-proxy` 不会）。

### 4.2 加一条的步骤

1. 查该模型族的官方文档，确认：能否关闭思考 / 关闭思考的确切编码 / effort 取值集合 / `max_tokens` vs `max_completion_tokens` / temperature 是否生效 / service_tier 是否接受 / 上下文窗口与最大输出。
2. 在 `MODEL_CAPABILITIES` 数组里加一条，**放在更宽泛的家族之前**（顺序即优先级：`minimax-m3.1-flash` 必须在 `minimax-m3` 之前，思考型 Qwen 必须在混合型 Qwen 之前）。
3. 补 `server/test/modelCapabilities.test.mjs` 的断言，并跑反向验证。

### 4.3 已知限制（有意保留，不是 bug）

- **Qwen 的端点判断是全表唯一的 host 启发式**：Model Studio 官方字段是顶层 `enable_thinking`，自建 vLLM 是 `chat_template_kwargs.enable_thinking`，模型名区分不了二者，中转商前面挂 DashScope 会判错。根治要靠 `api_keys` 上的 per-provider 能力列（仿现有 `is_multimodal`），涉及迁移 + API + UI，本轮刻意没做。
- **`deepseek-chat` / `deepseek-reasoner` 等旧名没有登记窗口**：供应商已把它们从模型列表撤下，没有公布窗口，登记一个数字等于编造。走 fallback 预算。

## 5. 当前验证基线

全部为 2026-10-23 在 `2a0a9a10` 上的实测值：

| 门禁 | 命令 | 结果 |
| --- | --- | --- |
| server 类型 | `cd server && npm run typecheck` | ✓ |
| server 单测 | `cd server && DATABASE_URL=<…>/socrates_test SOCRATES_ALLOW_DEV_SECRET=1 node --import tsx --test test/*.test.js test/*.test.mjs` | 1075 tests / **1074 pass / 0 fail / 1 skipped** |
| frontend 单测 | `cd frontend && npm run test:unit` | **1061 / 1061** |
| frontend lint（18 项守卫） | `cd frontend && npm run lint` | ✓ 0 error |
| frontend 构建 | `cd frontend && npm run build` | ✓ |
| Playwright（聚焦） | `npx playwright test --config=playwright.config.mjs e2e/instant-mode.spec.mjs e2e/turn-activity.spec.mjs --workers=1` | **11 / 11** |
| OpenAPI drift | `node scripts/check-openapi-drift.mjs` | 240 routes / 240 spec entries，**0 drift** |
| site schema | `npm run openapi:check` + `npm run test:openapi` | ✓ |

新增测试文件：

- `server/test/modelCapabilities.test.mjs` —— 能力表解析、Instant 编码、effort 映射、上下文预算、能力摘要。
- `server/test/chatContextBudgetDb.test.mjs` —— 预算**接线**的 DB 级回归（大窗口模型不被压缩 / 无窗口模型仍压缩）。
- `frontend/test/effectiveEffort.test.mjs` —— 有效 effort 解析（摘要缺失 = 不改变行为）。
- 既有：`server/test/chatSseErrorContract.test.mjs`、`server/test/chatTurnHeartbeat.test.mjs`、`frontend/test/pendingTurnRecovery.test.mjs`、`frontend/test/aiRetryFlow.test.mjs`。

### 5.1 反向验证纪律（每轮修复都必须做）

回退改动 → 确认对应测试**失败** → 恢复 → grep 确认恢复生效。本项目历史上出现过"回退后文件没恢复导致假绿"，所以恢复后一定要 grep。

已执行的三轮反向验证：

| 回退对象 | 预期失败的测试 |
| --- | --- |
| `llm.ts` + `llmProtocol.ts`（回到品牌正则） | `modelCapabilities` + `llmProtocol` 共 6 个 |
| `helpers.ts`（回到全局 100K 预算） | `chatContextBudgetDb`（对照组仍过，证明用例有针对性） |
| 前端三个文件（回到浏览器端品牌正则） | `providerConfig` 2 个 |
| `routes/apiKeys.ts`（不再发布能力） | `accountPreferencesRoutes` 1 个 |
| `requestBody.ts`（忽略已发布能力） | `providerConfig` 1 个 |
| `ChatConfigurationPanels.tsx` + `ChatConfiguration.tsx` | e2e `instant-mode` 1 个（同批另 2 个仍过） |

## 6. 遗留清单（按建议优先级）

### P0

- **中文场景的 token 估算严重偏低**（第 3 轮发现，未修）。`services/core/usageTracker.ts` 的 `estimateTokens` 是 `length / 4`，对中文低估约 3–4 倍（中文约 1 字 ≈ 1 token，英文约 4 字符 ≈ 1 token）。后果：①窗口预算对中文会话仍然偏乐观，长对话会被供应商用 context-length 400 拒掉（兼容链视为终态，硬失败）；②用量估算与配额口径偏低。**注意**：改它会同时改动用量展示与配额判定口径，影响面比看上去大，建议单独一轮，先决定"预算用保守估算、计费用 provider 上报"是否要拆成两个估算器。
- **生产库缺失 `scheduled_tasks` 的两个外键，根因未确诊**。已排除"仓库漂移"：`server/drizzle/0018_add_status_monitor_events.sql:21-22` 早已声明这两个 FK，而同文件 `:5` 的 `CREATE TABLE "scheduled_tasks"` 没有 `IF NOT EXISTS` 保护（同文件的 `status_monitor_events` 有 `DO` 守卫）—— 若线上表是带外创建的，0018 在第 1 条语句就失败，`ADD CONSTRAINT` 从未执行。**需要你查生产库**（见第 7 节）。
- **0045 生产迁移 / 正式部署未执行**。`server/drizzle/0045_repair_scheduled_task_integrity.sql` 就是外键修复迁移：先归档无 owner 任务与 lease、归档并置空悬空 session 引用，再恢复已验证的 user CASCADE / session SET NULL 外键（归档表在受限 `ops` schema）。`docs/audits/2026-10-23-provider-api-contracts.md:75` 明确写着"尚未执行：生产 0045 迁移、正式代码部署、服务重启、供应商额度调整"，第 95–98 行是发布步骤（低峰窗口走单写者 `deploy.sh`、用正常 Drizzle migrator 让账本与 `_journal` 一致、不要手工执行 SQL 后伪造账本）。本轮的服务端改动（能力表、契约）**不需要**新迁移，但 0045 仍待落地。

### P1

- **无空闲看门狗**：长会话空转没有兜底。
- **错误文案未 i18n**：服务端错误文案硬编码英文，中文界面会混排。
- **部署 / CI 批**：`SESSION_SECRET` 启动期 fail-fast（P1-14）、`site/` 无 CI（P1-17）、体积预算不执行（P1-18）、GitHub Action 未固定 SHA（P1-19）。
- **三端 SSE 契约统一**：Universal App 把所有失败硬编码成 502（属迁移阻塞项而非线上故障）。
- **Qwen 的 host 启发式**：需要 `api_keys` per-provider 能力列（迁移 + API + UI）。
- **P1-12（声明 1 次重试 vs 实际 6 次）**：刻意没在 P0-5 里一起改，会改变重试预算语义，属独立决策。

### P2

- **P1-11（陈旧 pending 指针）**：修好 P1-10 后已自愈（下次加载走 failed 分支 → 清指针 → 交给 partial fallback），穿线改动收益不抵风险。
- **能力表补全**：未核对的家族（如更多 Qwen/GLM 变体、Claude-via-gateway 的推理语义）仍按 UNKNOWN 处理。

## 7. 需要你（运维 / 用户）动手的事

1. **查生产库的迁移记录**（只读）：

   ```bash
   psql "$PROD_DATABASE_URL" -c "select count(*) from drizzle.__drizzle_migrations;"
   ```

   测试库是 **47 条**且与 `server/drizzle/meta/_journal.json` 完全一致（含 `0018`）。**生产若少于 47 条**，就证实了"0018 第一条语句失败、两个 FK 从未 ADD"，`scheduled_tasks` 的外键缺失根因即告破。生产库我全程没有连接（按约定只读勘查阶段不碰生产）。
2. **根目录 `node_modules` 缺 `yaml`**（根 package.json 的 devDependency，本次未安装）。导致 `npm run openapi:generate` / `openapi:check` 直接失败。临时解法：`ln -sfn ../server/node_modules/yaml node_modules/yaml`（未进版本控制）；正解：在根目录 `npm install`。
3. **生产迁移 0045 与部署流程**按上面的审计文档执行。

## 8. 必须遵守的工程约束（与本轮相关的部分）

完整清单见 `AGENTS.md`，这里只列本轮新增/踩到的：

- **每轮修复必须有反向验证**（第 5.1 节），恢复后必须 grep 确认。
- **能力表只能写已核对的家族**；新增条目必须附官方文档 URL。未核对 = 不写。
- **未知模型 = 显式 UNKNOWN**，处理方式是"不发厂商字段"，不是再猜一次。
- **契约改动一律附加式**（可选字段 + 缺省即"未知"），保证 `packages/` / `apps/socrates` / `apps/socrates-android` 三端不破。
- **`packages/` 必须 DOM-free**（`scripts/check-packages-dom.mjs`）；能力摘要类型放这里，纯数据。
- **CSP hash 要同步**（`scripts/gen-csp-hashes.mjs`），改 `index.html` 内联脚本必须重生成。
- **lint 的 18 项守卫全过才算过门禁**；新增守卫必须同时加进 `lint` 与 `lint:<name>`，baseline 只能缩小。
- **不要提交生成物**：`site/openapi.json` 是 `openapi:generate` 的产物，但仓库里已跟踪，需要跟着 `docs/api/openapi.yaml` 一起提交。

## 9. 交接检查清单

接手新任务前：

- [ ] 读 `AGENTS.md` + 本文档第 1 节列的审计文档
- [ ] 确认 `git status` 干净、`HEAD == 2a0a9a10`（若不是，先看 `git log --oneline -6`）
- [ ] 按第 5 节跑一遍门禁基线，确认环境可用（DB 套件需要 `DATABASE_URL` 指向 `socrates_test` + `SOCRATES_ALLOW_DEV_SECRET=1`；生产库 `socrates` **禁止写入**）
- [ ] 从第 6 节挑一条，遵守第 4.2 节的"加一条能力表条目"的步骤
- [ ] 提交格式：`type(scope): subject` + 正文说明"为什么"（参考 `2a0a9a10`、`fb95ad74`）
