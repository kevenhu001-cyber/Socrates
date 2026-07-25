# 重构后全面代码审计报告（2026-07-25）

范围：`frontend/src/main.js`（8144 行）为核心，配套 `state.js` / `tutorSocratic.js` / `windowExports.js` / `config/providers.js`，服务端 `server/src/routes/sessions.ts` 契约，及 `vite.config.js` 配置一致性。
方法：函数级索引 + 关键流程精读（会话保存/加载、诊断流程、教学状态机、流式聊天、resetApp/signOut 生命周期）+ 前后端字段契约逐项核对。

旧报告勘误：`docs/audit-report.md`（2026-06-23）引用的行号（main.js:7562/9759/10001 等）在重构后已全部失效；其中 DOMPurify、代码分割、requireAuth 等高危项已在当前代码中修复，不再重复列出。

---

## 一、已修复问题（本次提交）

### F1 [高] 加载会话时模式恢复被旧模块绑定覆盖 — main.js loadSession
`appMode` 是从 `config/providers.js` 导入的**只读活绑定**。旧代码：
```js
if(s.mode==="chat"||s.mode==="tutor"){window.appMode=s.mode;}
try{window.appMode=appMode}catch(_){}   // ← 用旧模块值立即覆盖回去
```
只写了 `window.appMode`，未通过 `setAppMode()` 更新模块绑定，紧接着的同步行又用**旧值**覆盖 —— 从 chat 模式点开一个 tutor 会话（或反向）永远不会真正切换模式，后续 `askChatTurn` / `submitChatMessage` 全部按错误模式分支。
**修复**：改为 `setAppMode(s.mode)` 后再同步 window 镜像。

### F2 [高] reasoningContent 字段名蛇形/驼峰不匹配 — main.js loadSession
保存链路（doSave → Zod schema → Drizzle 列 `reasoningContent`）全程驼峰；GET /api/sessions/:id 返回 `db.select()` 原始行，属性名是 schema 键 **`reasoningContent`**（`reasoning_content` 只是 SQL 列名）。但加载端读的是 `m.reasoning_content` → 恒为 undefined，**每次重载会话，推理模型的思考内容全部静默丢失**（且下一轮 LLM 上下文也拿不到）。
**修复**：`m.reasoningContent || m.reasoning_content || null`（保留蛇形兜底兼容历史 payload）。

### F3 [中] signOut 清理时同样的 stale-binding 使 P_tutor-leak 修复失效 — main.js clearPerUserClientState
```js
try{window.appMode="chat"}catch(_){}
try{window.appMode=appMode}catch(_){}   // ← 模块值若是 "tutor"，又改回 tutor
```
注释声称"清空 runtime mirror 使新用户从 chat 默认开始"，实际两行执行完 `window.appMode` 又变回旧值 —— 换用户串模式的 bug 只清了 localStorage 一半。
**修复**：`setAppMode("chat")` 后再同步。

### F4 [中] resetApp 未清 `_pendingChatContent` / `_pendingAttachments` — main.js resetApp
`askChatTurn` 优先消费 `window._pendingChatContent`（多模态 parts 优先于文本参数），且消费后**不清除**。re-explain 分支路径（`branchFromMessage → resetApp → askChatTurn(reExplainMsg)`）不经过 submitChatMessage，会把上一会话最后一次发送的图片 parts 当作本回合内容重放给模型。`loadSession`（经 resetSessionTransients）和 handleAuthExpired 都清，唯独 resetApp 漏了。
**修复**：resetApp 在 resetState 前清空两个 window 挂载。

### F5 [中] resetState 遗漏字段导致跨会话状态残留 — state.js
- `session.branchedFrom`：新会话首次保存会把上一个分支会话的 "Branched from…" 元数据写进服务器。
- `tutorAttachments` / `tutorPartsTemplate`：tutor→chat→tutor 序列会把旧会话附件喂进新诊断/教学 LLM 调用。
- `ui._examInView`：低危 UI 残留。
**修复**：三组字段加入 resetState。`exam._examScrollBound` **有意不复位**——它跟踪监听器是否已绑定，复位会导致重复绑定。

### F6 [中] tutor 教学阶段标签语言检测失效 — tutorSocratic.js currentLang
真正的语言源是 `window._currentLang`（i18n.js setLang 维护），但 currentLang() 只查从未被赋值的 `window.getAppLang` / `window.APP_LANG`，最终 fallback 到 index.html 硬编码的 `lang="en"` —— **中文用户的阶段标签（直觉动机/精确定义…）恒为英文**。
**修复**：`window._currentLang` 加入检测链首位。

**验证**：3 个文件 ESM 解析通过；`npm run build`（Vite）4.01s 构建成功，无 import 断裂。

---

## 二、建议项后续处理（第二轮，已全部落地）

首轮报告中 R1–R5 均为"已确认但未修改"，第二轮续跑已全部实施并验证：

### R1 [中→已修复] 教学状态机字段服务端持久化 + Zod 校验
此前 `SessionPayloadSchema.passthrough()` 对 `teachingStage`/`teachingPlan` 等字段零校验，且路由从不写库——**教学进度每次重载都静默重置**（前端一直在发、一直在读，服务端一直在丢）。
**修复**（标记 `AUDIT-R1`）：
- `schema.ts`：sessions 表新增 8 个可空列（`teaching_stage`/`current_example_idx`/`practice_attempts`/`practice_phase`/`teaching_plan`/`boundaries_history`/`mistake_filter`/`branched_from`）；
- 迁移 `drizzle/0023_teaching_state.sql`（`ADD COLUMN IF NOT EXISTS`，全部可空，旧行由客户端兜底 motivate/0/foundation/null）；
- `sessions.ts`：Zod 补显式定义——`teachingStage` 用 enum + `.catch(undefined)`（损坏值降级为不存，而不是 400 毁掉整次保存），数值字段加上限，insert 与 `onConflictDoUpdate` 两侧均写入。

### R3 [低→已修复] cancelDiagnostic 残留 topic + 空壳会话行 — main.js
**修复**（标记 `AUDIT-R3`）：取消时先清 `state.topic`/`state.phase` 并置空会话 ID（经 state.topic 守卫阻断后续保存），再等 `_saveInFlight` 排空后 DELETE 服务器空壳行（避免 DELETE 输给自己的 POST），并写入墓碑 `rememberDeletedSession` 防复活。

### R4 [低→已修复] `_pendingChatContent` 消费后不清零的重试竞争 — main.js askChatTurn
**修复**（标记 `AUDIT-R4`）：askChatTurn 顶部读取后立即 `window._pendingChatContent=null`（consume-once）；onRetry 闭包捕获本回合的本地快照并在重入前恢复，保证"重试本回合"仍带本回合自己的附件而非全局最新值。

### R5 [低→已修复] tutor 诊断阶段 phase 可能存成 "chat" — main.js startSession
**修复**（标记 `AUDIT-R5`）：Begin 时按模式显式打标 `state.phase=(appMode==="chat")?"chat":"diagnostic"`，先于 P_recents-auto 首次自动保存；教学正式开始时 proceedToTeaching 再翻到 "chat"。

### R2 [低→已修复] vite proxy 3037 vs 服务端默认 8080 未文档化
**修复**（标记 `AUDIT-R2`）：`vite.config.js` proxy 目标改读 `process.env.API_PORT`（默认仍 3037 保持现有环境不变）；`frontend/README.md` 新增 "Local development" 一节说明两种启动组合（`API_PORT=8080 npm run dev` 或 `PORT=3037 npm start`）。

### 附：第二轮回归修复
第二轮编辑期间 `askChatTurn` 中 `var result=await callAPIStream(...)` 行在 R4 改写时意外丢失（构建报 3423 行语法错误），已按 git HEAD 原样恢复该行并保留 R4 的 consume-once 逻辑。

**第二轮验证**：`server` tsc（tsconfig.build.json）0 错误；`frontend` `npm run typecheck` 0 错误；`npm run build`（Vite）3.80s 构建成功。

## 三、验证通过、无需修改的项
- 保存管线竞争防护完整：`_saveInFlight` 合并、`_saveDirty` 级联、`_deletedSessionGuard` 墓碑、`capturedSessionId` 快照、`_loadingSession` 守卫、loadSession 排空循环 —— 逐条推演无窗口泄漏。
- `loadSession` 的 `_loadSessionId` 过期检查正确防止了快速切换会话时旧响应覆盖新状态。
- startSession 的 P_new-session-context-leak 序（清 messages → 保存 → 清 transients → abort 旧流）正确。
- tutorSocratic 全部 11 个导出函数与 main.js 调用签名匹配；data-action handler 桥接 0 缺失；前端调用的 API 端点在服务端全部存在。
- 服务端 2026-07-07 审计的 H1（依赖 CVE）、H3（loginLockout 进程内 Map）、H4（SSRF）等项仍然有效，见 `tasks/evidence/2026-07-07-full-audit.md`，不在本次前端审计范围内重复。
