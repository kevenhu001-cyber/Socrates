# 首屏加载性能：第三轮（2026-11-16）

本轮针对 `frontend/` SPA 的生产构建产物做加载性能收敛。范围只有构建图、启动请求序列和共享 `packages/core` 的模块边界；没有修改服务端 API、数据库、部署脚本或 CSS 层。

## 先纠正三项审计结论

审计给出的三条现状与实测不符，本轮按实测处理，避免把预算花在不存在的问题上。

| 审计结论 | 实测 |
| --- | --- |
| 首屏有 7 个 `critical-1..6.css` + `themes.css` 阻塞渲染 | 只对**源码**成立。Vite 把 7 张阻塞表合并成 **1** 个 `frontend-<hash>.css`（679.30 kB / gzip 138.28 kB），构建后的 `dist/index.html` 只有 1 条无 `media` 的 `<link rel="stylesheet">`，其余 7 条都是 `media="print" onload="this.media='all'"`。首屏 CSS 往返是 1 次，不是 7 次。 |
| `vendor-connector-icons`（264.72 kB / gzip 104.77 kB）首屏就加载 | 该 chunk 早已是懒加载：`entry-graph.json` 中不在静态闭包里（`connector-icons` 分组 + 动态 `import()`）。无需改动。 |
| 272 个 chunk 过于碎片化，应合并 React Hook 与 UI 基础件 | 266 个 chunk 里绝大多数是 `import()` 边界，不是可合并的共享模块。`vite.config.js` 的 `codeSplitting.groups` 已用 `includeDependenciesRecursively: false` 显式限定归属，注释也写明递归捕获会把 React 和共享 helper 吞进编辑器分组。按审计建议合并会把 tldraw / three / 编辑器代码拉回启动闭包，属于反向优化。 |

## 已修复

| 问题 | 修改 | 效果（gzip） |
| --- | --- | --- |
| `@socrates/core` 桶文件被启动图引入。`chat/turnClient.ts`、`chat/toolRunState.ts` 只用一个 SSE 分帧函数和一个 tool-run 契约，却把 demonstration、visualization、physics 运行时整包拖进启动 chunk | 新增 `packages/core/src/sse.ts`（`dispatchChatSseFrame` / `consumeSseBuffer`）与 `@socrates/core/sse`、`@socrates/core/toolRun` 子路径导出；Vite alias 按前缀匹配，子路径必须排在裸 `@socrates/core` 之前。桶文件保留再导出，Universal App 与懒加载消费方不受影响 | 静态 JS 343,290 → 335,966（−7,324） |
| `intelligentUiValidation.js` 为了读一个模板名清单，静态引入 41 kB 的 `visualizationNormalize.js`（连带 `visualizationMath.js`）。验证器在保存路径上（`turnRuntime.js` → 校验），所以整条链进启动 chunk | 把 `VISUALIZATION_TEMPLATES` / `CATEGORY_TEMPLATES` / `GRAPH_TEMPLATES` 抽成叶子模块 `visualizationTemplates.js`（含 `.d.ts`，保持 `z.enum` 需要的字面量元组类型）；`visualizationNormalize.js` 与 `visualizationNormalize.d.ts` 改为再导出，词表仍只有一处定义 | 静态 JS 335,966 → 327,945（−8,021） |
| 已登录用户的 Recents 要等 React 挂载 + auth 确认后才发请求 | `<head>` 预检脚本在 `/me` 返回 200 后立刻发起 `GET /api/v2/sessions?limit=200&archived=true`（`priority: 'low'`），与入口 JS 下载并行。新增 `session/bootSessions.ts` 做一次性交接：首次 `refreshServerSessions()` 取走并 `delete`，30 秒 TTL，非 2xx / 畸形响应 / 请求 reject 全部回退到原 `apiFetch` 路径（含原有重试）。用户切换或手动刷新自然回到普通路径 | 侧边栏首个有用请求提前一个 RTT；未登录用户零成本 |
| `<head>` 的 `cb` nonce 只按 `'?'` 拼接，带查询串的 URL 会拼成 `...&...?cb=` | `get(url, priority)` 按是否已有 `?` 选择 `?` / `&` | 修正 CDN 缓存键 |

## 保留不动

- **Noto Sans SC 的 100+ unicode-range 切片**保持不变（构建产物 119 个 `noto-sans-sc-*-var.woff2`，7.2–76.3 kB/片），本轮没有改动字体加载策略。
- `styles/` 的层叠契约（`themes.css` 唯一且最后、`legacy/` 与 `restore/` 只做兼容几何）未触碰。
- `vendor-connector-icons`、`vendor-tldraw`、`vendor-three`、`vendor-editor`、`vendor-markdown` 的懒加载归属未改动。

## 剩余边界（本轮不做，理由记录在此）

启动闭包剩下的最大可移除簇是**智能 UI 校验链**：`turnRuntime.js` → `intelligentUiValidation.js` → `demonstration.js`(50.5 kB) / `learningUi.js` / `intelligentUiControls.js` / `physicsModelRegistry.js`。它之所以在启动路径上，是因为 `session/beacon.ts` 与 `session/persistence.ts` 保存消息时要调 `normalizeTurnRuntime()`，而该函数对带节点的 UI surface 会调 `validateIntelligentUi()`。

`validateIntelligentUi` 会拒绝 `__proto__` / `javascript:` URL / 超限文档，是真实的安全校验，不能为了字节数删掉。要真正移除只能把它改成异步或拆到渲染边界，两者都会改变保存语义，本轮不做。后续若要做，正确方向是让 `normalizeTurnRuntime` 只做结构校验，深校验下沉到已经懒加载的 `react/intelligence-ui` 渲染入口。

## 实测数据

构建产物（`frontend/dist`，各自独立 gzip）：

| 指标 | 本轮前 | 本轮后 |
| --- | --- | --- |
| chunk 总数 | 272 | 266 |
| 静态闭包 chunk | 53 | 46 |
| `modulepreload` 链接 | 57 | 45 |
| 静态 JS | 343,290 B | **327,945 B**（−15,345 B，−4.5%） |
| HTML 链接 CSS（含 7 张延迟表） | 165,541 B | 165,541 B |
| 其中真正阻塞渲染 | 1 张，138.28 kB | 1 张，138.28 kB |
| HTML | 4,568 B | 5,017 B |

启动闭包预算断言（`e2e/performance-loading.spec.mjs`）仍为静态 JS < 360,000、链接 CSS < 210,000、合计 < 588,000，本轮之后余量从 16,710 B 扩大到 32,055 B。

## 验证

- `npm run build`（`frontend/`）通过；`npm run lint` 通过（0 error，15 条既有 warning）；`server/` `npm run typecheck` 通过（`visualizationNormalize.d.ts` 改为再导出后服务端 `z.enum` 类型不变）。
- 单元测试 70/70 通过：`bootSessions`、`turnRuntime`、`intelligentUi`、`turnClient`、`turnEvidence`、`recentsReconcile`、`visualizationSpec`、`visualization`、`sessionStore`。
- 浏览器规格 13/13 通过：`performance-loading`、`boot`、`recents-archive`、`storage-bootstrap`；随后 `performance-loading`、`sidebar-nav`、`session-start`、`session-incremental-save` 复跑通过。
- 新增 `e2e/performance-loading.spec.mjs` 用例「signed-in boot reuses the head session prefetch instead of fetching twice」：断言已登录启动只发 **1** 次 `GET /api/v2/sessions?...&archived=true`，且侧边栏渲染出预取的行。若交接失效会变成 2 次，用例失败。
- 新增 `frontend/test/bootSessions.test.mjs`（11 项）：一次性交接、30 秒 TTL 过期、时钟回拨、非 2xx、网络失败标记、畸形响应体、空列表视为有效、promise reject。
- 浏览器网络使用模拟 API。本轮结论是构建体积与请求序列，不是生产 FCP/LCP 实测。

## 事后修正：`test:shared` 抓到的一个缺陷

本轮的验证漏跑了根目录的 `npm run test:shared`（覆盖 `packages/*`），而 `frontend` 的 `test:one` 不覆盖这些包。下一轮补跑时它立刻失败：

```
ReferenceError: CATEGORY_TEMPLATES is not defined
    at visualizationTableRows (packages/core/src/visualizationNormalize.js:706)
```

原因：把词表抽到 `visualizationTemplates.js` 时，`visualizationNormalize.js` 用的是 `export { CATEGORY_TEMPLATES, GRAPH_TEMPLATES } from './visualizationTemplates.js'`。ESM 的 re-export 形式**不会创建本地绑定**，所以模块内部引用这两个常量时是未定义的。`VISUALIZATION_TEMPLATES` 因为同时有一条 `import` 而侥幸正常，掩盖了问题。

修复为「先 `import` 再 `export`」，本地绑定与再导出同时成立。教训：改动 `packages/core` 后必须跑 `npm run test:shared`，`frontend` 的测试不会覆盖它。

