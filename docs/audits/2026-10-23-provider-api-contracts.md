# 供应商接口契约核对与慢请求修复（2026-10-23）

代码基线：`5eb50095`。关联排查：[响应延迟与错误报告](2026-10-23-response-latency-and-errors.md)。本报告记录**代码修复和隔离测试**，不等同于正式发布或生产迁移。

## 一、官方资料与结论

以下资料于 2026-10-23 通过官方站点核对；未向模型发送付费验证请求。

| 官方资料 | 核对结果与实现 |
|---|---|
| [MiniMax OpenAI-compatible API](https://platform.minimax.io/docs/api-reference/text-chat-openai.md) | Bearer 鉴权与 JSON Content-Type 原实现已有，**没有证据表明缺少特殊请求头导致 429**。M3.1 Flash 为 adaptive thinking，不能用 `thinking.type=disabled`/Instant；支持 `reasoning_effort`，默认 max；不支持 `service_tier`。M3 系列使用 `max_completion_tokens`，temperature 无效。 |
| [MiniMax rate limits](https://platform.minimax.io/docs/guides/rate-limits.md) | 限制涉及账户/模型 RPM、TPM 等；增加客户端请求头不能绕过额度，仍需供应商侧调用统计核定实际瓶颈。 |
| [MiniMax M3 function calling](https://platform.minimax.io/docs/guides/text-m3-function-call.md) | 工具续接需保留完整 reasoning 和 assistant/tool 结构。回传真实 `reasoning_content`，不凭空合成重复的 `reasoning_details`。 |
| [MiniMax prompt caching](https://platform.minimax.io/docs/api-reference/text-prompt-caching.md) | 缓存依赖相同请求前缀，不是加某个任意请求头就生效。应保留稳定的历史和工具调用；不能承诺所有请求命中缓存。 |
| [MiniMax error codes](https://platform.minimax.io/docs/api-reference/errorcode.md) | `base_resp` 可表达业务错误：1002/1039 等限流，1004 鉴权错误，1008 余额不足，2013 参数错误。不能只看 HTTP 200 就当成功。 |
| [DeepSeek rate limit](https://api-docs.deepseek.com/quick_start/rate_limit) | 官方说明与项目使用的中转网关策略并不必然相同。不能用直连文档推断某个共享 Key/代理不存在 RPM、TPM 限制。 |
| [DeepSeek thinking mode](https://api-docs.deepseek.com/guides/thinking_mode) | 工具调用时应原样延续 reasoning_content；不能随意删除或重构 assistant/tool 历史。 |
| [DeepSeek context caching](https://api-docs.deepseek.com/guides/kv_cache) | 自动缓存以重复前缀为基础；稳定用户身份用于隔离/调度，不代表增加账户额度。 |
| [DeepSeek chat completion](https://api-docs.deepseek.com/api/create-chat-completion) | 仅在官方 `api.deepseek.com` 端点发送服务端生成的稳定匿名 `user_id`；不向不兼容的中转站盲目附加该字段。 |

### 请求头的边界

统一增加 `Accept`、`Accept-Encoding: identity`、`User-Agent` 和随机 `X-Request-Id`，保留原鉴权/Content-Type。它们用于协议协商、避免 SSE 被压缩缓冲和辅助定位，**不是已证实的限流根因或额度提升措施**。每次尝试的 Request ID 不同；不记录 API Key 或请求正文。

### 模型能力而非品牌猜测

`server/src/services/core/llmProtocol.ts` 对 `MiniMax-M3.1-Flash`（含后缀）采用模型级适配：

- 强制 adaptive；未显式指定 effort 时使用应用的 medium，避免后台小任务意外使用供应商默认 max。
- 使用 `max_completion_tokens`，移除无效 temperature 和不支持的 priority。
- 用户显式选择 Instant 时，在本地返回 `400 MODEL_MODE_UNSUPPORTED`，不发上游请求。错误提示选择 Low/Medium/High 或切换支持 Instant 的模型。
- **不把 Instant 偷换成会思考的模式**；前端目前仍可选择 Instant，服务端是最终能力校验点。

## 二、已实现的修复

### 1. 阻断孤儿任务和付费重复执行

- claim 前验证任务 owner；不存在时暂停任务，不获取公共 Key、不调用模型。
- 执行阶段再次检查 owner，覆盖 claim 后用户删除的竞争窗口。
- 模型已执行但结果落库失败时，用原 lease owner token 隔离并暂停该任务，避免 lease 过期后无限重复付费调用；不覆盖接管 worker 的状态。
- 全部持久化均失败（例如数据库完全不可用）时无法保证暂停落库成功；保留日志供人工处理，未声称实现外部调用的 exactly-once。

### 2. 统一错误与重试责任

- SSE/JSON 错误保留安全的 `status`、`code`、`retryable`；不向客户端暴露原始上游响应或私有模型名称。
- 服务端已耗尽重试预算的上游错误标记 `retryable: false`；前端不再自动整轮重放。
- `Retry-After` 支持秒数和 HTTP 日期；等待窗口超过进程内等待上限时，直接终止本轮，不提前重试。
- 余额/永久额度不足不重试；`rpm exhausted` 不误判为永久余额不足。
- 只有明确指出不支持字段的 400 才兼容降级；未知 400、上下文超限、缺失 reasoning 等直接失败。
- 按实际错误选择兼容 payload，不依次尝试全部猜测；已删除字段不会被后续降级重新加入。usage-only 降级保留工具；只有明确 tools unsupported 才允许工具兼容降级。
- 检查 HTTP 200 内的 error/base_resp，包括 SSE 最后一帧没有换行的情况；支持合法的 `data:{...}`（冒号后无空格）格式，不再误报空回答成功。

### 3. 上下文完整性与开销

- 保留供应商真实 `reasoning_content`，移除从同一文本合成的冗余 `reasoning_details`。
- token 估算包含历史 reasoning 和 tool_calls，避免明显低估长工具轮次。
- 历史压缩以 user 轮次边界保留上下文，不从 assistant/tool 组中间切开。
- 给官方 DeepSeek 请求附加由服务端用户 ID 派生的稳定 SHA-256 匿名标识；不用客户端可伪造的身份参数。
- **未重排全局安全/用户上下文 prompt，也未声称已解决所有缓存命中问题**。动态时间和动态工具附录仍可能影响公共前缀复用；此处优先保证 prompt 优先级及工具语义，不为缓存擅改安全策略。

### 4. 数据完整性、测试与首屏

- 新增迁移 `0045_repair_scheduled_task_integrity.sql`：先归档无 owner 任务及 lease；归档并置空悬空 session 引用；恢复已验证的 user CASCADE / session SET NULL 外键。归档表位于受限 `ops` schema。
- 部署 schema 门禁按**语义**检查外键和验证状态，不仅检查表存在或约束名称。
- npm 测试入口和 `initDb` 拒绝非 test/qa 命名的数据库；`TEST_DATABASE_URL` 优先于 `.env`。生产库没有不安全绕过开关。用法见 `server/README.md`。
- 移除首屏重复 `/api/auth/me` 预热；保留 auth boot 的 `/api/v2/auth/me` 检查及其并行时序。
- 未将字体/CSS 体积、地区网络延迟等后续优化冒充为本次已完成修复。

## 三、生产操作范围

本轮已在事务及短锁超时保护下，**备份并暂停 4 条已确认 owner 不存在的 active/pending 任务**，设置 `next_run_at=NULL`，未清空任务表，未改变正常用户任务。

备份：`/home/ubuntu/.local/state/socrates/maintenance/20261023T141529/paused-orphan-tasks.jsonl`（4 行，受限文件权限）。暂停后及本轮结束前的只读查询均确认仍 active/pending 的无主任务数为 0；137 条历史孤儿记录仍保留，等待正式迁移归档处理。

**尚未执行：生产 0045 迁移、正式代码部署、服务重启、供应商额度调整。** 隔离测试中的迁移成功不是生产已经修复外键的证明。

## 四、验证

- 前后端 lint/typecheck 通过；前端 production build 通过。
- 后端编译输出到 `/tmp/socrates-fix-backend-build` 验证，避免覆盖服务正在使用的 `server/dist`。
- 后端 DB-free 定向测试：220 项通过，涵盖 LLM、协议、stream lifecycle、压缩、usage accounting、schema、chat helpers、SSE。
- 前端定向单元测试：36 项通过，覆盖 retry/api client、auth boot、provider config。
- Playwright：22 项通过，覆盖 chat send、stop/resend、performance-loading，包含匿名首屏只查一次 session。
- 独立临时测试库只复制 schema、不复制生产业务数据；scheduler lease、task routes、迁移回归共 17 项通过。全部验证后确认无客户端连接并删除该临时库。
- 迁移测试使用隔离 schema + rollback：验证归档 lease、两次执行、外键验证、session SET NULL 和 owner CASCADE。
- 在未修复测试 schema 上，部署门禁正确失败；迁移后通过。
- 默认 npm test 读取生产 `.env` 时，在运行测试组前即被安全防护拒绝。
- 未调用真实付费模型，故仍需发布后通过真实流量观察 429、首 token 时延、缓存 usage，以及供应商后台 RPM/TPM 数据。

日志位于本机 `/tmp/socrates-fix-{server-final,front-final,db-final,e2e,lint}.log`，不是需要提交的仓库工件。

## 五、正式发布、迁移与回滚建议

1. 先备份 `scheduled_tasks`、`scheduled_task_leases`、迁移账本及相关外键定义；保留本轮 4 行备份。核对归档表访问权限。
2. 在低峰/维护窗口按现有单写者 `deploy.sh` 流程发布；不要手工覆盖 live dist。发布前再检查迁移 0045 已包含在候选中。
3. 使用正常 Drizzle migrator 执行 0045，使 `_journal` 与数据库账本一致；不要手动执行 SQL 后再伪造账本。
4. 验证部署 schema 门禁、health、无主 active/pending 数量、调度错误日志和正常任务列表。用真实交互核查 M3.1 Low/Medium、Instant 的明确失败提示及 SSE 非重试错误。
5. 代码回滚沿用部署脚本的 `dist.previous`/后端恢复机制。0045 是数据修复加约束，旧代码可在修复后的 schema 上运行，通常无需回滚数据完整性修复。
6. 不要为了回滚重新启用无主任务，或批量将归档数据插回运行表。必须恢复取证数据时，先停调度，在隔离 schema 恢复归档和 lease，再核实 owner/session 后进行人工选择性恢复。
7. 迁移在事务中失败会整体回滚；成功后若强制撤销约束，必须先停调度并做备份，按实际语义定位约束。丢弃 `ops` 归档或重写迁移历史均不是正常回滚步骤。

仍需供应商侧账户/Key/模型调用统计，才能决定是否需要提高额度或增加 Key 级前后台预算、优先级与冷却。**本次没有把所有 429 都归因于孤儿任务，也没有用请求头“伪装修复”真实账户限额。**
