# ChatGPT 对齐交接文档

日期：2026-10-17
基线提交：`79f756ca`（Intelligence UI）+ `bbf3f525`（动效统一）
目标读者：接手继续优化的 coding agent

## 0. 一句话目标

把 Socrates 从“单轮聊天体验接近 ChatGPT”推进到“持续任务、记忆、多模态、性能和跨端都能对标”，同时保留教育产品的差异化，不做无差别的功能堆砌。

判断标准不是像素级复刻 ChatGPT，而是：

1. 用户完成同类任务时，不需要因为缺少关键能力而换产品。
2. 交互质量达到同一档：首屏、流式、长会话、键盘、移动端、错误态都不掉链子。
3. 不破坏 Socrates 已有的教育护城河：苏格拉底教学、知识图谱、错题本、诊断评估。

## 1. 开工前先读

按顺序：

1. `AGENTS.md`：仓库边界、CSS 层级、lint ratchet、增量测试规则。必须遵守。
2. `docs/plans/product-roadmap.md`：产品定位与“补齐基线 + 强化教育”的双线策略。
3. `docs/audits/2026-10-16-frontend-ui-experience-review.md`：长会话、流式、菜单焦点、思考区、首屏成本的实测结论。
4. `docs/audits/2026-10-16-chatgpt-cached-ui-review.md`：消息操作栏、侧栏、输入框密度的设计建议。
5. `docs/ref/chatgpt-parity.md`：已有视觉基线；注意它是 2026-09-28 的采集快照，部分问题已修复。
6. 本文档。

## 2. 当前基线（已具备，不要重复造）

### 2.1 对话工作台

- 流式输出、停止、编辑用户消息、重生成、分支、点赞/点踩、复制、分享、朗读。
- 消息操作栏已收敛为「复制 / 重生成 / 反馈 + 更多菜单」（`frontend/src/react/message-list/MessageToolbar.tsx`）。
- 思考区默认折叠、可键盘操作、生成中可收起、中英文完整。
- 引用锚点与来源列表（`frontend/src/react/citations/TurnEvidence.tsx`）。
- 会话内 Ctrl-F（`frontend/src/react/find-in-session/`）、Cmd-K 全局搜索。
- 临时会话、项目、计划任务、记忆、自定义指令、模型/推理强度/速度选择。
- 附件：图片、PDF、Office、文本；拖放与粘贴图片。
- 工具运行卡、代码解释器、Web 搜索、Canvas、图像创作面板、连接器。
- Intelligence UI v2：声明式节点、状态表达式、动作、`toggle`、tone/trend、键盘标签页、表格/图表可访问性、container query。

### 2.2 最近的架构成果

- Intelligence UI 拆成三层：
  - `frontend/src/react/intelligence-ui/renderRuntime.ts`：状态、表达式、动作执行、URL 安全。
  - `frontend/src/react/intelligence-ui/IntelligenceUiNodes.tsx`：节点渲染。
  - `frontend/src/react/intelligence-ui/IntelligenceUi.tsx`：解析、状态、surface。
- 样式收敛到 `frontend/src/styles/components/intelligence-ui.css`；`components/chat.css` 不再拥有 `.intui`。
- `styles/parity/transcript.css` 的 Markdown 表格规则已用 `:not(.intui-table)` 排除原生 UI 表格。
- 动效统一走 `--ui-duration-*` / `--ui-ease-*`，锚定菜单按触发边设置 transform-origin，模型菜单不再逐项瀑布。

### 2.3 验证状态

最近一次验证：

- 前端单测：`npx tsx --tsconfig tsconfig.test.json --test test/intelligentUi.test.mjs` → 10/10。
- Intelligence UI e2e：`npx playwright test --config=playwright.config.mjs e2e/intelligent-ui-showcase.spec.mjs --workers=1` → 1/1。
- 相关 e2e（turn-activity / turn-event-runtime / unified-turn-ui）18/18。
- 生产构建成功。
- CSS 守卫全部通过：surface ownership、css-debt、z-index、mobile-css、button-sizes。
- 已知既有问题（非本轮引入）：
  - 前端 `tsc --noEmit` 有 3 个 WASM binding 错误。
  - 服务端 `tsc --noEmit` 有 3 个既有错误（缺 `xlsx`、`@socrates/core/visualizationMath`、`visualization.ts` 隐式 any）。
  - `server/test/intelligentUi.test.js` 第 4 个用例因环境无法解析 `@socrates/core` 失败；前 3 个通过。

本机构建需要把临时目录指到仓库内（否则 Vite 的 temp 权限会失败）：

```bash
cd frontend
mkdir -p node_modules/.socrates-build-temp
TEMP="$PWD/node_modules/.socrates-build-temp" \
TMP="$PWD/node_modules/.socrates-build-temp" \
TMPDIR="$PWD/node_modules/.socrates-build-temp" \
npx vite build
```

当前主包体积（单文件，非整页传输）：CSS ≈ 771 kB（gzip 172 kB），JS ≈ 843 kB（gzip 264 kB）。长会话仍是渐进挂载，240 条约 7,560 个 DOM 节点（见 2026-10-16 审计）。

## 3. 差距清单（按优先级）

### P0-1 服务端持久化 Deep Research / Agent

**现状**

- Deep Research 完全由前端编排：`frontend/src/agent/researchAgent.js` 的 `startDeepResearch` 串行执行 plan → search → read → synthesize，关闭页面即中断；产物只在结束时写入 `/api/artifacts`。
- 请求 schema 接受 `agentMode`，但没有任何执行逻辑读取它（`server/src/routes/chat/helpers.ts`）。
- `workspace_agent` 依赖 Pi 可执行文件（`server/src/services/tools/piAgent.ts`），且不接 Web/MCP。
- 已有 `agentRuns` 路由与 schema，可作为持久任务的起点（`server/src/routes/agentRuns.ts`）。

**要做**

- 新建/复用 `research_jobs` 或扩展 `agent_runs`：状态机（queued/running/paused/succeeded/failed/cancelled）、lease、重试、幂等键、步骤事件。
- 服务端执行研究循环；SSE 支持断线重连（按 `lastEventId` 补发），页面关闭后继续运行。
- 完成/失败后写入 artifact，并通过通知渠道告知用户。
- 前端改为“提交任务 + 订阅事件”，保留现有 `ExploreStepper` 的展示语义。

**验收**

- 启动研究后关闭标签页，5 分钟后重新打开仍能看到进度与结果。
- 服务重启后任务不会重复执行；租约过期可被其他 worker 接管。
- 取消、重试、失败态都有明确 UI；有服务端测试。

### P0-2 长会话性能

**现状**

- `frontend/src/react/message-list/progressiveMount.ts` 是 12 条一批的渐进挂载，空闲后会补齐全部历史，不是有界虚拟列表。
- 审计实测 240 条消息最终挂载 240 条、7,560 个 DOM 节点。

**要做**

- 先建立固定负载：200 / 500 / 1000 条混合消息（含代码块、工具卡、Intelligence UI、图片）。
- 选择有界窗口或按回合分段回收；缓存实测高度，保留 live 回合。
- 必须保住：全文查找（查找前 flush）、文本选择/复制、屏幕阅读器读取、滚动锚定、编辑/重生成定位。

**验收**

- 1000 条会话 DOM 保持在预算内，滚动帧时间与内存对比基线有改善。
- `find-in-session`、`chat-autoscroll`、`chat-send-glide`、`stream-finish-stability` 不回归。

### P1-1 记忆与检索

**现状**

- 服务端只注入最近 N 条 enabled 记忆（`server/src/routes/chat/helpers.ts` 的 `resolveMemoryContext`），没有语义召回。
- `session_chunks` 已有可选 pgvector 1536 维字段（`server/src/db/schema/chat.ts`），但检索是会话内 BM25 + 可选 rerank。
- 自定义指令由客户端作为 system message 发送（`frontend/src/chat/api/requestBody.ts`）；服务端只做分类与注入边界（`enforceServerSystemBoundary`），不从用户配置统一装配。

**要做**

- 为 memories 生成 embedding，按 query 做语义召回 + 时间/项目/置信度重排；保留“最近 N 条”作为兜底。
- 服务端统一装配 custom instructions，客户端只负责编辑配置；第三方 API 客户端也能获得一致人格。
- 记忆管理 UI 增加来源、作用域、最近使用时间、删除/禁用；避免跨项目泄漏。

**验收**

- 相关记忆召回测试（同义改写、跨语言、项目隔离）。
- 关闭“引用聊天历史”后不召回；删除记忆后下一轮立即失效。

### P1-2 计划任务与通知

**现状**

- 调度器是真实运行的：60 秒轮询、数据库租约（`server/src/services/core/scheduler.ts`）。
- 通知配置只落库（`server/src/routes/scheduledTasks.ts`），未发现推送发送器；设备 token 有注册接口（`server/src/routes/notifications.ts`）。
- `custom` 频率的 `computeNextRunAt` 返回 null，cron 表达式未执行。

**要做**

- 接通 Web Push / Expo Push / 邮件中的至少一条真实送达链路，带重试与失效 token 清理。
- 实现 custom cron（时区、DST、最短间隔限制）。
- 任务失败可在 UI 看到原因并重试。

**验收**

- 创建 1 分钟后执行的任务，关闭页面仍收到通知；自定义 cron 在指定时区触发。
- 失败任务不会静默消失。

### P1-3 连接器与 MCP

**现状**

- 通过 OOMOL/OpenConnector 可触达 319 个 `oc_*` 工具、122 个应用，这是相对优势。
- `/api/mcp` 只是只读的 MCP server（`server/src/routes/mcp.ts`），没有 MCP client；`agent_mcp_settings` 只有 schema。
- 项目连接器只暴露 6 个只读工具（`server/src/services/integrations/projectConnectorTools.ts`），目录里列了 14 个。
- `workspace_agent` 明确不带 Web/MCP（`server/src/services/tools/agentRuntime.ts`）。

**要做**

- 增加 MCP client：用户添加 server、工具发现、按工具授权、调用审计。
- 把项目连接器从只读扩到写操作；写操作必须有 scope 声明与用户确认。
- 统一连接器错误、限流、超时与重试策略；继续做 SSRF 防护。

**验收**

- 用户可添加一个自建 MCP server，并在聊天中调用其工具。
- 写操作在未确认时被拒绝；审计日志可追溯。

### P1-4 多模态

**现状**

- 图片输入、PDF/Office 解析、TTS 输出可用。
- 语音输入仅浏览器 Web Speech（`frontend/src/ui/voiceInput.js`），无服务端 STT。
- 图像生成在独立创作面板（`server/src/routes/creations.ts`），不是聊天工具；无视频理解/生成。

**建议顺序**

1. 把图像生成接入 tool registry，支持聊天内生成 + 迭代编辑（参考 `render_intelligent_ui` 的工具模式）。
2. 服务端 STT（录音上传 → 转写 → 回填），替换 Web Speech 作为主路径。
3. 连续语音/高级语音（如果产品确定要做）。
4. 视频能力最后评估，不要阻塞基线。

**验收**

- 在聊天中生成图片、继续编辑并保存为 artifact；失败有明确错误，不污染正文。

### P2-1 分支变体与会话导出

- 现在是克隆新会话（`frontend/src/chat/editBranch.js`），没有同一位置切换回答变体的 UI。
- 没有会话/账户数据导出。
- 目标：消息级 `← 1/3 →` 变体切换；导出 Markdown/JSON；保留分享链接与隐私控制。

### P2-2 跨端与协作

- Universal App 只有 9 个主屏；Scheduled/Plugins/Sites 是空实现（`apps/socrates/src/appNavigation.ts`）。
- iOS/桌面端未落地；有分享链接，无实时协作。
- 先补 Universal App 的 P0 功能（研究任务、记忆、通知），再评估原生桌面/移动。

### P2-3 国际化与新手引导

- 仍存在硬编码英文：`frontend/src/react/pages/scheduled/scheduled.service.ts`、`workspace.service.ts`、`ExploreStepper.tsx`、`ui/usage.js`。
- 首页建议入口是 no-op shim；新用户缺少可点击的起步路径。
- 目标：en/zh 键集一致；首页建议按真实模板配置，不再是空实现。

## 4. 必须遵守的工程约束

### 4.1 样式

- `frontend/src/styles/themes.css` 只导入一次且最后；它是唯一调色板。不要新增第二套灰阶/hex。
- 桌面 transcript/sidebar/topbar/composer 各有唯一 owner；`.intui` 已被 surface guard 排除，样式放在 `components/intelligence-ui.css`。
- 控件尺寸走 `--ui-control-sm/md/touch` 或既有阶梯；不要写新的字面 height。
- 动效走 `--ui-duration-*` / `--ui-ease-*`；必须兼容 `prefers-reduced-motion`。
- 修改 CSS 后运行：
  ```bash
  cd frontend
  node scripts/check-surface-ownership.mjs
  node scripts/check-css-debt.mjs
  node scripts/check-z-index.mjs
  node scripts/check-mobile-css.mjs
  node scripts/check-button-sizes.mjs
  ```

### 4.2 聊天/服务端边界

- `frontend/src/chat/**` 不得 import `frontend/src/react/**`；共享类型放 `react/types/**` 或 `ui/`。
- 新的服务端行为必须有 zod 校验、错误码、幂等与超时；不要信任模型参数。
- 数据库变更同步 Drizzle migration；部署相关改动先做非生产验证。
- 跨端 API 变更同步 `docs/api/openapi.yaml`、`packages/contracts` 和 `apps/socrates`。

### 4.3 测试

按 `AGENTS.md` 的增量测试规则，不要每次跑全量：

```bash
# 前端单测（示例）
cd frontend
npx tsx --tsconfig tsconfig.test.json --test test/intelligentUi.test.mjs

# 聚焦 e2e
npx playwright test --config=playwright.config.mjs e2e/intelligent-ui-showcase.spec.mjs --workers=1

# 服务端
cd server
npm run typecheck
npm test
```

UI 改动必须看截图（桌面 1440×900、手机 390×844，浅色/深色至少各一）；行为改动优先补 focused spec，而不是依赖全量套件。

## 5. 建议的第一个迭代（1 周）

**Day 1–2：持久化研究任务骨架**

- 表结构：复用 `agent_runs`，补 `kind='research'`、`steps`、`lease_expires_at`、`result_artifact_id`。
- API：`POST /api/research-jobs`、`GET /api/research-jobs/:id`、`GET /api/research-jobs/:id/events`、`POST .../cancel`。
- 服务端 worker：先做最小 plan→search→synthesize，复用现有 web search 与 fetch。
- 前端：`researchAgent.js` 改为提交任务；`ExploreStepper` 订阅 SSE。

**Day 3–4：断线恢复与通知**

- SSE `Last-Event-ID` 补发；页面重进读取快照。
- 完成/失败写 artifact；先接通一条通知渠道（推荐 Web Push 或邮件）。
- 测试：关闭页面、重启服务、取消/重试。

**Day 5：性能基线**

- 生成 200/500/1000 条固定会话；记录 DOM、滚动帧时间、内存。
- 选一个最小可行窗口化方案做原型；不要同时改 turnAnchor 和流式高度。

交付时在本文档下方追加“已完成 / 实测数据 / 剩余风险”。

## 6. 风险与不要做的事

- 不要为了“像 ChatGPT”重写已经稳定的滚动/流式/编辑链路；先测量再改。
- 不要把第三方 MCP/连接器的写权限直接暴露给模型；必须有 scope 与确认。
- 不要把 Deep Research 做成又一个前端长 Promise；这是当前最大的结构性差距。
- 不要为了统一而删除手机独立密度、焦点环或 reduced-motion 降级。
- 不要在 `themes.css` 之外新增颜色；不要用 `!important` 绕过级联。
- 不要提交 `dist/`、`test-results/`、密钥或部署状态。

## 7. 交接完成检查

- [ ] `git status` 干净，最新提交已推送 `origin/main`。
- [ ] 已读 `AGENTS.md`、产品路线图、两份 2026-10-16 审计。
- [ ] 已运行一次前端构建与聚焦 e2e，确认基线可复现。
- [ ] 已确认当前环境已知失败项（WASM binding / 服务端 `@socrates/core` 解析）不是本轮引入。
- [ ] 选定 P0-1 或 P0-2 作为第一个迭代，并在任务系统里拆成可验收的小项。

## 8. 开发接续：P0-1 服务端基础（2026-10-18）

### 已完成

- 已阅读本篇要求的入口文档，选择 P0-1；本轮交付服务端基础，不代表整项 P0-1 已验收。
- 新增独立 `research_jobs` / `research_job_events`（migration `0044_research_jobs`）。没有直接复用 `agent_runs`：现有 Pi 重启恢复与研究的只读检查点恢复语义不同，分表可避免互相干扰。
- API：提交、按用户/会话列举、读取快照、SSE、取消、重试。Zod 校验 UUID/请求/cursor；认证后按 HTTP 方法要求 `chat:read` / `chat:write`；会话与项目必须属于当前用户且匹配。
- 幂等键持久化在任务中；同键同参数返回同一任务的当前快照，参数不同返回 409。用户提交和重试通过数据库事务锁序列化，最多三个排队/运行任务。
- 后台 worker 随服务启动，3 秒轮询，每进程最多两个执行；90 秒租约，15 秒续租，单次执行上限 10 分钟。`SKIP LOCKED` 领取，最多三次租约尝试；取消立即撤销数据库写权限。
- 执行 plan → search → read → synthesize，复用现有搜索和带 SSRF 防护的页面读取。逐个搜索保存检查点，恢复时跳过已完成步骤。最终 Markdown artifact、成功状态与事件原子提交。记录模型 token usage；内置 provider 每次模型请求前检查账户月额度。
- SSE 从数据库读取序列，支持 `Last-Event-ID`（优先于 `after`）、跨进程补发和 keepalive；订阅断开不取消任务，终态事件补齐后关闭。慢客户端断流后可按已收 ID 重连。
- 同步 OpenAPI、`packages/contracts` 和共享 API 客户端的 `research` 方法；Universal App 已做兼容类型检查。

### 实测数据

- 开工前工作区干净。前端生产构建成功，`chat-workbench` **5/5** 通过。本环境没有复现交接第 2.3 节的服务端既有 TypeScript 错误。
- 在单独启动的临时 PostgreSQL 16 中应用完整迁移链成功；`0044` SQL 额外重复执行两次成功。Drizzle metadata/drift、服务分层、共享包 DOM-free 守卫通过。
- 新增研究流水线及数据库/HTTP 测试 **13/13** 通过，覆盖：并发幂等、用户/项目隔离、配额、唯一领取、过期租约接管、旧 worker 写入拒绝、产物只提交一次、取消/重试、错误脱敏、SSE 断连后后台完成与 cursor 补发、恢复耗尽、空来源重新搜索。连同已有 usageTracker 测试共 **31/31** 通过；scheduler/scopes 另 **14/14** 通过。
- 共享 API 聚焦单测 **22/22** 通过；服务端与 Universal App `typecheck` 通过。
- 本机 `NODE_OPTIONS` 注入的代理会让测试中的流式 fetch 走 `127.0.0.1:7890` 并断链；数据库/HTTP 测试使用 `NODE_OPTIONS=` 排除此干扰。共享 API 原有 strip-types 运行器无法解析 `packages/core` 的无后缀 import；加用已有 tsx loader 后聚焦文件通过。

复跑研究测试（先给独立测试库应用 migrations；不要使用生产库）：

```bash
cd server
NODE_OPTIONS= TEST_DATABASE_URL=<isolated-test-db-url> \
  node --import tsx --test test/researchPipeline.test.js test/researchJobsDb.test.js
```

### 后续可验收小项与剩余风险

- [x] 服务端任务/API/租约/检查点/事件/artifact 基础。
- [x] 将 `frontend/src/agent/researchAgent.js` 接入新 API（第二轮完成，见第 9 节）。
- [x] ExploreStepper 展示持久任务快照、取消/重试，重进会话订阅未完成任务，并避免重复发布报告（第二轮完成）。
- [ ] 完成/失败通知的真实送达、失败 artifact、暂停/继续接口。
- [ ] 浏览器关闭五分钟、真实 API 进程重启的端到端验收；目前验证的是断开 HTTP 订阅后完成和数据库租约过期接管，模型/搜索使用确定性替身，尚未测试真实 provider 的报告质量和费用。
- [ ] P0-2 固定负载与性能基线。

恢复保证是“已提交检查点不重做、旧租约不能提交结果、最终产物只提交一次”。进程在上游返回后、检查点提交前退出时，接管者仍可能重试该只读请求并产生重复模型费用；不承诺上游恰好一次调用。取消后无 AbortSignal 的既有搜索/读取调用可能在自身超时前继续，但不能写回任务结果。

上线顺序：先执行 `server` 的 `npm run db:migrate`，再发布包含新 worker 的 API。迁移只增加表和索引；回滚应用时保留表与任务数据，恢复旧应用后任务不会继续执行，再次发布新 worker 可接管过期租约。需要永久删除表时必须先确认这些任务和结果不再需要。本轮没有部署、提交或推送。

## 9. 第二轮：前端持久任务接入（2026-10-18）

### 已完成

- `researchAgent.js` 保留原有启动入口，移除浏览器 plan/search/read/synthesize 长 Promise，改为提交服务端任务。新增逻辑均为 TypeScript；没有改动 `main.js` 的存储导入顺序。
- `researchController.ts` 管理当前账户/会话的快照、订阅和操作；`researchJobsClient.ts` 处理认证 API、会话保存、提交指针和结果展示。切换会话或退出账户会中断订阅，异步回调按捕获的作用域代次检查，不能把旧报告写到新会话。
- 研究进度复用 ExploreStepper，覆盖排队、运行、重连、失败原因、取消、重试；失败/取消卡保留操作入口，成功后由聊天中的报告承接。阶段与操作文案接入 en/zh，运行时切换语言立即生效。
- 提交先保存账户/会话隔离的幂等指针，再保存用户消息并提交任务。响应丢失时保留原键，可手动恢复；重进同一会话会自动恢复未确认的提交。用户也可关闭提交提示；这只清除本地提交指针，不取消已经被服务端接受的研究。临时聊天不提交持久任务。
- SSE 使用 `Last-Event-ID` 续接，断开后有上限的退避重连；CRLF、分片 UTF-8、keepalive 和末尾事件均有解析测试。
- 服务端完成事务增加稳定 ID 的报告消息，并保留旧前端的 Markdown + LaTeX 两份 artifact。研究首次从首页启动时不再创建空的流式助手占位。
- 新增 `GET /api/research-jobs/:id/result`：读取已保存的当前报告消息，前端按稳定 clientId 去重。消息编辑后不会被原 artifact 覆盖，删除后不会因重连复活。同步 OpenAPI 与共享 API 客户端；没有新增数据库迁移或依赖。
- 新样式仅在 `components/research-jobs.css`，同步 `styles/index.css` 与首屏 `critical-3.css` 的级联入口，`themes.css` 仍唯一且最后。

### 验证

- 前端完整 `npm run lint` 和生产构建通过；服务端与 Universal App 类型检查通过。
- 前端新增控制器/事件解析 **7/7**；既有 extensions **11/11**；共享 API **22/22** 通过。
- 服务端研究流水线/数据库/HTTP 聚焦检查 **14/14** 通过，覆盖稳定消息、双 artifact、删除后不恢复，以及原有租约/取消/重试检查。
- 浏览器研究任务 **5/5**、聊天工作台 **5/5** 通过；既有 session-start **8/8**、search-progress **2/2** 通过。新增首页研究不遗留 streaming 占位的断言另已通过。
- 浏览器覆盖提交响应丢失后的同键重试、SSE 重连、报告只展示一次、刷新恢复、跨会话延迟回调隔离、文档卸载后服务端完成再重进、失败原因与同任务重试、中英文操作。四组桌面/手机、浅色/深色截图保存在 gitignored 的 `frontend/test-results/research-*.png`。
- 第一轮浏览器测试的两项失败来自测试会话缺少标题，保存时的自动标题请求被误计为研究 LLM 请求。读取 trace 确认后，测试改为有标题的已有会话，仍保留“研究不在浏览器调用模型/搜索/页面读取”的断言。

### 剩余项与发布边界

- P0-1 尚余真实通知发送、失败 artifact、暂停/继续，以及真实 provider 与真实服务重启验收；浏览器测试使用可控 API 替身，没有把页面卸载测试等同于生产关闭五分钟或杀进程测试。
- 提交指针依赖可用的本地存储；存储不可用时仍可提交，未确认请求跨刷新自动恢复的能力会受限。已被接受的任务仍可按会话从服务端列出。
- 前后端必须一起发布；前端不回退到旧的浏览器研究循环。先运行 `0044` 迁移并发布支持 result API 的后端，再发布前端。回滚时恢复上一版前端/后端并保留新增表；已完成的报告消息和 artifacts 仍作为普通会话数据保留。
- 当前没有部署、提交或推送。下一轮优先接通一条真实通知链路，并补进程重启恢复的集成验收。
