# 2026-11-04 — 侧边栏统一与 UI 动态渲染一致性

状态：**Pass 1 + Pass 2 + Pass 3（第一批）已落地并通过合并验证（2026-11-04）** · 范围：`frontend/` · 前置分析：2026-11-04 会话（graphify + 三路代码探索，证据均带 file:line）

## Pass 3 落地记录（第一批）

| 动作 | 结果 |
|---|---|
| **R6 修复**：`react/message-list/visibleMessages.ts` 重写为增量计算。`reconcileMessageSnapshots` 对未变行保持对象身份，每次 commit 只换数组引用、尾部变化——身份游标找到分割点后，前缀的 id/可渲染性/去重结论全部继承，每帧成本从 O(N) 全量 filter+dedupe+entryId 降为指针游走 + O(tail) 实算；元素全等时直接复用上一个 visible 引用（顺带消除同内容不同引用造成的多余 React 渲染）。抽出纯函数 `visibleFromMessages` 并新建 `test/visibleMessages.test.mjs`（6 用例：全量过滤/去重、追加复用、流式尾部替换、全等复用、中段删除回退、counts 单调性）。顺手补齐两处缺 `.ts` 扩展名的导入（此前该文件在 node strip-types 下不可测的根因）。 | 单测 6/6；streaming-render / message-list-compat / chat-send / chat-stop-resend / sidebar-compat 32 项全绿；performance-streaming / performance-interaction 7 项全绿（4× CPU 降速下 longTasks 50-58ms，prefixPreserved） |
| **R8 修复**：`AssistantTurn` 的 `callsForMessage` 与 `buildTurnLayout` 以 `message` 身份 memo 化——reconcile 语义保证"未变行保持引用、变更行产出新冻结对象"，memo 等价于"行未变则不重建布局"，消除父级重渲染（isLatest 翻转、mathRevision 等）引发的无谓重建；流式行随 rawText 增长仍按需重建。原注释"records mutate in place"经查证已被 reconcile 冻结快照设计取代。 | lint + build 通过；message-list 系列单测与 e2e 全绿 |
| **IconButton 死原语删除**：`react/ui/IconButton.tsx` 零真实消费（仅 index.ts 转发；openui/controls.tsx 的同名组件属另一套系统），删除文件与转发。按钮语法收敛（ADR 0024）的第一步。 | check-shadcn-adoption / check-button-primitive 基线不变 |
| **shadcnVarReads 计数器**：css-debt 新增第 7 个指标（shadcn 语义词表 `--foreground/--muted-foreground/…` 的读取数），锁定双词表现状：live 779 / frozen 224，只收缩不放宽。themes.css 的读取是特许桥接（它发布一个词表的另一词表投影），计数含它但永不作为迁移目标。基线 `--update` 顺带收缩：literalFontSize live 60→59。 | 守卫通过；`npm run lint` 全链 0 |
| **R9 复评 ✅ 结论修正：保留**：`socrates:chat-runtime-publish` 是 e2e 注入通道（`e2e/_lib.mjs:112`、`performance-streaming.spec.mjs:51` 由测试派发），`socrates:chat-runtime-changed` 是 react-compat 规格的监听断言目标（:74,110）——两者都是集成契约而非冗余，审计项撤销。 | 无代码变更 |

### Pass 3 剩余积压（各自独立立项，按优先级）

1. **观察器收窄**（R3 残余）：`composerShape.ts`（attributes 记录的 closest 祖先遍历）、`markdownCodeCopy.ts`（document.body 子树 → 消息容器）、`sidebar/nav.ts`、`linkFavicons.ts`。
2. **冻结 CSS 消化**：`restore/chatgpt-ui.css`（1292 行）为下一批；用 Pass 2 的"旧/新位置双解胜者"级联校验法逐块验证（注意碰撞检测必须覆盖所有前置层，含 parity 的无条件规则）。
3. **合并文件死声明清扫**：`polish/mobile-sidebar.css` 内已知的死声明（如被 `#sidebarNav` 特异性压制的 `.sidebar-nav-btn.active` 背景），用同法验证。
4. **移动端字面量换 token**：`polish/mobile-*` 裸 px → 既有阶梯 token（同值替换，reference-ui-visual 钉住）。
5. **backdrop-filter 29 处合并**（P6.4）。
6. **R7（审计 R9）历史游标分页**：1000 行冷启动 357ms 长任务的根因解。

## Pass 2 落地记录

- 变更面：`components/sidebar.css`（340→174 行，仅剩菜单 charter）、`polish/sidebar.css`（645→385 行，移动块清零）、`polish/mobile-sidebar.css`（267→717 行，唯一侧边栏移动 owner）、`polish/mobile.css`（border-right 迁出）、`check-mobile-css.mjs` 白名单 5→2。
- 验证：DOM 级 3114 节点 × 6 场景 0 差异；CSS 静态级 145 组声明 0 翻转；`npm run lint` exit 0（css-debt live literalFontSize 60→59，ratchet 顺势收缩）；`npm run build` exit 0；聚焦规格 sidebar 五项 + mobile-ui-alignment 共 35 项通过。`reference-ui-visual` 的 composer 工具菜单宽度断言（390>260）经 stash 对照确认为 **HEAD 既有失败**，与本次改动无关。
- 有意行为差量：无（合并全程级联中性，唯一一处意外翻转被验证工具捕获并修正）。

## Pass 1 落地记录

- 变更面：22 个文件（1 新增 `sidebar/breakpoints.ts`，2 守卫脚本，19 处源码/CSS），见 `git status`。
- 合并验证结果：`npm run lint` exit 0（含新 duplicatePairs 28 对 + mobile-css 侧边栏守卫）；`npm run build` exit 0；bundle 守卫通过（entry 304KB/860KB）；单测 modalA11y / sessionListState / recentsReconcile 通过；`test/intelligentUi.test.mjs` 失败经 stash 对照确认为 HEAD 既有问题（packages/core 无扩展名导入的 loader 问题，与本趟无关）。
- Playwright（--workers=1）全绿：sidebar-nav / sidebar-resize / sidebar-rail / sidebar-compat / sidebar-light-theme（29）、streaming-render / message-list-compat / chat-send（20）、chat-preparation + mobile-ui-alignment（11，覆盖 `window.renderRecents` 发布与移动抽屉断点）。
- 行为差量（有意）：768px 宽（iPad 竖屏）从"JS 桌面 + CSS 移动"统一为移动抽屉；MistakeBookPanel 相对时间文案改用统一 formatter（"Yesterday"→"1d ago"、>7 天 locale 日期→"Nw/Nmo ago"）。

## 0. 背景

对项目做了一轮 UI 现状审计，确认三类问题：

1. **侧边栏**：状态多源真相、渲染路径 React/legacy 割裂、代码重复、CSS 五文件归属靠级联顺序。
2. **UI 动态渲染**：流式热路径上的 O(N) 全量扫描、常驻 document 级 MutationObserver、双重渲染、观察器泄漏。
3. **UI 统一规范**：冻结层 10.5k 行仍在线上级联、双 token 词表、按钮语法碎片化、移动端字面量密度。

已有资产健康：state-ownership / react-globals / button-primitive / font-weight ratchet 基线均为 0；`check-surface-ownership.mjs` 已确立 parity/ = 桌面 owner；css-debt 是唯一还带非零 live 基线的守卫（literalFontSize 60、stackedId 41）。

## 1. 问题清单（证据）

### 1.1 侧边栏

| # | 问题 | 证据 |
|---|---|---|
| S1 | 打开状态**三重真相**：zustand `isOpen` ↔ `#sidebar.collapsed` ↔ `localStorage['socrates-sb']`；4 个写入方（service toggle、boot hydration、resize auto-collapse、sign-out reset），reset 路径改 class 不同步 store | `sidebar/sidebar.service.ts:122-156`、`ui/sidebarChrome.ts:40-54`、`ui/sidebarResize.ts:202-209`、`app/lifecycle/reset.ts:105-112` |
| S2 | **断点三分裂**：`DESKTOP_SIDEBAR_BREAKPOINT = 769` vs 裸 `< 768` vs 裸 `<= 768`；同一函数内 `>=769` 判桌面、`<768` 判 backdrop；**768px（iPad 竖屏）落在无人区** —— JS 判桌面、CSS（`max-width: 768px`）判移动 | `sidebar.service.ts:5,126,140,166`、`ui/sidebarChrome.ts:19`、`ui/sidebarResize.ts:102,203,209`、`sidebar/navigation.service.ts:21`、`react/sidebar-chrome/useMobileViewport.ts:26`、`app/lifecycle/reset.ts:105` |
| S3 | **7 处 `window.renderRecents` 包装器**（"优先 window、回退 import"同一模式各写一遍） | `session/recents.ts:59-68`、`session/organize.ts:45-51,245`、`session/persistence.ts:136-142`、`chat/sessionBootstrap/runtime.ts:31-39`、`app/lifecycle/clientState.ts:30-33`、`session/rowActions.ts:29`、`auth/postAuth.ts:55,86`、`sidebar/sidebar.service.ts:105-106` |
| S4 | **`formatRelativeTime` 两份实现且行为已漂移**（"just now"/Yesterday/locale-date vs "Just now"/周月桶） | `ui/recentsHelpers.ts:1-12`、`react/session-list/sessionList.store.ts:31-49` |
| S5 | React 组件内直改外部 DOM（`search-open` class），无单一投影 | `react/sidebar-chrome/SidebarHeader.tsx:66-74` |
| S6 | 移动端侧边栏 CSS 散在 **3 个 live 文件**（components + polish/sidebar + polish/mobile-sidebar），同名状态三种 token（`.sidebar-nav-btn.active` → raised/surface/selected，靠 `#sidebarNav` 特异性裁决）；`check-mobile-css.mjs` 不覆盖 sidebar | `styles/components/sidebar.css:47`、`styles/polish/sidebar.css:334`、`styles/polish/mobile-sidebar.css:112` |
| S7 | parity/polish 桌面 owner 约 20 对同名选择器仅靠 import 顺序维持一致，无结构性防护 | `check-surface-ownership.mjs` 的 `duplicatePairs` 目前仅 2 条 |

### 1.2 UI 动态渲染

| # | 问题 | 证据 |
|---|---|---|
| R1 | 每个流式提交帧 O(N) 全量消息数组扫描（审计 R6，未修） | `state/bridges.ts:88-91`、`state/visibleMessages.ts:21-34`；~30 帧/秒 × 3 次全数组遍历 |
| R2 | 代码块控制条**双重渲染** + 全文档 MutationObserver 每新增节点跑 `querySelectorAll` | `render/markdownCodeCopy.ts:29-30,81` |
| R3 | 4 个常驻 document 级 MutationObserver 挂在流式热路径 | `sidebar/nav.ts:215`、`ui/composerShape.ts:113-119`、`render/markdownCodeCopy.ts:81`、`ui/linkFavicons.ts:140-152` |
| R4 | `IntelligentTextSegment` 每次渲染裸调全文切分，无 memo | `react/intelligence-ui/IntelligentTextSegment.tsx:47` |
| R5 | `installModalA11y` 的 class MutationObserver 不存引用、不 disconnect（HMR/重复接线会叠加） | `ui/modalA11y.ts:188-193` |
| R6 | SessionList 整店订阅 + 每分钟 tick 全量重渲染，侧边栏隐藏/后台标签页也在跑 | `react/session-list/SessionList.tsx:10-21` |
| R7 | 消息列表是渐进挂载非虚拟化；1000 行冷启动 357ms 长任务（审计 R9 未修） | `react/message-list/progressiveMount.ts:4-8`、`docs/audits/2026-10-22-history-restore-performance.md` |
| R8 | live turn 每帧重建 layout | `react/tool-run/AssistantTurn.tsx:216-222` |
| R9 | 流式 delta 冗余 window CustomEvent 通道 | `ui/reactBridge.ts:18-26` |

已验证**不必再投入**的热路径：流式数据流 data-only、delta cadence 门控（33/50ms）、stream player backlog 已修、计时器清理完备、composer 输入不写 store。

### 1.3 UI 统一规范（本轮不动结构，登记在案）

- 冻结层 legacy/ 5,969 行 + restore/ 4,585 行仍在生产级联（599 `!important`）；消化按 `legacy/08-exam` 先例逐文件推进。
- css-debt live 基线：literalFontSize 60（features/surfaces.css 10、polish/workspace|mobile-sidebar|sidebar 各 6-9）、stackedId 41。
- 按钮语法碎片化：~30 个功能类 `*-btn`、死原语 `IconButton.tsx`（0 使用）、`.icon-btn` 四层三尺寸、ADR 0024 的 Tailwind 层级陷阱。
- 双 token 词表：live CSS 读 shadcn 语义变量 688 次 vs `--ui-*`。
- 移动端密度字面量（36/40/32px 裸写），token 阶梯已备；**移动端不对齐桌面**（AGENTS.md），统一路径是"同词表、不同档位"。

## 2. 方案与趟次

### Pass 1（本趟，全部低风险、无视觉变化或可忽略的文案变化）

| 动作 | 对应问题 | 文件 |
|---|---|---|
| P1-1 断点单源化：新建 `sidebar/breakpoints.ts`（`MOBILE_VIEWPORT_MAX_PX=768`、`DESKTOP_VIEWPORT_MIN_PX=769`、`isMobileViewport()` 对齐 CSS `max-width: 768px`），6 个消费方全部改引；顺手修复 768px 无人区 | S2 | sidebar.service、sidebarChrome、sidebarResize、useMobileViewport、navigation.service、reset.ts |
| P1-2 renderRecents 包装器收敛为直连 `ui/recentsView.ts`；`window.renderRecents` 发布**保留**（e2e 依赖：chat-preparation:144、performance-interaction:92、sidebar-compat:105,134） | S3 | 8 个模块 |
| P1-3 `formatRelativeTime` 收敛为一份（canonical 移入 `ui/recentsHelpers.ts`，session-list 转发）。行为差量仅影响 MistakeBookPanel："Yesterday"→"1d ago"、>7 天 locale 日期→"Nw/Nmo ago" | S4 | recentsHelpers、sessionList.store |
| P1-4 删除 `markdownCodeCopy` 的 `flushSync` 双渲染（`createRootGroup.render()` 已完成渲染） | R2 | markdownCodeCopy.ts |
| P1-5 `IntelligentTextSegment` 的全文切分加 `useMemo([text])` | R4 | IntelligentTextSegment.tsx |
| P1-6 `installModalA11y` 观察器存到 overlay 元素并在重装前 disconnect | R5 | modalA11y.ts |
| P1-7 SessionList 分钟 tick 门控：侧边栏关闭时暂停、`document.hidden` 跳过、重开时立即刷新一次 | R6 | SessionList.tsx |
| P1-8 打开状态单源化（有界版）：新增 `projectSidebarOpen(open, {persist})` 投影助手（class + store + 可选持久化）；`toggleSidebar()` 从 store 取反、投影、再跑 FLIP；resize auto-collapse / sign-out reset / boot hydration 全部走同一投影。class 的运行时写入方收敛为 1 个 | S1 | sidebar.store.ts、sidebar.service.ts、sidebarChrome.ts、sidebarResize.ts、reset.ts |
| P1-9 `search-open` 进 store：`searchOpen` 字段 + SidebarHeader 派发 + 订阅投影 class（删除 React 内 `classList.toggle`） | S5 | sidebar.store.ts、SidebarHeader.tsx |
| P1-10 duplicatePairs 登记 28 对 parity/polish **今日值一致**的声明（脚本全文件验证通过），新增重叠即 lint 失败 | S7 | check-surface-ownership.mjs |
| P1-11 `check-mobile-css.mjs` 增加侧边栏移动端归属守卫。**守卫落地时暴露了比分析更多的碎片**：`polish/mobile-controls.css`（触碰区 charter，约 40 条）、`polish/mobile.css`（1 条）、`parity/sidebar.css:696`（1 条错放进桌面 owner）。本趟：把 parity 那条搬回 `polish/mobile-sidebar.css`，白名单冻结为 5 文件（含 2 个 charter 豁免）；Pass 2 合并后收缩 | S6 | check-mobile-css.mjs、parity/sidebar.css、polish/mobile-sidebar.css |

### Pass 2（本趟，已完成并通过双重量化验证）

1. **移动端侧边栏 CSS 物理合并 ✅**：52 个 `max-width:768px` 块（components 19 + polish/sidebar 33）按级联旧→新顺序并入 `polish/mobile-sidebar.css`；`polish/mobile.css` 的 border-right 规则一并搬移；`polish/sidebar.css` 移动块清零、`components/sidebar.css` 仅保留菜单 charter 块。合并中删除 8 处经定性确认的死声明（含 `.icon-btn` 死选择器群——DOM 转储证实其在 `#appShell` 内匹配 0 元素；含被 `parity:569` 无条件徽标规则压制的 components 徽标规则）。守卫白名单 5→2（mobile-sidebar + mobile-controls charter）。
2. **验证工具与方法**（用后即删，方法记录于此）：
   - DOM 级：`tmp-sidebar-style-dump.spec.mjs`（临时专用 config 运行，`tmp-*` 被主 config testIgnore）对 #appShell 全子树 519 节点 × 6 场景（375/768/1280 × 明暗）转储 70 项计算样式 + 布局矩形；合并前后逐字节 diff。结果：3114 节点比对 **0 差异**。教训：Playwright 每次运行清空 test-results/，before 产物需在仓库外留存。
   - CSS 静态级：`tmp-verify-mobile-sidebar-cascade.mjs` 对每个被搬声明按"旧层叠位置 vs 新位置"各解一次全层胜者（含 ！important 分池、mobile media 过滤），比较值。结果：**145 组声明 0 翻转**。该工具抓到了 DOM dump 永远看不到的死状态（折叠栏、hover、隐藏面板）。
   - 静态碰撞检测的教训：初版只查 polish 层内 BETWEEN 文件，漏了 parity 的**无条件规则**——`.nav-new-badge` 搬移后复活翻转了移动端值（margin 6px→4px 等），被 DOM diff 抓获后删除死规则修正。**任何向 polish 层搬移规则的合并，碰撞检测必须覆盖全部在它之前的层（含 parity/restore/legacy）**。
3. **recents 双通知复评 ✅ 结论：非缺陷**：`publishSessionList`（→ sessionListState bridge → 会话列表）与 `recentsVersion`（→ chips）服务不同消费者，`renderRecents` 是唯一扇出入口。不需收敛。
4. **FLIP→CSS 过渡评估 ✅ 结论：维持现状**：motion.css 已对 `#sidebar`/`.main` 设 `transition: none`（几何即刻提交），开关动画是 transform FLIP（合成器路径、180ms、reduced-motion 感知）；resize 弹簧直写 `--app-sidebar-width` 是跟踪指针的必然。审计 R8 的侧边栏项实际已被 motion.css 解决。

### Pass 3（系统性，各自独立立项）

- R1（R6 审计项）：visible-messages 过滤/去重下沉 store reducer 或按消息身份增量缓存，流式只 diff 尾部；配合 R7（R9 审计项）历史游标分页。
- 按钮语法收敛（ADR 0024 四步法）：处置 `IconButton.tsx`（复活或删除）、`*-btn` → `<Button>` variants 映射、`.icon-btn` 单一定义。
- token 词表统一：css-debt 增设 `shadcnVarReads` 计数器（基线 688，shrink-only）。
- 移动端字面量换 token 阶梯（同词表不同档位）；backdrop-filter 29 处合并（P6.4）。
- R3 观察器范围收窄（观察容器而非 body）+ R8 live-turn layout memo + R9 CustomEvent 退役。

## 3. 本趟验证（按 AGENTS.md 节奏：变更全部完成后一次性跑）

1. `npm run lint`（全链 ratchet，含新 duplicatePairs 与 mobile-css 守卫）
2. `npm run build`（tsc + 产物）
3. 聚焦 Playwright（`--workers=1`）：`sidebar-nav`、`sidebar-resize`、`sidebar-rail`、`sidebar-compat`、`sidebar-light-theme`、`streaming-render`、`message-list-compat`、`chat-send`
4. 单测：`node --experimental-strip-types --test test/<touched>.test.mjs`（按 diff 挑选）

## 4. 风险与约束

- 不新增 palette / 桌面 owner；`themes.css` 保持唯一调色板且最后导入。
- 移动端密度**不对齐桌面**；768px 判定从 `<768` 改为 `<=768` 是向 CSS 真相收敛（iPad 竖屏修复），非密度变更。
- `window.renderRecents` / `window.toggleSidebar` 等发布保留（e2e + runtimeWindow 类型契约）；删除的只是内部包装模式。
- `e2e/storage-bootstrap.spec.mjs` 是 frontend 入口 import 顺序契约 —— 本趟不改 `main.ts`。
- 迁移文档失真备忘：`docs/plans/universal-app-migration.md` 声称 `@socrates/ui` 有 Sidebar 组件，`packages/ui/src/` 实际不存在 —— Universal App 侧复用前需先落地该组件。
- 守卫变更规则：新对/新规则同时进 `lint` 与 `lint:<name>`；baseline 只能收缩。
