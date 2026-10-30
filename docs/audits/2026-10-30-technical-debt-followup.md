# 技术债状态复核

日期：2026-10-30。复核起点为已提交 HEAD `a64d4ba6`；当前工作树继续清理中。生产数据库、真实供应商账户和设备未连接。本文件更新 2026-10-23 稳定性加固交接的状态，不把历史审计快照改写成当前结论。

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
| React 确认弹窗、prompt templates、More 菜单、Usage、Share、Profile、sidebar 用户摘要、Composer Tools、附件、session-list 与 Cmd-K 状态的 window 状态桥 | **累计已移除十一项** | 十一个状态域分别由 `ui/confirmState.ts`、`ui/promptTemplatesState.ts`、`ui/morePopoverState.ts`、`ui/usageState.ts`、`ui/shareState.ts`、`ui/profileState.ts`、`ui/sidebarUserState.ts`、`ui/composerToolsState.ts`、`ui/attachmentsState.ts`、`ui/sessionListState.ts`、`ui/cmdKState.ts` 与 React 共享模块实例；不再创建对应的 window bridge。附件上传队列与稳定的 `window.attachments`、session cache 的 `window.SERVER_SESSIONS` 旧接口仍留在对应业务模块。 |
| `state/` 六个命名空间的 `window.__socrates*Bridge` 别名 | **已移除** | 全仓没有消费者；模块内的 `sessionBridge`、`kbBridge`、`searchBridge`、`callBridge`、`uiBridge`、`examBridge` 和 `window.stateStore` facade 继续工作。 |
| 聊天运行时的 `window.__socratesReactChatBridge` | **本轮已移除** | 快照、订阅与双 RAF 队列移入 `ui/chatRuntimeStore.ts`；React 和 legacy publisher 导入同一实例，`ToolRuntime` 通过依赖注入发布更新。移除 React 专用 adapter 文件与 `createImmutableBridge.windowKey`。E2E 使用构建可用的 `socrates:chat-runtime-publish` 事件或真实 `addMessage()`，生命周期用例观察 `socrates:chat-runtime-changed` 和最终 UI。 |
| KaTeX 数学 revision 的 `window.__socratesMathRenderRev` | **本轮已移除** | `render/mathRevision.ts` 是唯一版本计数器；懒加载成功后递增同一模块状态，React 通过正常 runtime 发布失效缓存并重新绘制。测试改为校验渲染结果和旧 window 字段不存在。 |

## 仍开放或尚无法确认

| 优先级 | 条目 | 状态与边界 |
|---|---|---|
| 高 | 生产 `0045_repair_scheduled_task_integrity.sql` 迁移及 scheduled_tasks 外键 | 仓库包含可重复运行的修复迁移；最后一份明确的生产审计记录为“尚未执行”。本次未访问生产库，因此不能宣称线上已修复。关闭条件是只读核验生产迁移账本及外键语义，并按正式迁移流程完成尚缺步骤。 |
| 中 | Expo / Universal App 依赖告警 | 审计仍将 `@expo/cli`、`expo` 与 `zod` 列为 3 个 high 依赖节点；来源是 Expo CLI 使用的 `zod@3.25.76`（[GHSA-mrhx-c7xc-m3w5](https://github.com/advisories/GHSA-mrhx-c7xc-m3w5)）。2026-10-30 核验 npm 最新 `@expo/cli@58.1.17` 仍声明 `zod ^3.25.76`，修复版本 `>=4.6.6` 超出其范围。Expo SDK 58 同时将 React Native 目标升级到 0.88，而本项目 SDK 57 使用 RN 0.86；不能把跨 SDK/RN 升级当作安全依赖小修，也不通过不兼容的 major override 掩盖它。待 Expo 发布兼容依赖范围后处理；参考 [Expo SDK 58 发行说明](https://expo.dev/changelog/sdk-58) 与 [SDK 对应版本表](https://docs.expo.dev/versions/latest/)。 |
| 中 | SPA 旧 DOM 与 React、兼容 CSS 并存 | 2026-10-30 后续批次已移除确认弹窗、prompt templates、More、Usage、Share、Profile、sidebar 用户、Composer Tools、附件、session-list、Cmd-K、agent-run、chat-runtime、math revision 与六个 namespace window 状态桥。`app/legacyBridge.ts`、`ui/legacyShellListeners.ts`、`window.stateStore` 和兼容 CSS 仍在生产接线中；继续按领域迁移，不能据此宣称 SPA 运行时兼容边界已退役。 |
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
- Cmd-K 状态桥迁移单测 1/1 通过；SPA 构建、前端 lint、文档路径检查通过；Cmd-K 兼容、键盘、语言、焦点陷阱与 Fuse 延迟加载回归共 12/12 通过。
- agent-run store / extension 单测 11/11 通过；SPA 构建、前端 lint、文档路径检查通过；`workflow-layer.spec.mjs` 3/3 通过，覆盖真实 Explore 激活、工具流阶段推进与 analyze 隔离。
- `stateFoundation.test.mjs` 7/7 通过，含六个命名空间别名不存在及 `window.stateStore` 兼容校验；SPA 构建、前端 lint、文档路径检查通过；`chat-terminal-state.spec.mjs` 2/2 通过（桌面浅色、手机深色）。
- 本轮最终 SPA `npm run build`、`npm run lint`、`npm run lint:docs` 均通过；构建产物未纳入版本控制。
- 前端生产构建与 Universal App `export:web` 成功；最终构建后运行确认弹窗、会话列表和 tutor Playwright：29/29 通过。
- `node scripts/audit-ratchet.mjs apps/socrates` 通过（3 条已审阅 high 节点，0 条新增）；`apps/socrates` 的 `npm run export:web` 成功。
- 服务器文件上传路由集成测试需要专用 `*_test` / `*_qa` 数据库，本轮环境没有可安全使用的测试库，因此未运行该数据库套件；生产 `.env` 被安全守卫拒绝，未访问生产数据库。
- `git diff --check`、文档链接检查通过。本次没有运行生产迁移或访问生产数据库。
- 聊天运行时 window bridge 退役：SPA production build、最终 `npm run lint` 通过；`reactBridge` 与 `chatRuntimeStore` 聚焦单测 14/14、`toolRuntime` 24/24 通过。受影响的 15 个 Playwright spec 共 60 条用例最终全部通过，覆盖模块 store 发布、真实流生命周期、消息列表、工具活动、长流性能及桌面/手机布局。E2E 通过 `socrates:chat-runtime-publish` 浏览器事件驱动生产 bundle，避免依赖开发态 `/src` 路径。
- KaTeX revision window 字段退役：前端 lint 与生产构建通过；`proseRenderer.test.mjs` 1/1 覆盖 revision 变化使缓存失效、相同 revision 跨 renderer 复用结果；`demand-loading.spec.mjs` 5/5 通过，含 KaTeX 瞬时失败恢复与旧 window 字段不存在断言。
