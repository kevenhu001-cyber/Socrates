# 会话热路径运行时剖析报告（2026-09-27）

> 目的：把静态分析结论（`docs/plans/2026-09-26-session-switch-perf-plan.md` B1–B6、
> 以及新增的 S1–S4/N1 项）量化成运行时火焰图证据。
> 产物目录：`frontend/debug/perf-profile/out/2026-09-27T05-13-39-362Z/`
> （每步含 `.cpuprofile`、聚合后的 `.cpuprofile.collapsed`、可直接拖进
> chrome://devtools → Performance 的 `.trace.json`、`*.flame.html` 自耗时排行页，以及 `summary.json`）。
> 重跑：`cd frontend && node debug/perf-profile/profile-session-perf.mjs`。

## 环境与口径

- headless Chromium（Playwright 自带），`dist/` 生产构建，localhost（网络 RTT ≈ 0，
  网络耗时全部来自 mock 层的序列化体积本身）；
- 合成会话镜像生产响应形状：240 条消息（120 对，含代码块/表格/KaTeX，
  约 1/10 助手消息带 mermaid 图），消息行同时带 `content`+`html` 双份序列化，
  会话行带 4 个 ~120 KB 巨型 JSONB —— 详情响应 **1.11 MB**；
- 「首帧」= 侧栏真实点击 → `#msgList` 首次 DOM 变更（MutationObserver）；
  「settle」= 最后一次 DOM 变更；长任务 = PerformanceObserver `longtask`。
- 局限：未接真实 server/DB（服务端 S2 成本只有体积证据）、未测有网 RTT 场景、
  mock 流式为一次性 960 字符。

## 测量结果

| 步骤 | 首帧 | settle | 长任务 | CPU profile 内主要自耗时 |
|---|---|---|---|---|
| P1 切到大会议(240条,带图) | **398 ms** | **4 033 ms** | 2 202 ms + 351 ms + 70 ms (Σ2 623 ms) | mermaid 布局+DOM 读约 **2 124 ms (75%)**；DOMPurify sanitize ≈100 ms；querySelector 风暴 ≈160 ms |
| P1b 对照：同体量**无图** | 331 ms | **1 869 ms** | **304 ms ×1** | 同上但 mermaid 项 = 0 |
| P2 切到小会话(2条) | **124 ms** | 130 ms | 0 | 纯切换管线固定税，无长任务 |
| P3 再切回大会话（无缓存） | 320 ms | **4 446 ms** | 2 785 ms + 71 ms | 与 P1 几乎相同 → **零复用**证实 |
| P4 新建对话 | 168 ms | 168 ms | 106 ms ×1 | **INP≈120 ms**；resetApp DOM 同步成本；快照 stringify <1 ms |
| P5 长会话中发送消息 | 56 ms（气泡） | （窗口含后台图重建） | 76 ms ×1 | 流式本身不卡；**每轮 POST 1.06 MB/241 条** |

## 与静态结论的对照

- **B1 详情接口全列下发 — 确认**：1.11 MB → P1 列裁剪后 0.87 MB（**−21%**）；
  `content` 列就是 html 的整份副本（≈0.19 MB/会话）。1.11 MB 响应在 mock 本地
  零网络下仍让首帧落到 ~330–400 ms，说明解析+状态重建是首帧预算主体；真实网络
  下还要叠加传输时间。
- **B2/B3 零缓存 — 确认**：P3（第二次进入同一会话）与 P1 各项指标几乎一致
  （settle 4 446 vs 4 033 ms，同款 2.8 s 长任务），来回切换完全重付全成本。
- **B4 单帧提交+每行副作用 — 确认**：2 条消息的会话切换首帧也要 124 ms，且
  querySelectorAll（全局 mermaid/viz 队列扫描入口）在 P1 占 94–108 ms。
- **B5 升级队列不分远近 — 确认（最大头）**：首帧后主线程仍被占满至 ~4 s；
  其中 75% 是 mermaid 布局（`getBBox`/`getTotalLength`/`getBoundingClientRect`），
  无图对照 settle 降 **57%（4 033→1 869 ms）**、长任务降 **86%（2 202→304 ms）**。
  非图部分（marked/hljs/KaTeX 重建 + DOMPurify 每行净化）≈1.9 s 仍在，
  所以「视口优先 + 按帧合并」两项都要做。
- **S1 每轮全量重存 — 确认**：241 条消息的保存 payload **1.06 MB**，体积随
  消息数线性；且流式结束瞬间观察到**内容近似的重复 POST ×2**（可去重）。
- **S1 客户端侧成本 — 修正**：1 MB payload 的 `JSON.stringify` 仅 ~0.4 ms，
  序列化本身不是瓶颈；成本在服务端（sanitize×2 + 全量 UPSERT，S2，需真实 DB
  复测）与传输。
- **N1 新建对话 — 定量**：点击 INP≈120 ms、一个 106 ms 长任务，用户可感知的
  「顿一下」成立；保存不阻塞网络（fire-and-forget 设计有效）。
- **S3 保存放大 — 部分观测**：harness 中 POST 后的列表刷新链路被 mock 吞掉，
  未量化；保留为静态结论，实施时建议用真实环境补测。

## 结论（证据支持的优化排序）

1. **B5 升级队列视口优先 + mermaid 按帧合并**：收益最大（settle −57%、
   最长任务 −86% 的下限已由对照组给出）；
2. **B2/B3 stale-while-revalidate 会话缓存**：P3 证明重复切换零复用，命中后
   首帧可直接跳过 1.11 MB 解析；
3. **B1 详情列裁剪**：−21% 体积，与 2 正交，先行的服务端一刀；
4. **S1 保存增量化 + 去重双 POST**：1 MB/轮 的写放大在长会话流式结束时是
   主要后台负载；
5. B4 每行 layout 副作用：小会话 124 ms 的固定税说明它对轻会话也值得做。

---

## 实施结果（同日，2026-09-27）

按证据顺序落地了 P1–P4（前端 + 服务端），产物目录 `2026-09-27T05-13-39-362Z`（before）
对比 `2026-09-27T06-06-46-852Z`（after）。

| 改动 | 位置 | 做法 |
|---|---|---|
| B4 mermaid 按帧合并 | `render/viz.js` `schedulePendingMermaid` + `MessageItem.tsx` | 每行 layout effect 不再各自跑全局 `processPendingMermaid`；一帧内多次请求合并为一次 rAF 排空 |
| B4 每行全局查询 | `MessageItem.tsx` | `document.querySelector('[data-client-id] .msg-body')` → React `useRef`，去掉提交阶段 N 次全文档查询 |
| B5 视口优先 | 新增 `session/historyUpgrade.js` | 队列改 tail-first（锚底后可见的新消息先重建，2/帧 rAF）；屏外旧消息走 `requestIdleCallback`(timeout 2s) 兜底；保留 session-id + slot 身份守卫 |
| B2/B3 SWR 缓存 | 新增 `session/detailCache.js` + `loader.js` | 命中缓存即时渲染 + 后台对账（签名一致则不二次派发）；LRU 8 / 单条 3MB / TTL 10min；save/delete/archive 处失效 |
| B1 详情列裁剪 | `server/routes/sessions.ts` `GET /:id` | messages 改显式列选择，剔除与 `html` 重复的 `content` 列（−17% 体积）；OpenAPI 漂移对 baseline 干净 |
| S1 双 POST 合并 | `session/persistence.js` | 记住上次实发 payload 签名，字节相同的重存直接跳过（省一次全量 POST + PATCH + 200 行列表刷新） |

### 前后对比（median of 2 after-runs，headless 有噪声）

| 指标 | before | after | 变化 |
|---|---|---|---|
| P3 切回已看过的大会话·最长任务 | 2 785 ms | ~250–300 ms | **−90%** |
| P3 切回·settle | 4 446 ms | ~1 640–1 690 ms | **−63%** |
| P1b 无图会话·settle | 1 869 ms | ~1 610–1 700 ms | −9~14% |
| P2 小会话·首帧 | 124 ms | ~93–101 ms | −20% |
| P1 首访·最长任务 | 2 202 ms | 2 0–2.4 s（噪声） | 基本不变 |

**未变的部分（有意保留）**：P1 首访最长任务仍 ~2 s，剖析归因显示其主体是**一次性 `ensureMermaid()` 加载并求值 3.5 MB mermaid 包 + 首帧内可见图渲染**（对照：P1b 无图 = 286 ms、P3 已加载后 = 299 ms，反证 mermaid 冷加载是主因），以及「240 行单帧提交 + `scrollTop=scrollHeight` 强制回流」。这两项分别对应被本轮明确暂缓的 **mermaid 视口内惰性加载（IO 门控）** 与 **列表虚拟化**——改造半径大，需单独立项，不在本次低风险批次内。

### 验证

- 新增单测：`test/historyUpgrade.test.mjs`（6）、`test/sessionDetailCache.test.mjs`（7）全绿；
- 回归单测：vizPark、messageActions 全绿；服务端 sessionSanitizer/sessionOwnership（11）全绿；
- `tsc --noEmit` 前端+服务端均 0；`eslint` 改动文件 0 error（仅仓库既有风格的 empty-block 警告）；
- `check-openapi-drift.mjs` 对 baseline 干净；`vite build` 成功；
- 聚焦 e2e：`history-rich-content`（含 mermaid/viz 历史重建）、`message-list-compat`、`streaming-render` 共 13 项全绿。
