# 技术债状态复核

日期：2026-10-30。复核基于已提交 HEAD `c6a2dcc7` 与当前工作树；生产数据库、真实供应商账户和设备未连接。本文件更新 2026-10-23 稳定性加固交接的状态，不把历史审计快照改写成当前结论。

## 本次关闭或收窄

| 条目 | 当前状态 | 依据 |
|---|---|---|
| 前端遗留 JavaScript 迁移 | **已关闭** | `frontend/scripts/legacy-js.baseline.json` 为 0；2026-10-30 的 JavaScript → TypeScript 迁移提交已落库。 |
| SSE 错误被统一映射成 502 | **本次已修复** | `ChatSseHandlers.onError` 保留原有首参数字符串，新增可选结构化详情；共享解析器校验并传递 `status`、`code`、`retryable`、`upstreamStatus` 与 `retryAfterMs`；共享 API 的 `ApiError` 保留这些字段。旧式只带消息的帧仍回退到 502。 |
| 前端空 catch 未埋点 | **本次已关闭** | 170 个未埋点调用点接入内容不外发、全局限流的 `reportSwallow`；76 个从现有注释可判定为可选能力、清理或最佳努力的场景标为 `expected`，其余走 `recoverable`。遥测初始化自身无法使用 Vite 环境值的回退保留一条有理由豁免；守卫基线收缩到 0。 |
| Universal App 的 node-forge 高危依赖 | **本次已修复** | 在 `apps/socrates` 锁定兼容范围内的 `node-forge@1.4.2`；上游 [1.4.1 changelog](https://github.com/digitalbazaar/forge/blob/main/CHANGELOG.md) 记录签名验证安全修复，1.4.2 修复了 1.4.1 的 PEM Buffer 兼容回归。npm 审计确认 `node-forge` 条目消失，安全基线由 4 条收缩到 3 条。 |
| 生产环境缺少 `SESSION_SECRET` 时不 fail-fast | **已关闭** | `server/src/boot/startup.ts` 与 `server/src/lib/crypto.ts` 均有生产启动检查。 |
| 中文上下文预算与 usage 回退估算 | **本次已关闭** | usage 的估算回退复用 `estimateContextTokens`：ASCII 按每 4 字符向上取整，非 ASCII 按 UTF-8 字节数每 2 字节向上取整。供应商 usage 仍是首选计量；估算只在供应商未返回 usage 时启用。 |
| 显式 `any` 与由此积压的 ESLint 告警 | **本次已关闭** | SPA 默认 API 响应类型改为 `unknown` 并为调用方补窄契约；语音、worker、SSE、连接器、规划和可视化输入均以 `unknown` 加运行时校验处理。服务端同类边界也已收窄。`no-explicit-any` 已提升为 ESLint error；AST 守卫扫描 SPA、服务端、共享 packages 和 Universal App，当前为 0/0。生成的 OpenUI prompt 中的 `any` 示例文本属于提示词内容，不是 TypeScript 类型。 |
| React 确认弹窗、prompt templates、More 菜单、Usage、Share、Profile、sidebar 用户摘要、Composer Tools、附件与 session-list 状态的 window 状态桥 | **累计已移除十项** | 十个状态域分别由 `ui/confirmState.ts`、`ui/promptTemplatesState.ts`、`ui/morePopoverState.ts`、`ui/usageState.ts`、`ui/shareState.ts`、`ui/profileState.ts`、`ui/sidebarUserState.ts`、`ui/composerToolsState.ts`、`ui/attachmentsState.ts`、`ui/sessionListState.ts` 与 React 共享模块实例；不再创建对应的 window bridge。附件上传队列与稳定的 `window.attachments`、session cache 的 `window.SERVER_SESSIONS` 旧接口仍留在对应业务模块。 |

## 仍开放或尚无法确认

| 优先级 | 条目 | 状态与边界 |
|---|---|---|
| 高 | 生产 `0045_repair_scheduled_task_integrity.sql` 迁移及 scheduled_tasks 外键 | 仓库包含可重复运行的修复迁移；最后一份明确的生产审计记录为“尚未执行”。本次未访问生产库，因此不能宣称线上已修复。关闭条件是只读核验生产迁移账本及外键语义，并按正式迁移流程完成尚缺步骤。 |
| 中 | Expo / Universal App 依赖告警 | 审计当前仍将 `@expo/cli`、`expo` 与 `zod` 列为 3 个 high 依赖节点；其共同来源是 Expo CLI 使用的 `zod@3.25.76`（GHSA-mrhx-c7xc-m3w5）。CLI 声明 `zod ^3.25.76`，修复版本 `>=4.6.6` 不满足该范围；节点只在开发/构建工具链中。升级到 Expo 发布兼容版本后再移除例外，不通过不兼容的 major override 掩盖它。 |
| 中 | SPA 旧 DOM 与 React、window bridge、兼容 CSS 并存 | 2026-10-30 后续批次已移除确认弹窗、prompt templates、More、Usage、Share、Profile、sidebar 用户、Composer Tools、附件与 session-list 状态桥。`app/legacyBridge.ts`、`ui/legacyShellListeners.ts`、聊天运行时、agent-run 及其他仍有消费者的 typed window bridge 和兼容 CSS 仍在生产接线中；继续按领域迁移，不能据此宣称 SPA 运行时兼容边界已退役。 |
| 中 | Universal App 与原生 Android 完整签收 | Web/Android/iOS 的功能、设备、语言和浏览器覆盖仍未完成。原生 Android 对齐文档保留明确的不支持场景和设备验收缺口；截图或 JVM 测试不能代替真机签收。 |

## 回归覆盖

- `packages/core/src/index.test.ts` 覆盖结构化 SSE 错误字段解析。
- `packages/api/src/auth.test.ts` 覆盖 `ApiError` 中的 status/code/retry/cooldown 保留，以及旧消息帧的 502 兼容行为。
- 空 catch 守卫基线收缩为 0；`clientErrorReporter.test.mjs` 已覆盖 expected/recoverable 遥测边界。
- `npm run typecheck` 通过，覆盖 server、frontend 与 Universal App；`npm run lint` 通过，包括 ESLint、显式 `any` 守卫及架构 ratchet。
- 前端遥测与空 catch 守卫测试 13/13 通过；`npm run test:shared` 通过，包含 SSE 结构化错误回归。
- 本轮聚焦前端单测 64/64 通过；服务器非数据库聚焦单测 166 通过、0 失败、1 个数据库集成用例跳过；共享包测试通过。
- More 菜单状态迁移单测 1/1 通过；SPA 构建后运行 `sidebar-nav` 与 `sidebar-compat` Playwright：22/22 通过。
- Usage 状态与热图聚焦单测 2/2 通过；SPA 构建后 `usage-modal.spec.mjs` 1/1 通过，覆盖 API 数据渲染、周期请求与 React 内容节点唯一性。回归同时修复了 DOM 序列化导致周期控件不显示的问题，并移除了旧模块对 React 管理节点的直接写入。
- Share store 聚焦单测 1/1 通过；SPA 构建后 `share-view.spec.mjs` 4/4 通过，包含 share 创建与撤销流程。Usage 与 Share 共 5 条聚焦 Playwright 用例全部通过。
- Profile 与 sidebar-user store 单测 2/2 通过；本轮 SPA 构建后 `profile-modal`、`settings-modal`、`sidebar-nav` Playwright 共 30/30 通过。
- Profile/sidebar 迁移后的 SPA `npm run build`、`npm run lint`、`npm run lint:docs` 均通过；相关生成产物未加入版本控制。
- Composer Tools store 单测 1/1 通过；迁移后 SPA 构建、前端 lint 通过，`composer-tools-compat.spec.mjs` 10/10 通过，旧全局快照断言已改为菜单与 trigger 行为断言。
- 附件 store 单测 1/1 通过；迁移后 SPA `npm run build`、`npm run lint`、`npm run lint:docs` 均通过，`attachments-compat.spec.mjs` 10/10 覆盖共享数组发布、React chip、上传、重试及移除；旧全局快照断言已改为检查稳定的 `window.attachments` 与用户界面行为。
- session-list store 单测 1/1 通过，覆盖列表快照、不可变数组、行引用稳定、筛选状态保留和即时选中去重；SPA 构建、前端 lint、文档路径检查通过。定向 Playwright 19/19 通过：性能交互 CPU x1 1/1（20/500/2000 行）、`session-tags`、`recents-archive` 与 `sidebar-nav` 18/18。
- 本轮最终 SPA `npm run build`、`npm run lint`、`npm run lint:docs` 均通过；构建产物未纳入版本控制。
- 前端生产构建与 Universal App `export:web` 成功；最终构建后运行确认弹窗、会话列表和 tutor Playwright：29/29 通过。
- `node scripts/audit-ratchet.mjs apps/socrates` 通过（3 条已审阅 high 节点，0 条新增）；`apps/socrates` 的 `npm run export:web` 成功。
- 服务器文件上传路由集成测试需要专用 `*_test` / `*_qa` 数据库，本轮环境没有可安全使用的测试库，因此未运行该数据库套件；生产 `.env` 被安全守卫拒绝，未访问生产数据库。
- `git diff --check`、文档链接检查通过。本次没有运行生产迁移或访问生产数据库。
