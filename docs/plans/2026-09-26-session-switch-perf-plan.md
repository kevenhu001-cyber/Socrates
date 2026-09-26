# 历史会话切换性能优化方案

> 状态：方案（未实施）。生成于 2026-09-26，基于对切换链路的逐文件审查。
> 范围：`server/src/routes/sessions.ts`、`frontend/src/session/loader.js`、`frontend/src/react/message-list/*`、`frontend/src/session/serverCache.js`。

---

## 1. 切换链路现状（代码事实）

一次「点击侧边栏历史会话」经过：

1. `react/session-list/SessionList.tsx#handlePick`（TSX）→ 乐观高亮 + `getLegacyActions().sessions.loadSession(id)`
2. `session/loader.js#loadSession`（原生 JS，875 行）→ `apiFetch("/api/sessions/"+id)`
3. `server/src/routes/sessions.ts` `GET /:id`（TS/Express/Drizzle）→ `select()` 全列 sessions + 全列 messages
4. loader 同步 `forEach` 重建全部消息 → `stateStore.dispatch({type:"session/replace-messages"})`（JS store，同步 `notify()`）
5. `publishReactChatRuntime` → `react/chatRuntime.bridge.ts`（TS）commit → `MessageList.tsx` 一帧提交 N 行
6. 每行 `MessageItem.tsx#useLayoutEffect` 同步跑 postRender 钩子（含每行一次全局 `processPendingMermaid()`）
7. loader 尾部 `P_history-slice` 升级队列：每帧 `buildAssistantHtml` 重渲 2 条，直至队列清空
8. `sc.scrollTop = sc.scrollHeight` 强制全列表布局

技术栈结论：该链路为 **JS 命令式 loader → JS/TS 混合 state store → TS bridge → React 19 (TSX) 渲染** 的混合迁移态；`zustand` 在依赖中但切换热路径未直接使用。

## 2. 瓶颈定位（按影响排序）

| # | 瓶颈 | 证据 | 量级 |
|---|---|---|---|
| B1 | 详情接口响应过重：`GET /:id` 消息行携带 `content` 列——与 `html` 同源的双份序列化（写入侧 `content: sanitizeStoredHtml(m.html \|\| contentRaw)`，sessions.ts:578-580），会话行携带 `streamingReasoning`、`preview` 等详情消费方不读的列；列表接口已做 P-H2 列裁剪（sessions.ts:327-333）而详情未做 | sessions.ts:773-788 | 大型会话响应体 ~2x 膨胀，`r.text()+JSON.parse` 为主线程长任务 |
| B2 | 缓存穿透：`util/api.js` 对每个 GET 强加 `cb=Date.now()` + `no-store`（:162-168），历史会话来回切换每次全量新请求，无任何复用 | api.js:147-168 | 每次切换 = 完整 RTT + 全量解析 |
| B3 | 首屏必须等网络：`loadSession` 无「先渲染本地缓存、后台对账」路径；`storage/localMemory.js` 镜像只有 role/content 纯文本，无 html/toolCalls，无法即时重绘 | loader.js:251-258 | 点击到首帧内容 = RTT |
| B4 | React 一次性提交全部消息 + 每行 layout 副作用：`replace-messages` 单帧提交 N 百行；`MessageItem` 每行 `useLayoutEffect` 在 commit 阶段同步 `querySelector` + 全局 `processPendingMermaid()` + 4 个 postRender 遍历 | MessageList.tsx:60-96, MessageItem.tsx:86-115 | 提交帧为长任务，切换瞬间掉帧 |
| B5 | 二级长任务：`P_history-slice` 升级队列每帧仅 2 条且不分远近，100 条助手消息 ≈ 50 帧连续 `buildAssistantHtml`（marked/KaTeX/hljs），每次补丁又重写该行 innerHTML 并重跑副作用 | loader.js:624-656 | 「切换后卡一下才能滚动」的直接来源 |
| B6 | 次要放大项：`stateStore.dispatch` 每次同步 `notify()`（store.js:113，`deferNotify` 逃逸口存在但 loader 未用）；`sc.scrollTop=sc.scrollHeight` 强制全列表 reflow；`while(saveState.saveInFlight)` drain 无超时上限；详情请求无 AbortController（`saveState.loadSessionId` 只防串台不省流量） | store.js/loader.js | 每次切换多 2-3 次全量通知 |

## 3. 优化方案

### P1 服务端详情裁剪（B1）— 低风险，先行

`server/src/routes/sessions.ts` `GET /:id`：

- messages 改显式列选择：去掉 `content`（客户端 `loader.js:369-453` 只读 `html`；分享页/其他消费方以 OpenAPI 漂移检查兜底）。保留 `id, role, rawText, html, type, clientId, reasoningContent, attachments, toolCalls, createdAt`。
- sessions 行去掉 `streamingReasoning`（前端仅消费 `streamingText`，loader.js:496）与 `preview`。
- `toolCalls` 内超大字段（`output/argumentsText/stderr` 各上限 500 KB）维持存储不动，仅在详情响应里为 `results[].snippet` 之类展示字段保留现状——第一刀只砍确证的冗余列，避免行为变化。
- 同步更新 `server/openapi.json`，跑 `scripts/check-openapi-drift.mjs`。

预期：响应体积约降 40-60%（HTML 重的会话更接近 2x 收益，因 content 是 html 的近似副本）。

验证：`npm run typecheck`、`npm test`（server 聚焦 sessions 相关 suite）、`node scripts/check-openapi-drift.mjs`。

### P2 前端详情缓存 + stale-while-revalidate（B2+B3）

新增 `frontend/src/session/detailCache.js`（与既有 JS 模块风格一致）：

- `Map<sessionId, {session, builtAt}>`，LRU 上限 8 个会话 + 单会话序列化体积上限（超限不缓存），仅存归一化后的 `s`。
- `loadSession(id)` 命中缓存时：立即走既有重建路径渲染缓存版（消息带 `_fromCache:true`），同时后台 `apiFetch` 详情；对账后若无变化（比较消息 `serverId` 序列 + `updatedAt`）则不重复派发。
- 缓存失效点：`saveCurrentSession` 成功（写回新快照）、`actuallyDeleteSession`/`archiveSession`/`confirmPurgeSession`（删条目）、流式 turn 完成（该会话条目作废）。
- 对未命中缓存的会话，行为与现状完全一致。

预期：已访问过的会话切换从「RTT + 解析」降为「一帧本地渲染」；首次访问仍受 RTT 约束（由 P1 压缩）。

### P3 升级队列视口优先（B5）

`loader.js` `P_history-slice` 改造：

- 渲染完成锚底后，只对**可视区窗口内**的消息（末尾约 30 条，按 `clientId` 的 `getBoundingClientRect` 粗筛）保持每帧 2 条的即时升级。
- 窗口外的条目留在队列，改由两个触发器拉动：滚动接近时（IntersectionObserver 哨兵或 scroll 节流）+ `requestIdleCallback`（1-2s deadline 兜底），保证离屏消息最终仍被升级。
- 守卫沿用现有 `currentSessionId !== s.id → 放弃` 逻辑，切换即清空队列。

预期：切换后主线程繁忙帧数从 O(N) 降为 O(可见行)。

### P4 渲染副作用降噪（B4+B6）

- `MessageItem.tsx#useLayoutEffect`：`processPendingMermaid()` 是全局队列扫描，改为模块级「按帧合并」调度器（多次请求合并为每 rAF 一次），恢复态仅当 `html` 含 `mermaid-placeholder` 字符串时才登记请求；`processPendingViz(VizActions)` 维持 root 参数不变。
- `loader.js` 中 `state/batch` + `replace-messages` + 多次 `publishReactChatRuntime` 合并：批量派发使用 store 已有 `deferNotify` 逃逸口，收尾统一一次 notify + 一次 bridge publish（reason 保持 `session-loaded` 兼容既有测试断言）。
- `while(saveState.saveInFlight)` drain 加 2s 超时（超时后照常继续，loadingSession 守卫仍防串台）。
- 详情 `apiFetch` 传入 `AbortController`，`loadSession` 被更新的目标抢占时 abort 上一请求（现 `saveState.loadSessionId` 检查保留为双保险）。

### 明确不做（本轮）

- 消息列表虚拟化：与 `turnAnchor` 滚动锚定、流式高度、postRender DOM 回填耦合过深，单独立项。
- 移除全局 `cb=` cache-buster：它是 CDN（Tencent EdgeOne）事故的线上防御（api.js:147-161 注释），只通过 P2 应用层缓存绕过，不动传输层。
- `content` 列的 DB 清理/迁移：只停发不停写，避免迁移风险。

## 4. 实施顺序与回归口径

1. P1（服务端）→ 独立可发布，收益即得。
2. P4 副作用降噪 → 不改变数据语义，风险最低。
3. P2 缓存 → 需新增单测 `test/sessionDetailCache.test.mjs`（命中/失效/对账三分支）。
4. P3 队列改造 → 依赖 P4 的派发合并先行。

每步验证：`frontend` 聚焦 Playwright（`e2e/chat-workbench`、消息列表相关 spec，按 AGENTS.md 增量测试路由），`server` `npm run typecheck && npm test`；性能口径用 Performance 面板对比「点击 → 首帧内容」与「点击后 2s 内长任务总时长」，目标：缓存命中切换首帧 < 100 ms，长任务总量较现状降 ≥50%。
