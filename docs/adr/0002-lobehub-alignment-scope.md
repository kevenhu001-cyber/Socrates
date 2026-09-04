# ADR 0002 — LobeHub 对齐范围与完成状态（M1–M4）

- 状态：Accepted（M1/M2/M3/M4 核心已落地；余项见"延后"）
- 日期：2026-09-04
- 关联：`docs/adr/0001-spa-react-alignment.md`

## 背景与目标

对照 LobeHub 的系统性架构，在四个方向对齐：前端状态/渲染架构、服务端
pipeline 化、协议与共享层、体验能力（云 TTS/模型选择/性能）。

## M1 — 前端架构（已落地核心）

1. **Zustand 域状态层**：`frontend/src/store/createDomainStore.ts` 以
   Zustand 5 vanilla store 作为六个状态命名空间（session/kb/search/
   call/ui/exam）的快照持有者，逐位复刻 `createImmutableBridge` 契约
   （RAF 合批、单调 revision、浅冻结、reducer 异常保底、
   `__resetForTests`）。`state/bridges.ts` 改由该工厂构建，导出
   `xStore`（zustand store）；`state/store.js` 门面、`window.stateStore`、
   e2e mock、既有单测全部零改动。
2. **类型化域 hooks**：`frontend/src/store/index.ts` 暴露
   `useSessionStore/useKbStore/...`（LobeHub slice 模式），供新/迁移中的
   React 岛直接消费。
3. **构建分包**：`vite.config.js` 将第三方库拆为 `vendor` /
   `vendor-react` chunk，app 代码更新不再击穿 vendor 缓存；新增
   `store` chunk。
4. **基线**：`docs/react-typescript-migration.md` 追加 M1 基线指标
   （main.js 9,902 行 / window 绑定 200+138 / `__socrates*` 桥 98 个），
   M1 完成定义 = 指标清零。

### 延后（属 M1 范畴的长期工作）

- main.js 逐岛迁移与 window 桥清零——必须一岛一测，见基线清单。
- virtua 虚拟化消息列表——`msgList` DOM 契约被大量 e2e 依赖，需在
  岛迁移完成后进行。

## M2 — 服务端 pipeline 化（已落地）

1. `routes/chat/stream.ts`（1,369 行单 handler）拆为
   `routes/chat/pipeline/`：
   - `types.ts`（共享类型）、`sseEmitter.ts`（SSE 帧写入 + abort 守卫）、
     `toolContext.ts`（turn policy + registry + schema/examples）、
     `toolExecutors.ts`（逐工具执行器）、`toolFeedback.ts`（模型侧结果
     内容组装）、`runChatStreamPipeline.ts`（编排：SSE 生命周期 →
     工具循环 → 收尾）。
   - 路由文件只剩中间件门禁、会话归属、请求准备。行为逐字保留
     （帧格式、守卫语义、记账、streaming_text 清除时机）。
2. `index.runtime.ts` 启动序列拆为 `boot/startup.ts`（validate →
   db → seed → validate keys → background tasks）与 `boot/lifecycle.ts`
   （优雅关停 + 进程安全网），入口只做排序。

## M3 — 协议统一 + RAG（已落地核心）

1. **tool-run 契约上提**：`packages/core/src/toolRun.ts` 持有
   ToolRun/ToolRunSummary/相位机与 `createToolRunApi(wasmBinding?)`
   工厂（WASM 绑定惰性注入）。桌面端 `chat/toolRunState.ts` 变薄封装；
   RN/服务端可用纯 TS 参考实现；parity 测试继续以纯 TS 为基准。
   前端经 `file:` 依赖 + vite alias + tsconfig paths 以源码形态消费。
2. **RAG 检索核心**：`server/src/services/rag.ts` — 段落优先、带重叠
   窗口的 chunker + BM25 评分检索（纯函数、零基础设施依赖），为后续
   持久化 chunk 索引与 embedding 重排打地基。

### 延后

- 插件架构：`/api/plugins` 已存在路由，但 LobeHub 式的插件市场/运行
  沙箱超出本轮；待 chunk 索引落地后另立 ADR。
- session_chunks 表 + pgvector：需要一次带 DB 验证的 drizzle 迁移，
  不在本轮盲改 schema。

## M4 — 体验能力（已落地）

1. **云端 TTS 朗读**：新增 `POST /api/tts`（`routes/tts.ts`，requireAuth
   + chatLimiter，20 KB 输入上限，OpenAI 兼容 `/audio/speech` 转发，
   音频流直通、不落盘；失败契约 501/429/502）。客户端
   `ui/readAloud.js` 云优先、平台 `speechSynthesis` 自动回退，连续失败
   两次后本会话停用云端路径。
2. **模型选择器**：既有 effort/model picker UX 保持；移动端
   composer 参考布局的两处既有 spec 失效已在 M1 基线修复（标签
   「工作」→「辅导」+ `P_hide-mode-switch-in-conversation` 过宽选择器
   恢复落地页可见）。
3. **性能**：vendor 分包（见 M1-3）+ 既有 code splitting。

### 延后

- 云 TTS 的 provider 能力探测（当前假定内置 provider 暴露 OpenAI
  兼容 speech 端点；MiniMax 原生 TTS 需单独适配）。

## 测试门

- frontend：`npm run lint`、`npm run test:unit`、`npm run build`、
  Playwright 全量（171）。
- server：`npm run typecheck`、`npm run build`、`npm test`（全量，
  含新增 `test/rag.test.js`）。
- frontend 新增 `test/domainStore.test.mjs`（工厂契约 + 门面集成）。
