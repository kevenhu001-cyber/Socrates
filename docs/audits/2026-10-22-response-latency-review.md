# 响应速度架构审阅（2026-10-22）

审阅基线：`ebb56e10`，工作区开始时无未提交变更。审阅阶段来自源码、配置和仓库既有测量报告，未执行生产请求、浏览器性能采样、构建或测试，未修改运行时代码；用户随后授权的第一批实施与验证单列在文末。下文发现中的配置值和执行顺序是审阅时的静态确认，实际收益、生产瓶颈排序与设备掉帧仍须测量。文中的时间预算是建议验收目标，不是已达到的结果。

## 架构与关键路径

- 当前 Web 产品以 `frontend/` Vite SPA 为基线，旧模块负责流程和平台操作，React 通过不可变状态及 runtime bridge 渲染聊天、工具、输入框和功能目录。
- `server/` Express 接收 `/api/v2`，内部重写为 `/api`；聊天依次经过认证、会话归属、持久 turn 认领、上下文准备、模型流式调用、工具循环和持久化。PostgreSQL/Drizzle 保存会话、消息、工具状态、检索块与使用量。
- `apps/socrates/` Universal App 使用 `packages/` 中的 Zustand、聊天协议和 React Native UI，富内容使用平台隔离层。它与 Web 基线共享服务端，但发送与流式显示调度不同。
- 独立 Kotlin Android 客户端使用 OkHttp SSE、Compose LazyColumn 和后台 Markwon 解析。它同样保留每轮保存会话的等待。
- 教学、测验、项目、附件、搜索、连接器、Python、可视化和网站生成会引入不同的准备与工具阶段，不能用一个普通文本样例代表全部体验。Python 已有常驻 worker 池；独立工具调用已有并行调度。

```text
点击发送 → 本地用户行/占位反馈
         → 首轮会话保存与附件准备 → URL 页面读取（有链接时）
         → POST chat/stream → 认证 → SSE prime（响应头和填充注释）
         → 会话归属与 turn 认领
         → 并行准备：provider / 记忆 / 助手指令 / RAG / 长上下文压缩
         → 工具配置就绪 → 上游模型 → 推理 / 正文 / 工具参数
         → 工具执行与后续模型调用（可能多轮）
         → 浏览器播放时钟 → runtime bridge → React / Markdown → 文字上屏
         → 播放排空 → 完成状态 / 队列下一轮
```

并行准备阶段由最慢的分支决定耗时。SSE prime 只是传输握手，不能当作模型首字。

## 已经存在、应保留的优化

1. `server/src/services/core/llm.ts:51`：undici dispatcher、连接复用、直连路径 DNS 缓存、TCP_NODELAY，以及上游初始请求重试。不能再笼统建议“加 keep-alive”。
2. `server/src/routes/chat/helpers.ts:903` 与 `pipeline/toolContext.ts:51`：provider、上下文块和连接器读取已有并行准备。
3. `pipeline/runChatStreamPipeline.ts:898`：工具调度已有安全并行；共享可变执行资源仍需串行。
4. `server/src/app.ts:328`：SSE 不压缩；`ops/nginx/app-performance.conf.example` 声明关闭代理缓冲。示例配置不能证明线上实际生效。
5. Web 消息列表初始挂载 12 行，常规滚动窗口上限 60 行；已有历史渲染缓存、详情预取、按需加载与流式 settled block 缓存。
6. `docs/audits/2026-10-22-history-restore-performance.md` 已记录移除历史恢复时全量 Markdown 渲染的效果：本地模拟 1,000 行 response-to-paint 代理指标从约 672 ms 降至 109 ms；4× CPU 下约 2,940 ms 降至 476 ms。这是既有报告，不能计作本轮成果或真实用户指标。
7. `docs/ref/frontend-performance.md` 记录首屏静态资源和按需加载的前两轮优化。首屏、首次功能冷加载、长会话与缓存命中要分别测量。

## 发现与优先级

### R1：平滑播放积压会延长回复与下一轮等待，优先级 P1

证据：`packages/core/src/streamPlayer.ts:78` 默认 `baseCps=140`、`maxCps=800`、`drainBoost=2.5`；`frontend/src/chat/streamingTurn.js:70` 默认启用；`frontend/src/chat/turn/finishLifecycle.ts:57` 在有未播放内容时先 `beginDrain()`，排空后才执行完成、保存、释放 Stop 与消费 prompt queue。

确定影响：上游返回速度持续超过显示上限时，前端必然产生可见延迟。结束时若还剩 10,000 个 UTF-16 code units，按默认最高排空速率 2,000/s，理想连续帧下也至少约需 5 秒；真实时间还受调度与末尾降速影响。这是条件推导，不是生产测量。这里的“字符”并不等于 token 或完整 Unicode 字形。

建议：用“可见文本落后到达文本的时间”约束播放，替代固定可读速度上限；大突发允许跨过积压，正常小流保留轻微渐显；正文首段立即发布。将传输完成、内容落盘和装饰动画的生命周期拆开，下一轮不能被装饰播放长期阻塞，同时保证上下文使用完整已到达正文。现有 `smoothStream` 开关可用于受控对比，不能把关闭平滑当成全部优化。

建议目标：到达至显示的 p95 积压小于 100–150 ms，DONE 至可交互完成不超过 150 ms；大突发以时间预算及时追平。

### R2：长上下文摘要在主回答之前同步等待，优先级 P1

证据：`server/src/routes/chat/helpers.ts:922` 默认超过约 100,000 个估算 token 后 `await compressSessionMessages()`；`server/src/services/embeddings/sessionCompressor.ts:218` 给摘要请求设置 45 秒 AbortSignal。摘要缓存最多 8 项、10 分钟，键为被摘要 head 的精确摘要值；会话继续增长后 head 改变，缓存通常不能复用此前的滚动摘要。

确定影响：达到阈值的长会话会在实际回答之前额外调用一次模型；最慢分支可以是摘要而不是回答模型。45 秒是摘要调用的超时配置，不包含前置 provider 查询和全部准备时间。

建议：维护基于消息边界、可失效的滚动摘要，将压缩提前到后台阈值；发送时优先读取已经完成的摘要与最近上下文。添加相同 head 的进行中请求合并。需要摘要但尚未就绪时，应明确选择质量与等待预算，不能无提示地删除旧上下文。将取消信号传播到摘要，避免用户停止后它仍耗资源。缓存/摘要应有用户与会话范围、版本和编辑失效规则。

兼容性：只改变模型输入，不删除持久消息；必须检查摘要输出到上游 `content` 的归一化契约，覆盖多模态、编辑旧消息、重试及长会话连续增长。

### R3：RAG 的慢向量分支可能让快速词法结果也丢失，优先级 P1

证据：`server/src/services/embeddings/chunkIndex.ts:223` 并行启动 BM25 与向量分支，但最终 `Promise.all` 等待两者；`server/src/routes/chat/helpers.ts:172` 对整个检索 race，默认 2 秒到期返回无注入，进行中的检索继续运行。

确定影响：即使 BM25 已及时完成，只要向量分支慢至外层 deadline，本轮仍可能放弃全部检索结果。超时不等于取消，后台请求与查询仍可能占用资源。索引为空已有快速返回，不能据此说每轮都必然损失 2 秒。

建议：分别给词法与向量分配预算，超时保留已完成的词法结果；向量增强在总预算内加入，过期取消。`searchSessionChunks()` 每轮读取全部会话 chunks 并在 Node 构建 BM25 索引，长会话应评估按版本缓存或数据库检索，先采样查询/CPU/命中率。避免把服务器端数据读取和检索结果注入的归属检查削弱。

### R4：客户端持久化往返仍位于发送和完成关键路径，优先级 P1/P2

证据：Web `frontend/src/chat/sessionBootstrap/chatStart.ts:73` 首轮等待保存与附件准备后才调用聊天；服务端 `server/src/routes/chat/stream.ts:166` 创建 turn 前必须确认已有会话归属，因此不能直接删除首轮保存 await。

Universal `packages/chat/src/turn.ts:95` 每轮先保存、再上传附件、再 stream；finally 里等末次保存后才 `finishTurn()`。Android `ChatViewModel.kt:350` 每轮先 `saveSession()`，结束时约 `:370` 再保存后才设置 `streaming=false`。

建议：首先区分新会话创建、已有会话增量保存和已在持久 turn 中保存的正文；已有会话可评估直接提交有幂等键的 turn，后台协调保存。末次保存与内容生成状态分离，保存失败保留可恢复状态。新会话若要省一跳，应由服务端在受权事务中创建会话并绑定 turn；这属于跨客户端 API 改造，需更新 OpenAPI/contracts、未知字段保留和重试恢复。

预期收益：特定路径减少一次或多次客户端到服务端往返；实际毫秒收益取决于 RTT、上传与保存耗时，不能静态给百分比。

### R5：用户消息里的链接在模型请求之前等待读取，优先级 P2

证据：`frontend/src/chat/turnController.js:172` 先 `await fetchPagesForContext()`；`frontend/src/chat/webLinks.ts:4` 普通聊天预算为 2,500 ms，最多三个 URL，已有并行读取与取消。

确定影响：带链接回合会在发出模型请求之前等待页面读取完成或到期；纯文本不受影响。把链接读取改成后台任务但让模型先回答页面内容会改变正确性。

建议：用户粘贴/确认链接时可在受控范围内预取并复用；上传、会话保存与链接读取尽量并行。明确需要阅读网页时保留依赖与进度；只是提及链接时可评估交由模型按需调用现有 web_fetch。预取应有取消、缓存范围和页面快照一致性策略。

### R6：流式正文每帧更新的成本仍与整个历史列表相关，优先级 P2

证据：`streamingTurn.js:409` 的播放器 onFrame 更新不可变消息，再发布 runtime 事件；`frontend/src/react/chatRuntime.bridge.ts` 对文本 commit 用 33/50 ms cadence（实际值在 `render/streaming.ts:16`）。`frontend/src/react/message-list/visibleMessages.ts:27` 在每个新 messages 数组上全量过滤和去重。`store/createDomainStore.ts:77` 对新数组遍历子项，虽然 WeakSet 会跳过已冻结子树。DOM 窗口化没有消除这些数组层面的工作。

建议：把网络缓冲、播放推进和状态发布合并到一次真正需要的 commit；保留消息结构共享，把可见消息的成员关系与单行正文内容分离。优先消除列表扫描和多次调度，再判断是否需要 normalized store。不得恢复为可变对象穿过 React 边界。

适用场景：长历史、快速输出、多个工具进度并发；是否显著掉帧需要 trace。已有 reconcileMessageSnapshots 对冻结数组是 O(1)，应保留，不能再声称它每帧深拷贝全历史。

### R7：平滑播放器的到达速率采样与播放活跃时间混用，优先级 P2

证据：`packages/core/src/streamPlayer.ts:203` 用 `nowMs-lastActiveMs` 判断是否达到默认 120 ms 采样窗，同时在采样不足时已经推进 `sampledTotal`；`:252` 每个仍有缓冲的 tick 又更新 `lastActiveMs`。

静态推导：连续播放、约 16 ms 一帧时，采样间隔经常达不到 120 ms，新增字符却已从下个样本中扣除；因此说明中承诺的到达速率 EMA 不能稳定覆盖该路径，实际可能主要依赖积压深度。

建议：到达速率使用独立 sampleStartedAt/sampleStartTotal，只有形成有效窗口才提交基准；饥饿检测与播放活跃时间分开。需要确定性时间序列检查持续小包、突发、停顿、后台恢复等情况，再决定整体播放策略。

### R8：输入框和侧栏仍有布局型动画，优先级 P2

证据：`frontend/src/react/composer-input/useAutoHeight.ts:125` 暂时解除高度锁以读 scrollHeight，并恢复高度；`:183` 用 rAF 每帧写 height。`frontend/src/styles/parity/sidebar.css:59` 动画 width，`:522` 动画主体 padding-left。令牌中一般反馈为 100/140 ms，overlay 160 ms；`ui/motion.js:47` 通用运动上限 520 ms。

判断：这些路径确实引入布局工作，但代码里已有 rAF 合并、尺寸限制与减少动画支持，不能仅凭存在 height 动画断定它是首要卡顿来源。统一把全部 duration 调小也不能修复主线程阻塞。

建议：输入框仅在行数/目标尺寸变化时测量和启动动画；普通按键避免重复解除锁和测量。测量内容节点、动画外层，合并几何读写。对侧栏评估静态最终布局加视觉过渡（例如 FLIP），同时验证文本重排、命中区域和无障碍；手机仍遵循独立参考布局。优先 trace 发送中打字、换行粘贴与侧栏切换。

### R9：长会话 API 仍全量返回消息，优先级 P2，架构收益较大

证据：`server/src/routes/sessions.ts:980` 读取消息正文、HTML、reasoning、附件、工具与 runtime，按时间排序，没有消息分页；Web loader 仍下载并规范化全量历史，再挂载小窗口。既有 4× CPU 历史报告仍有约 357 ms 最长任务，说明窗口化不是全部工作边界。

建议：新增可选 cursor/limit 和稳定复合游标，先返回最近窗口；旧 GET 形状保持兼容，再迁移各客户端。详情按需加载工具重载荷和推理全文。UI 可见历史、模型上下文和搜索/导出完整历史分别设计，不能把当前 UI 窗口误作全部模型输入。必须覆盖首条滚动定位、分支、删除、全文搜索、导出和断线恢复。

### R10：跨端流式调度仍值得统一性能契约，优先级 P2

Universal：`packages/chat/src/turn.ts:38` 只合并同一 microtask 的 text/reasoning；跨网络任务的小包仍可逐包复制消息数组并通知。`packages/ui/src/index.tsx:921` 有 FlatList 和 memo 行，是已有保护。建议按平台 frame/短时间窗限制发布，并保证 terminal 前强制 flush。共享 packages 必须 DOM-free，调度器由平台注入。

Android：`ChatViewModel.kt:347` 已按 32 ms 发布；`NativeMarkdown.kt:106` 后台准备文本分段，随后 `:121` 仅接受 source 完全匹配的结果，旧结果不匹配时取空列表，后续还存在一次 Markdown block 后台解析。高频文本更新存在中间空内容及任务反复取消的结构风险，尚未用设备 trace 证明。

建议：保留同一消息已完成段落的稳定树，仅在尾段应用新 revision；新正文替换旧正文/切会话时仍严格校验身份，避免旧结果串入新消息。移动端记录解析排队、取消次数、提交耗时和帧时间，再决定是否增加缓存。不要把 Web 的固定字符播放上限直接复制到其他客户端。

### R11：观测指标会低估用户实际首字等待，优先级 P1（先补齐）

证据：`server/src/routes/chat/pipeline/runChatStreamPipeline.ts:80` 在 prepare 完成、进入 pipeline 后才设置 ttfbStart；首个 content 或 reasoning 共用一次 ttfbReported，低于 250 ms 不记录。因此它遗漏认证、归属、turn 创建、RAG 与摘要，也无法区分“开始推理”和“用户看到正文”。`server/src/lib/telemetry.ts` 有可选 OTel 和请求总时长，但缺少这条完整端到端分段证据。

建议使用同一个 request/turn 关联标识，记录以下独立时点：

| 时点 | 用途 |
| --- | --- |
| 点击、用户行首帧 | 本地交互反馈 |
| 准备完成、请求发出 | 客户端保存/附件/URL 等待 |
| 服务端入口、认证结束、认领结束 | 路由与数据库等待 |
| 各上下文分支开始/结束/超时 | 准备阶段最慢分支 |
| 上游请求发出、响应头、首推理、首正文、每轮结束 | 连接、排队、推理与生成 |
| 客户端首正文接收、首正文 commit/下一帧、积压长度与年龄 | 传输和渲染等待 |
| 上游 DONE、客户端 DONE、可继续交互、持久化完成 | 完成尾延迟 |

客户端与服务端各用本地单调时间测时长，通过标识关联；不直接相减未同步的两台机器绝对时间。首帧代理指标要标明不等于真实呈现时间。正文、推理、SSE 注释与工具参数独立统计，不记录正文/密钥。分设备、区域、provider/model、上下文长度、缓存命中、附件、工具轮数统计 p50/p95。

### R12：上游兼容性与提示前缀可减少额外请求，但需要受控策略，优先级 P2/P3

证据：`server/src/services/core/llm.ts:285` 每轮构造兼容性 variants，400 后依次回退；快速偏好映射为 `service_tier: priority`，不是保证实际响应速度的本地加速器。每次模型调用都可能重新走不兼容路径。`pipeline/runChatStreamPipeline.ts:532` 每轮拼接工具合同、示例、路由提示与 code-interpreter 指令。

建议：按用户/provider/base URL/model/配置版本记录经过验证的可选字段能力，短 TTL 并可失效。不能从任意 400 推断工具永久不可用，尤其不能静默撤掉用户明确选择的模式。记录输入与工具 schema 体积，评估静态模板缓存和稳定提示前缀；是否支持上游前缀缓存必须按具体 provider 验证，不能预先许诺命中收益。全工具下发与精准工具选择之间存在功能召回权衡，不能为了速度误删连接器能力。

## 并发与资源：第二阶段关注项

- 数据库池 `server/src/db/index.ts:35` 最大 8 个连接，准备阶段并行读取会与保存、索引、turn checkpoint 竞争。先增加池等待/active/idle/排队监控、慢查询和事件循环延迟；没有并发与数据库容量数据时不建议直接扩池。
- `chunkIndex.ts:106` embedding 后逐条更新最多 64 个 chunk。`runChatStreamPipeline.ts:1034` 已在完成响应后才等待主要落盘/索引，故它通常不直接延长本轮正文，但能与下一轮准备竞争资源。BM25 持久化与向量 enrichment 可拆为受限后台任务，向量更新批量执行；保证失败重试和清理。
- `pipeline/sseEmitter.ts:27` 没有根据 `res.write()` 的返回值应用背压。慢客户端、高并发和大工具载荷场景需记录 writableLength，再设计有界队列/断线恢复；不能随意停止持久 turn 或丢 tool_result。
- Python 已有常驻 worker 池，进一步优化应看 pool 排队、worker 冷启动、包加载和执行分别占多少，而非重复创建另一套池。独立工具可并行，修改同一会话工作目录的调用继续串行。
- 32 KB SSE prime 是已有代理缓冲兼容措施。它会增加每轮传输字节，但直接删除可能恢复整段缓冲问题；需在真实 CDN/运营商路径下比较首正文与小回答，不能用首响应头改善充当 TTFT 改善。

## 建议实施顺序与验收

第一批：补分段时点；为播放器设置最大落后时间并拆分完成状态；修正到达采样。使用相同录制流比较可见延迟、正文一致性、输入延迟和完成状态。保持工具 textOffset、停止、重发、队列与会话切换契约。

第二批：RAG 分支预算/取消、长上下文滚动摘要与进行中去重。以检索召回、上下文完整性和停止后资源占用为守卫，同时量化首正文改善。不要把缩短超时造成的质量损失伪装成纯收益。

第三批：已有会话减少发送前保存往返，完成保存进入明确的同步状态；与消息分页一起按 `/api/v2` 兼容契约规划，迁移 Web、Universal 和独立 Android。

第四批：根据 trace 收敛输入框几何、列表全量扫描、Android 中间空状态与重载荷工具渲染。首屏只做有 entry graph/冷启动实测依据的进一步拆分；避免增加交互首次打开的多层下载瀑布。

建议验收矩阵包括：短纯文本、快速大块回复、持续小包、长代码/公式、长会话首开和缓存重访、附件、URL 超时、工具多轮、停止/重试/断线恢复；桌面与中低端手机分别测量。先构建再运行与 diff 对应的最小浏览器规格，改渲染需检查截图；服务端跑 typecheck 与 focused tests。相关现有规格有 `performance-streaming`、`performance-interaction`、`chat-input-latency`、`performance-history-restore`、`stream-finish-stability`、`chat-stop-resend`、`send-feedback`。本轮没有运行这些检查，实际实施时再按改动映射选择。

总体判断：有明确优化空间，优先去掉发送准备、同步摘要和可见播放的额外等待。保留已有安全并行、状态不可变性、消息幂等与跨端恢复；目前没有证据要求重写框架或拆分微服务。

## 第一批实施结果（同日，审阅之后）

已实施 R1、R7，以及 R11 的服务端路由阶段计时。其余发现仍是待办，尤其摘要、RAG、保存往返和布局动画尚未在此批修改。

- 核心播放器默认最多保留 120 ms 的未显示到达记录，过期内容在下一 tick 追平；可用 `maxLagMs: 0` 显式保留按速率播放。记录按短时间桶合并，播放后清理。实际 DOM 提交仍受 runtime cadence、渲染和浏览器调度影响，120 ms 不是端到端呈现保证。
- 到达速率采样使用独立时间窗，短于采样窗的帧不再丢弃累计字符。EMA 权重为 0 时明确走原有深度速率策略。
- 收到 DONE 后立即刷新完整正文并执行既有完成流程，删除等待播放排空的 continuation。立即刷新会同步更新核心 playedLen/终态，失效旧帧且 onDone 只调用一次。
- 新的 `[chat-latency]` 记录以单调时钟从 stream 路由认证之前开始，累计记录 authenticated、bound、claimed、prepared、tools_ready、upstream_started、first_reasoning 和 first_content；首推理和首正文独立输出，日志不带正文或密钥。该计时仍不包含 Express 全局中间件之前、客户端准备或网络 RTT，也未实现各准备分支独立 span。

### 测量

固定 16 ms 虚拟帧、一次到达 10,000 个 ASCII 字符：直接加载 HEAD 原始播放器和修改后的播放器，原始实现约 12,832 ms 追平，新实现 128 ms；第一帧之后触发结束，原始 beginDrain 约在第 5,136 ms 追平，新流程在第 16 ms 同步刷新。这是确定性调度对比，不是墙钟、网络、生产 TTFT 或设备实测。

生产 Vite 构建、本地 `127.0.0.1:4173`、Chromium 1280×720、模拟认证及 SSE，两个中文大突发场景各重复三次：

| 场景 | 收到大段至 DOM 全文且下一 rAF，中位数 | DONE 至 settled 且下一 rAF，中位数 |
| --- | --- | --- |
| 大段后保持连接 2 秒 | 212.0 ms | 13.4 ms |
| 大段后约 50 ms 发送 DONE | 126.4 ms | 68.3 ms |

六次均通过 500 ms 宽松回归门槛，没有失败或重试；最长全文显示代理耗时约 398.9 ms。该代理读取 DOM textContent，不等于真实呈现时间，也不覆盖渐显 opacity 完成。没有对应旧版本浏览器采样，不能把虚拟帧对比和浏览器数字拼成生产百分比。

### 验证与限制

- 核心时钟 14 项通过，覆盖突发、连续新包不能推迟旧内容期限、暂停恢复、采样以及原有不越界和饥饿状态。
- 前端按 diff 运行两组 focused unit tests（26 项及 25 项，包含重叠播放器文件），验证末帧、重试视口、Markdown 完成一致性、渐显与冷加载取消。
- 前端完整 lint/构建通过，lint 保留 460 个现有 warnings；服务端与 Universal App typecheck 通过。
- 服务端计时及 turn 并发测试 8 项通过，包括数据库和并发 HTTP stream 路径。测试退出时有 embedding timeout 和关闭连接池后的异步落盘日志；因此不声称服务端测试日志完全干净，该现象需要单独处理后台任务测试清理。
- Playwright 首轮 20 项全部通过：stream-smooth、stream-finish-stability、chat-stop-resend、performance-streaming。覆盖桌面与手机结束布局、停止重发、旧回合取消不影响新回合，以及普通/4× CPU 长回复期间输入。长回复两种 CPU 条件下 settledPaints=0、prefixPreserved=true、挂载 13 行、采样 longTasks=[]；该长回复规格主要验证已有段落稳定性，不能代替真实网络播放器的所有压力测试。
- 新增突发延迟用例额外重复 6 项通过；已检查完成后的桌面截图。最终重新构建确认产物不含已删除的 continuation。其后的 12 项复核中有 1 条旧用例失败：自动化再次读取 DOM 时期限已经到达，却仍要求正文处于部分显示。改为页面内 MutationObserver 记录第一次正文更新，并仅在期限前要求部分显示；期限到达后允许追平。修订后的整个 stream-smooth 规格连续两轮共 16 项通过，最终构建的 4 项结束布局检查也通过。Browser plugin not available，使用仓库 Playwright；生成截图、trace 和报告留在忽略目录/临时目录，未纳入源码。
- 本批未部署，无数据库迁移或 HTTP wire 字段变更。回滚相应源文件即可恢复播放策略和旧日志；日志消费方应注意 `[ttfb]` 改为 `[chat-latency]`。

## 第二批实施结果：聊天检索预算与取消

用户继续授权后实施 R3。新增 `server/src/services/embeddings/hybridRetrieval.ts` 管理两路结果与预算，`server/src/lib/timeBudget.ts` 管理超时、父信号、定时器/监听器清理和迟到 Promise 的安全结算。

### 行为变化

- 聊天自动召回的总预算继续使用 `CHAT_RAG_TIMEOUT_MS`，默认 2,000 ms、上限 10,000 ms。该预算现在覆盖空索引 probe，而不是让 probe 排在预算外。
- 新增 `CHAT_RAG_VECTOR_TIMEOUT_MS`：默认 500 ms，实际值不超过总预算。向量支路的预算包括 probe、配置读取、embedding 和向量查询；及时完成时继续使用既有 RRF 排序和去重。
- 向量超时时返回已经完成的词法结果；总预算到期时保留已经完成的结果，也可以只保留向量命中。两路都未完成则返回空，不读取迟到结果。
- 会话归属检查有独立的总预算，并仍是必需的注入门槛。检查失败、超时或执行信号取消时不向模型注入检索内容。
- 将持久 turn 的 executionSignal 从 stream route 传入准备与检索层，预算到期/父信号取消会传递到 embedding fetch，且覆盖响应体读取。超时的 probe/配置读取结束后，不再继续启动 embedding 或向量 SQL。
- 后台消息索引仍保留 30 秒 embedding HTTP 预算。独立 `/api/rag/search` 调用不传聊天预算，继续等待两路检索完成；HTTP 请求和响应字段保持一致。

以下是受控条件下的调度行为，假设归属检查及时成功，不能作为生产首字基准：

| 情况 | 原有聊天召回 | 新行为 |
| --- | --- | --- |
| 词法及时返回，向量一直未返回 | 等总预算约 2 秒，丢弃整轮召回，embedding 可能继续运行 | 约 500 ms 返回词法命中，并取消 embedding |
| 向量及时返回，词法一直未返回 | 总预算后丢弃整轮召回 | 总预算后保留向量命中 |
| 两路及时完成 | 融合结果 | 保留相同融合与去重策略 |
| 两路均卡住 | 总预算后无召回，后台任务继续 | 总预算后无召回，并取消可取消的工作 |

### 验证与质量边界

- 使用 mock timers 验证 499 ms 仍在等待、500 ms 返回词法结果、总预算兜底、仅向量命中、取消、迟到拒绝/结果、默认独立搜索等待，以及成功后定时器和父监听器清理。
- embedding 传输测试使用假 provider 配置和模拟 fetch，验证取消确实进入请求信号；请求头未返回、响应体卡住均能结束等待；正常请求格式、向量维度与后台 30 秒期限也保留。没有请求真实模型或使用真实 provider 密钥。
- `EMBEDDING_DISABLED=1 node --import dotenv/config --import tsx --test test/chunkIndex.test.js test/chat-helpers.test.js test/rag.test.js test/hybridRetrieval.test.mjs test/embedding.test.js`：104 项通过、0 跳过，包含真实数据库中的预算路径、空索引、词法检索、跨会话隔离与最终注入归属检查。初版新增 fixture 的三个词不足以超过已有 BM25 阈值，改用原测试中已验证的完整查询；没有改变打分或阈值以使测试通过。
- 最后对最终源码运行 `chatTurnsConcurrency`、`chunkIndex`、`hybridRetrieval`、`embedding` 四个 focused 文件：39 项通过、0 跳过，包括两个并发 HTTP stream 只发起一次上游调用。测试时禁用真实 embedding，传输取消另由模拟 fetch 覆盖；本次回归没有前一批的 embedding 等待/连接池关闭警告。
- 服务端 typecheck、依赖边界检查与最终 build 通过，`git diff --check` 通过。第二批没有前端改动，因此未重跑前端构建或浏览器规格。
- 500 ms 是延迟和语义召回之间的取舍：超过此期限才返回的语义命中不会加入本轮。需用线上阶段计时及召回样本评估，可提高该环境变量，最多回到现有总预算。没有声称真实模型生成变快，也没有部署。
- AbortSignal 可以中止 fetch 和阻止后续任务，但当前 Drizzle 查询不能通过此信号取消已经发出的 SQL；它们仍受数据库 statement_timeout 控制。共享配置缓存的进行中查询同样不因单个回合取消而终止，避免影响其他回合。
- 无迁移、无公共 API/contracts 变更。回滚第二批源文件可恢复旧策略；只需调整向量时间预算时无需改数据库或客户端。
