# 前后端响应慢与频繁报错：现场排查

排查时间：2026-10-23 13:38–13:47 CST。代码基线：`5eb50095`。

## 范围与方法

检查当前生产 Vite SPA（`frontend/`）、Express 服务（`server/`）、systemd、Nginx、PostgreSQL、最近 24 小时日志、现有生产构建产物及公网匿名启动。不是 Universal App / Kotlin Android 的专项审计。

数据库检查全部使用只读事务；没有修改生产数据、配置或 Key，没有重启/部署，没有主动发送付费模型请求。没有使用用户登录态检查私人会话。运行了定向的无数据库单元测试及基于现有 dist 的加载回归；没有重新构建或运行全量测试。

## 总结

不是一个笼统的“前端慢”问题。证据支持下面这条故障链：

1. 数据库缺少定时任务的用户外键，留下孤儿任务。
2. 孤儿任务仍被调度，用户不存在时也会回退到公共模型 Key。
3. 模型工作完成后，因为用户不存在，结果写入 sessions 失败；任务仍可能被再次认领。
4. 这些无效后台调用与聊天共享模型额度，放大上游 RPM/TPM 限流。
5. 上游限流退避会增加约 30 秒等待；流式错误丢失结构化状态，又可能触发前端整轮自动重试。
6. 独立存在模型能力适配错误：Instant 被翻译成模型不支持的 disabled thinking，触发确定性的 400。

限流确实存在，孤儿任务确实使用公共 Key，但现有日志不能量化“多少限流完全由孤儿任务引起”。不能把供应商额度本身的问题全部归因于后台任务。

## P0：孤儿后台任务消耗公共模型额度

### 现场证据

- `scheduled_tasks` 共约 145 条，其中 **137 条没有对应 users 记录**。
- **4 条孤儿任务仍为 active**，标题均为 `lease test`，2 条 hourly、2 条 daily，创建于 2026-10-16。
- 最近 24 小时 systemd 日志有约 **967 条 scheduler 相关日志**。
- 同一窗口 PostgreSQL 日志中约 **940 次** sessions 用户外键错误：`sessions_user_id_users_id_fk`。
- 例如后台创建结果会话时，引用的 user_id 已不在 users 中；并非连接池耗尽或数据库不可用。

这些任务标题、周期与 `server/test/schedulerLease.test.js` 的 fixture 一致，高度符合测试残留；无法仅凭当前数据库证明当时执行的具体命令。

### 代码原因

- `server/src/db/schema/content.ts:213–218` 声明用户级联删除外键及 session 外键。
- 现场 `pg_constraint` 证明 `scheduled_tasks_user_id_users_id_fk` 和 `scheduled_tasks_session_id_sessions_id_fk` **都不存在**。不是简单的外键名称差异；该表实际只有 project、last_run 两个外键。
- `server/src/services/core/scheduler.ts:150` 调用 `getActiveApiKey(task.userId)`。
- `server/src/services/core/apiKey.ts` 在用户没有个人 Key 时会查公共 built-in Key，不会检查用户是否存在。
- `scheduler.ts:173–177` 仅在 owner 存在时添加上下文，owner 不存在也继续模型调用。
- `scheduler.ts:247` 的结果会话插入在模型调用之后，外键错误导致完成事务回滚。
- 未成功提交的 lease 后续可过期重取，重复外部模型工作。
- `server/scripts/run-tests.mjs:35–43` 默认加载当前 `.env`；没有拒绝指向生产数据库的保护。直接在生产 checkout 运行 `npm test` 存在污染真实库的风险。本次没有这样运行。

### 修复顺序

1. 先只隔离已确认的 active 孤儿任务，保留取证快照；避免直接清空所有任务。
2. 在 claim/执行前校验 owner，缺失时不得解析公共 Key 或请求模型。
3. 清理或归档孤儿记录后，通过新迁移恢复 users/session 外键。恢复前也检查悬空 session_id；不要只编辑已经登记的旧迁移。
4. 为任务结果落库失败建立有界重试和终止策略，避免永久循环。
5. 测试要求显式独立数据库；不能默认使用线上 `.env`。

数据库治理应单独审批、备份并验证；本次未执行。新外键回滚可删除新约束，但被清理的数据只能通过备份恢复，因此优先隔离/归档而非删除。

## P1：上游限流是长时间等待的直接来源

- 最近 24 小时日志有约 **326 条 `upstream 429` 重试记录**，这不是独立请求数。
- 错误包含 `rpm exhausted`、`inference exceeds tpm/rpm limit`。
- `server/src/services/core/llm.ts:195–229`：429 最多 5 次尝试，无 Retry-After 时退避约 2、4、8、16 秒，另加 jitter，即累计约 30–32 秒；供应商响应自身耗时另算。
- 日志示例，2026-10-23 11:31：请求到模型发起 **43ms**，首个正文 **34,392ms**。
- 其他有限样本首正文为约 1.33s、3.00s、7.81s、14.15s；其中一个样本在 1.49s 已收到 reasoning，正文到 14.15s 才开始。因此“无正文”等待既有退避，也有模型推理时间。

建议：先切断无效后台流量；按供应商 Key 做前台/后台并发预算、冷却窗口与优先级。区分短时 rate limit 和不可重试额度错误，遵守 Retry-After，向用户展示正在等待限流恢复，避免只显示通用等待动画。需要供应商侧实际 RPM/TPM 配额和调用统计才能确定是否还需扩容。

## P1：Instant 与 MiniMax 模型能力不匹配，产生确定性 400

- 最近 24 小时日志有 **5 次** MiniMax adaptive-thinking 不兼容错误；数据库相同窗口 failed turn 也有 5 条该类错误。
- 上游明确返回：`MiniMax-M3.1-Flash requires adaptive thinking; thinking.type="disabled" (including reasoning.effort=none) ...`。
- `frontend/src/chat/api/requestBody.ts:67–72`：Instant 发送 `reasoning_effort='none'`。
- `server/src/services/core/llm.ts:308–318`：通过模型名正则把整个 MiniMax 家族都翻译为 `thinking: { type: 'disabled' }`。
- 该模型不支持这个组合；不是网络问题。
- `llm.ts:615` 等处遇到任何 400 都尝试移除 tools/optional fields。这里不兼容的是 thinking，移除 tools 并不能修复，却增加请求次数。
- 本次检查时该 MiniMax 个人配置已非 active。以上是近期真实历史故障及仍在代码中的缺陷，不代表当前所有新请求都仍调用这个配置。

建议：使用模型级能力表，不用供应商品牌正则推断 thinking 能否关闭。不支持 Instant 时在选择/提交时明确告知并要求选择支持的模式或模型，不能悄悄改变用户语义。400 兼容回退应基于具体错误类型，并保留仍受支持的工具能力。

当前 `server/test/llm.test.js` 甚至断言所有测试中的 MiniMax Instant 都应 disabled；现有测试通过不说明真实模型支持它，需要加入 M3.1-Flash 能力契约用例。

## P1：SSE 错误没有 status，前端把确定性错误当瞬时错误重试

- `server/src/routes/chat/pipeline/sseEmitter.ts:79–89` 读取 upstream status，但最终只发送 `{error, message}`。
- `frontend/src/chat/streamFrameProcessor.ts:125–130` 依赖错误帧的 `status`。
- `frontend/src/chat/retryPolicy.ts:118–135`：结构化 400 不重试，但缺少 status、且没有命中特定文案规则时默认可重试。
- 使用实际 SseEmitter 和实际前端 retry policy 做内存复现，未调用任何上游：
  - 实际输出 `LLM request failed (upstream 400). Try again or switch model.` → **可重试**。
  - 同一消息加 `status:400` → **不可重试**。

因此一次确定性 400 可能经历服务端多个无效 compatibility POST，再等前端 5 秒整轮重放；429 也可能叠加两层重试。成功流式建连后 HTTP 状态已经是 200，Nginx 的 200 不能证明模型回答成功。

建议：错误帧保留安全的 `status`、`code`、`retryable`、必要的重试等待信息，不发送原始供应商响应或凭证；前后端只保留明确的一层重试责任。加入“真实 emitter → frame processor → retry policy”的联测，而不只分别测试手工构造的错误对象。

## P2：数据库部署门禁只检查表，不检查约束

`server/scripts/verify-deploy-schema.ts:19–47` 主要验证必需表是否存在，不验证 `scheduled_tasks` 的关键外键。因此迁移历史看似已经执行，线上约束缺失仍可放行。

对比最新 schema snapshot 时，多个表的 FK 名称不同，但逐一核对后 mistakes、session_chunks、tts_results 均存在语义等价外键；不能只凭名字误判它们缺失。本次确认的缺口是 scheduled_tasks 的 users/session 约束。

建议门禁验证关键列、约束语义、必要索引及 orphan 数量，避免“表存在就成功”。缺失约束的历史来源尚未确定。

## P2：前端启动与公网链路有次要负担

### 实测

单次 headless Chromium 冷启动样本，未做移动 CPU 限速：

| 指标 | 本机后端提供 SPA | 公网 SPA |
|---|---:|---:|
| 文档 TTFB | 90ms | 1,344ms |
| DOMContentLoaded | 439ms | 1,837ms |
| load | 461ms | 3,344ms |
| FCP | 668ms | 1,624ms |

本机 `/api/v2/hello`、`health`、`config` 单次请求约 1–3ms；本机 HTTPS Nginx health 约 34ms。公网同类简单 API 样本约 1.3s，经过本机代理的另一个样本约 2.0s。路径差异包含 TLS、路由、CDN/代理，不是 Express 处理时间。这些是当前服务器的观测，不能直接代表用户所在网络。

- 两个浏览器样本都没有 pageerror / 未捕获 JS 异常。
- 公网有 Cloudflare beacon 被现有 CSP 拦截；这是统计脚本噪音，不是聊天失败根因。不建议为它放宽 CSP。
- 观察到 `/api/v2/auth/me` 和预热 `/api/auth/me` 两次鉴权；匿名访问的 401 是预期结果，不等于服务故障。
- `frontend/src/util/api/auth.ts:49–54` 额外发起旧前缀预热请求；`performance-loading` 的“只检查一次”用例只统计 v2，未覆盖旧前缀的额外请求。
- 首屏有约 **21 个字体请求**（Inter 与多个 MiSans 字重/分片，合计约 0.6MB），且后台追加多份功能 CSS。
- `frontend/dist/.vite/entry-graph.json`：静态 JS gzip 336,588B、关联 CSS gzip 208,693B、HTML gzip 18,691B，共约 551KiB；不含字体和运行时请求。
- CSS 解压后约 818KB。现有预算虽然通过，但字体、总请求数及弱网用户的下载/解析开销未被静态包预算完整覆盖。

建议合并鉴权预热与实际启动探测；增加首屏实际总传输、字体数量和弱网性能预算；按页面加载功能 CSS、精简初始字体字重。公网链路需要用户地区的 HAR / timing，再与同 request-id 的后端指标对齐，不能凭当前单点样本更换 CDN。

## 其他观察

- 当前服务运行约 5 小时，systemd 本轮 NRestarts=0。
- CPU 采样绝大部分空闲，可用内存约 2.1GiB，磁盘约 70%；swap 有历史占用，但短时采样没有持续换页压力。没有证据把本轮慢响应归因于当前 CPU/内存耗尽。
- 数据库约 273MB，连接采样主要 idle，没有锁等待/连接池拥塞证据。
- 同一 24 小时窗口 chat_turns 更新记录为 completed 12、failed 6、queued 2。该库混有测试数据，且只覆盖持久化 turn，**不能直接当作真实用户失败率**。
- 存在长期 queued 记录；`chatTurns.ts:242` 的过期回收只处理 running。需要确认这些 queued 是否属于遗留测试/未提交执行；本次不将其认定为当前用户卡住的根因。
- 当天 Nginx app 日志无 5xx，上一天有 2 个文件路径相关 500，路径包含未替换的模板字面量。未在当前源码找到相同字面量，无法确认来自旧生成内容、测试还是客户端输入；不是大规模 API 崩溃的证据。

## 已运行验证

- `server`: `npm run typecheck` 通过。
- `server`: `env -u DATABASE_URL node --import tsx --test test/llm.test.js test/llmStreamLifecycle.test.js test/chatTiming.test.mjs`，**67/67 通过**，没有加载 dotenv、没有跑 DB 测试。
- `frontend`: `npm run typecheck` 通过。
- `frontend`: `npx tsx --tsconfig tsconfig.test.json --test test/apiClient.test.mjs test/retryPolicy.test.mjs test/aiRetryFlow.test.mjs`，**21/21 通过**。
- `frontend`: 两个现有构建加载 specs `performance-loading`、`performance-deferred-runtime`，**8/8 通过**。这些测试使用 mock API，不验证真实供应商能力和线上外键。
- 真实匿名浏览器启动、本机/公网 HTTP 计时、SSE 错误状态丢失内存复现。

## 建议执行顺序

1. **止血**：经确认后隔离 4 条 active 孤儿任务，保护公共模型额度。
2. **修正错误与重试**：SSE 结构化错误、模型级 thinking 能力、限制确定性 400 的兼容回退。
3. **数据库与测试隔离**：有备份地归档孤儿数据，新迁移恢复约束；增强 schema gate；阻止测试默认连接生产库。
4. **模型容量管理**：Key 级预算/优先级/冷却和可观测性，再根据供应商数据决定是否提高配额。
5. **前端与链路优化**：鉴权去重、字体与 CSS 按需加载、真实用户网络采样。

以上修复尚未实施，本次提交内容仅为排查报告。
