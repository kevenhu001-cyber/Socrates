# 启动稳定性 + 用量弹窗审计（2026-03-14）

范围：`frontend/index.html`（第三方 CDN 脚本加载策略）、`frontend/src/ui/usage.js`（用量弹窗 i18n 时序）、`frontend/e2e/*.mjs`（Playwright 运行时探针）。
方法：浏览器探针（mocked auth + stubbed `/api`）实测启动时序、CDN 挂起/拦截场景、完整 UI 遍历；`npm run lint` / `npm run build` / `npm run test:unit`（120 通过）回归。

---

## 一、已修复问题

### B1 [高] CDN 脚本阻塞应用启动 — index.html
`index.html` 在 module bundle 之前以**同步经典 script** 引入 8~10 个第三方 CDN 库（marked、DOMPurify、katex、mhchem、auto-render、mermaid、echarts、plotly、highlight、fuse）。任一 CDN 请求挂起（不返回也不失败）都会阻塞 HTML 解析 → module 永不执行 → 应用永远停在空白页 / 登录门，且控制台无任何错误（超时都耗在浏览器对 CDN 的等待上）。
**复现**：`probe-cdn-blocked.mjs`（全拦 CDN → 68ms 正常启动，fallback 齐全）证明问题在“挂起”而非“失败”；`probe-hang-cdn.mjs`（挂起单个 CDN 请求）在修复前可稳定复现整页不启动。

**修复**：给全部第三方 CDN `<script>` 加 `defer`。注意 **不能** 用 `async`：mhchem / auto-render 加载时同步读 `window.katex`，执行顺序敏感，`async` 会破坏顺序；`defer` 保序且不阻塞解析。同步更新了 `vite.config.js` 中相关过时注释。`npm run build` 成功；线上 `dist` 与 4173 静态服务均已确认 10 个 CDN script 带 `defer`。

**修复后验证**（`probe-hang-cdn.mjs`，挂起 fuse.min.js）：
- `bootState=app`、shell 可见、`/api/auth/me` 等全部请求正常发出 —— 挂起的 defer script 不再阻止应用脚本执行。
- 挂起一个 defer script 会阻塞其**之后**所有 defer script（浏览器标准行为，`DOMContentLoaded` 也不触发），所以 `mermaid/echarts/plotly/hljs/Fuse` 为 undefined；但应用对这些库全部有降级 fallback（`probe-cdn-blocked.mjs` 已验证），启动不受影响。
- 探针的 `goto` 超时是**预期**的（挂起 defer 按定义卡住 DCL），由探针 catch 并报告，非应用缺陷。

**遗留**：`defer` 只解决“挂起不阻塞启动”。挂起仍会卡住 `window.load` 事件与后续 defer 库（mermaid/plotly 等可视区块会降级）。若需彻底消除 CDN 依赖，可将这些库本地化或改动态 import，见“后续建议”。

### B2 [高] 用量弹窗打开即抛 TypeError — src/ui/usage.js
`openUsageModal()` 打开时 `loadUsageData()` 调用 `t("usage.loading")`，抛 `TypeError: jo is not a function`（minified `t`）。**根因**：模块顶部
```js
const t = (typeof window !== "undefined" ? window.t : null);
```
在**模块求值期**捕获 `window.t`。但 `main.js` 最先 import `windowExports.js`（侧效应 import，防 tree-shake），而 `windowExports.js` 又 import `usage.js` → 此时 `i18n.js` 尚未求值、`window.t` 还是 undefined → `t` 被捕获为 `null`。等用户真正打开弹窗时 `t(...)` 必然是 `null(...)`。全代码库其他模块都用**调用期惰性读取**（`typeof window.t === "function" ? window.t(k) : k`），唯独 usage.js 用模块期捕获。
**复现**：`probe-full.mjs` 遍历弹窗时 `openUsageModal -> threw:TypeError: jo is not a function`。
**修复**：改为惰性函数 `function t(key){ return typeof window !== "undefined" && typeof window.t === "function" ? window.t(key) : key; }`，与 codebase 一致。修复后 `probe-full` 中 `openUsageModal -> ok`，且发出 `/api/usage/*` 请求（2 次）。

---

## 二、探针排查结论（非应用 bug）

`probe-full` 初版有 3 个 click 超时，逐一定位均为**探针脚本时序/环境问题**，不是应用缺陷：

1. **tutor 模式切换按钮不可见**：`.app-mode-toggle` 位于顶栏，只在 topic-setup 视图显示；探针在 Start（进入 chat 视图）之后才去点它 → 不可见。应在 Start 之前切换。
2. **navExam 被 moreNavPopover 遮挡**：探针点开 `#navMore` 弹层后未关闭就去点 `#navExam`，弹层遮住目标。真实使用中点击弹层外会先关闭它。
3. **chat composer 不可见**：`openNav()` → `hideChatAndTopic()` 会隐藏 `#chatView`（导航到工作区面板是预期行为）；探针在打开 Library/Projects 面板后未返回 chat 视图就去点 composer。修复探针：导航遍历后 `hideMainPages()` + 恢复 `#chatView`。

另外：tutor 模式 Start 后会先弹“先厘清你的知识边界？”对话框（`tutor/policy.js requestTutorExploration`）→ 探针需点“直接开始”；随后进入诊断加载阶段（stubbed 后端下诊断永不完成，composer 保持隐藏）——都是预期交互，非 bug。`probe-start-session.mjs` 覆盖该路径（chat 模式 Start 后 composer 正常可见，session id 生成正常）。

**结论**：修复后的 `probe-full.mjs`（chat 模式全流程：topic→Start→导航→全部弹窗含 usage→chat 发送→主题/显示偏好→侧栏搜索→分享弹窗）**NO ERRORS**。

---

## 三、探针文件清单（frontend/e2e/）

- `probe-boot.mjs` / `probe-ui-state.mjs` — 最小启动：哪些 `/api` 请求、bootState、DOM 可见性。
- `probe-runtime.mjs` — debug 模式运行时遍历。
- `probe-cdn-blocked.mjs` — 全拦 CDN 验证降级启动。
- `probe-hang-cdn.mjs` — 挂起单个 CDN 验证不阻塞应用启动（含 route 注册顺序注释：Playwright 逆序匹配 route，`**/*` 必须先注册，否则会遮蔽 `/api/**` mock——早期 `bootState=auth` 假象即由此产生，非应用 bug）。
- `probe-full.mjs` — 完整 UI 遍历，现为可靠回归探针。
- `probe-start-session.mjs` — Start 后视图状态转移诊断（chat / tutor 两路径）。

---

## 四、回归

- `npm run lint`（tsc --noEmit）✓
- `npm run build`（Vite）✓
- `npm run test:unit` 120/120 ✓（`[socrates-wasm] init failed … fetch failed` 为测试环境 file:// 无法加载 wasm 的既有噪音，自动 fallback 到 TS 逻辑，与本次改动无关）

---

## 五、后续建议

1. **CDN 本地化/动态加载**：`defer` 解决了“挂起阻塞启动”，但挂起仍卡住 `load` 事件与后续 defer 库。可将 mermaid / echarts / plotly 改为按需动态 `import()`（仅渲染对应区块时才拉取），从根上消除启动对 CDN 的依赖。
2. **i18n 时序**：`window.t` 在模块期被捕获是脆弱模式，建议在 `windowExports.js` import `usage.js` 之前先 import `i18n.js`，或对 `usage.js` 增加一个单测锁定“在 `window.t` 未就绪时调用 `t()` 不抛错”的行为。