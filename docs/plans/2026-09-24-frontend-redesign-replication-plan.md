# Socrates 前端深度分析与复刻/重设计计划

> 生成方式：Playwright + Chrome DevTools Protocol（`DOM.getDocument` / `CSS.getComputedStyleForNode` / `DOM.getBoxModel` / `Accessibility.getFullAXTree` / `Performance.getMetrics`）对本地 Vite dev server（`:5173`，LOCAL_AUTH_BYPASS stub + `/api/*` 路由 mock）实机抓取。
> 原始数据：`frontend/analysis/out/{report.json,report2.json,report3.json,summary.txt,tree.txt}` 与 `frontend/analysis/out/shots/*.png`（10+ 张桌面/移动/双主题截图）。抓取脚本：`frontend/analysis/cdp-analyze{,2,3}.mjs`。

---

## 1. 架构分析（现状）

### 1.1 技术栈

| 层 | 现状 |
|---|---|
| 构建 | Vite 6.4，ESM，`manualChunks` 按 `src/{i18n,store,render,chat,ui}` 分块；`cssCodeSplit:false` 单 CSS 包 |
| 视图层 | **混合架构**：index.html 静态 shell（1060 DOM 节点、深度 13）+ vanilla JS/TS 模块 + **React 19 岛屿**（zustand 5）|
| 编辑器 | Tiptap 3（react 岛屿 `composer-input/RichComposer.tsx`）|
| 渲染管线 | marked + DOMPurify + KaTeX + highlight.js + fuse 打包进 bundle；mermaid/echarts/plotly/three/tldraw 按需 dynamic import |
| 字体 | fontsource 自托管：Inter / Plus Jakarta Sans / Newsreader / Noto Sans SC |
| 后端契约 | `/api/v2/*`（vite dev 下 auth 由 stub 接管，其余 proxy `:3037`）|

### 1.2 引导流程

`index.html` 内联脚本先决定主题（`data-mode`/`data-theme-preference`，防闪烁）→ `data-boot-state="checking"` 显示 `.boot-loading` → `main.js`（931 行，编排 ~40 个 init 调用）→ `authBoot()` 请求 `/api/auth/me` → 置 `app` 或 `auth`。12s 超时兜底回 auth gate。

`windowExports.js` 把 ~75 个函数挂到 `window`（供 HTML 内联 `onclick` 与 legacy 委托使用）——**这是改名/重构时的最大隐藏契约**。

### 1.3 状态层

`src/state/bridges.ts` + `src/store/index.ts`：6 个 zustand 域 store（`session / kb / search / call / ui / exam`），legacy 代码经 `stateStore` Proxy facade 写入，React 经 `useSessionStore` 等 selector hooks 读取。双写一致靠 bridge 适配器。

### 1.4 React 岛屿（挂载点均为 index.html 内固定 id）

`settingsModalReactRoot`、`storageModalReactRoot`、`cheatsheetReactRoot`、`promptTemplatesReactRoot`、`confirmDialogReactRoot`、`chatConfigurationReactRoot`、`adminModalReactRoot`、`thinkingPanelReactRoot`、消息列表 `MessageList.tsx`、composer `RichComposer.tsx`、sidebar `SidebarNav.tsx`/`RecentsFilterChips.tsx`、cmdk、shareModal、usageModal、profileModal、find-in-session、morePopover、session-list、sidebar-chrome、tool-run、tool-output、canvas、attachments、pages/{workspace,scheduled}。每个岛屿配一个 `*.bridge.ts` 双向桥。

### 1.5 CSS 架构 —— 本项目最大的结构性事实

`styles/index.css` 四层级联（顺序即优先级），**总计约 20 275 行**：

| Tier | 目录 | 行数 | 令牌体系 |
|---|---|---|---|
| 1 | `tokens.css` + `themes.css` | ~150 | `--ui-*`（hex/rgb 值）|
| 2 | `legacy/`（17 个顺序敏感切片）| ~7 300 | `hsl(var(--bg-*) / --text-* / --border-* / --accent-*)` 通道变量（旧体系）|
| 3 | `foundations/ layout/ components/ features/` | ~1 700 | `--ui-*` |
| 4 | `restore/`（chatgpt-ui / chatgpt-v2 / ref-baseline / mobile-parity / chat-surface / chatgpt-parity / fixes / creation-surfaces）| ~8 300 | 自有 `--cg-* / --conversation-* / --chatgpt-*` + 旧通道变量 |

**结论：Tier 4 是事实上的视觉终裁**（`restore/index.css` 自述 "must stay last so it outranks everything above"）。任何重设计如果改 Tier 1–3，都会被 restore 层盖掉；真正生效的皮肤在 `chatgpt-parity.css` / `chat-surface.css` / `mobile-parity.css` / `fixes.css`。组件归属图见该文件头注释。

### 1.6 性能观察（CDP Performance.getMetrics）

- `JSEventListeners: 4322` —— 大量委托/直接监听，偏高
- `LayoutCount 41 / RecalcStyleCount 269`、JSHeap ~26 MB —— 正常
- DOM 1060 节点 —— 轻量，模态全部常驻 DOM（`hidden` 切换）

---

## 2. CDP 实测设计规格（现状 DNA）

### 2.1 布局度量

```
.sidebar        260px 固定（--app-sidebar-width 可拖拽），absolute，z-30
.top-bar        52px，padding 8/16，space-between；模式胶囊绝对居中
#modeSegmentedTop 146×32，pill 半径，--ui-bg-raised 底 + hairline border
.main           padding-left:260px，列向 flex
.main-inner     内容列宽 min(100%, 768px × --app-width-scale)
#topicSetup     min-height: calc(100dvh − 56px)，居中（桌面）/ 贴底（移动）
.composer       grid: 44px | 1fr | minmax(96,132) | 40px | 40px；两行 minmax(44,auto)+44
.msg-list       padding-inline: max(16px, 50% − 464px)，gap 12/20px
```

### 2.2 颜色（实测与 themes.css 一致）

| Token | Dark | Light |
|---|---|---|
| bg-page / sidebar | `#000` / `#000`（仅靠 hairline 分隔）| `#fff` / `#f9f9f9` |
| bg-raised / surface / control | `#171717` / `#212121` / `#303030` | `#f7f7f7` / `#f2f2f2` / `#e7e7e7` |
| bg-composer | `#212121` + `inset 0 0 1px rgb(255 255 255/20%)` | `#fff` + `0 0 0 1px 4% + 0 2px 8px 4% + 0 4px 80px 8px 2.4%` |
| text primary→disabled | `#fff #f5f5f5 #d1d1d1 #8e8e8e #676767` | `#171717 #343434 #5d5d5d #737373 #a2a2a2` |
| border subtle/default/strong | white 8%/12%/18% | black 7%/10%/17% |
| accent-strong / on-accent | `#fff` / `#000`（反色 accent = ChatGPT 式无彩色）| `#171717` / `#fff` |
| danger / success | `#ef6666` / `#55b685` | `#c84242` / `#267a4e` |
| bubble（用户气泡）| `#2f2f2f` | `#f0f0f0` |
| backdrop | black 58% | black 35% |

### 2.3 字排（实测频率 Top）

- 根字号 **15.75px**（`--app-font-scale` 乘算），正文 `ui-sans-serif`
- 控件/输入 **Inter** 13–14px；标题/问候语/Auth **Plus Jakarta Sans**（19px/600 brand、27–28px/400 greeting、letter-spacing −0.02em）
- 消息正文 15px / line-height 1.625；代码 `var(--font-mono)` 12px
- 导航项 14px/400/letter-spacing −0.2px；Recents 标题 12px、时间分组标签 ~11px muted

### 2.4 组件实测

| 组件 | 关键值 |
|---|---|
| `.sidebar-nav-btn` | 235×36，grid `22px 1fr auto`，radius 9px，hover/active `--ui-bg-raised` |
| `.recent-item` | ~241×67，5px×10px padding；hover 浮出 tag/archive/delete 图标；标题 12px+时间+tag chip |
| `.auth-card` | max-width 420，`#212121`，padding 32/28，shadow `0 24px 80px rgb(0 0 0/32%)`，radius ~18–22 |
| `.auth-input` | `#1a1a1a` 底，10/12 padding，15.75px |
| `.auth-btn.primary` | `#f5f5f5` 底 `#0a0a0a` 字（反色 CTA）|
| `.msg.user .msg-body` | pill：radius 24px，padding 9×18，max-width 90%，右对齐，`--bg-000` 底 |
| `.msg.assistant` | 无气泡全宽；`.msg-toolbar` hover 显现（28px 图标钮，tooltip `::after`）|
| `.msg-body pre` | radius 16px，`--bg-200` 底，0.5px hairline |
| CmdK | 顶部居中 palette（非屏幕正中），`Esc` 徽标，backdrop `blur()` |
| Settings | 大居中 modal：左 nav rail（搜索+7 项）+ 右 pane，`settings-modal--full` |
| Composer "+"菜单 | 分组列表（Add context / Search & research / Create & analyze），icon+title+desc 行 |
| Mobile | ≤768px：drawer 侧栏、顶栏 汉堡+居中胶囊+圆形新建钮、composer 单行胶囊 |

### 2.5 已识别的设计债（重设计要解决的问题）

1. **双令牌体系并存**（`--ui-*` vs `hsl(var(--bg-*)`）——同一颜色两处定义，改色必须双改。
2. **Tier-4 restore 8.3k 行压住一切**——在 Tier 1–3 做的任何"重设计"都会静默失效。
3. **sidebar 与 page 同为 #000**——暗色下侧栏无层级分离，只有 1px hairline（light 用 `#f9f9f9` 反而更清晰）。
4. **半径不统一**：实测 4/8/9/10/14/16/24/28/50%/999px 混用。
5. **字重/字号微差**：14px vs 15px vs 15.75px 邻近混排；`--app-font-scale` 全局缩放进一步放大不一致。
6. **侧栏导航 9 项 + "More" 再藏 8 项**：信息架构偏重，与极简目标冲突。
7. 4322 个事件监听、legacy `window.*` 75+ 导出——交互层复杂度是视觉之外的隐性债。

---

## 3. 目标设计：硅谷极简（Linear / Vercel / ChatGPT 水准线）

设计原则：**单色灰阶 + 单一 accent、hairline 分隔、8pt 节奏、内容优先、动效克制（≤220ms ease-out）**。

### 3.1 新令牌层（合并为单一 `--ui-*`）

```css
[data-mode="dark"] {
  --ui-bg-page:    #0a0a0a;   /* 页面从纯黑降到 #0a，侧栏才能沉下去 */
  --ui-bg-sidebar: #0a0a0a;   /* 与页同色，hairline 分隔 —— Linear 式 */
  --ui-bg-raised:  #141414;
  --ui-bg-surface: #1a1a1a;
  --ui-bg-control: #232323;
  --ui-bg-hover:   #1f1f1f;
  --ui-bg-composer:#161616;   /* 胶囊略高于页面，内嵌 hairline */
  --ui-bg-bubble:  #262626;   /* 用户气泡 */
  --ui-text-primary:  #f7f7f7;
  --ui-text-secondary:#e6e6e6;
  --ui-text-tertiary: #b4b4b4;
  --ui-text-muted:    #888;
  --ui-text-disabled: #5c5c5c;
  --ui-border-subtle:  rgb(255 255 255 / 6%);
  --ui-border-default: rgb(255 255 255 / 10%);
  --ui-border-strong:  rgb(255 255 255 / 16%);
  --ui-accent:        #f7f7f7;  /* 单色 accent：反色 CTA 不变 */
  --ui-on-accent:     #0a0a0a;
}
[data-mode="light"] {
  --ui-bg-page:#fff; --ui-bg-sidebar:#fafafa; --ui-bg-raised:#f6f6f6;
  --ui-bg-surface:#f1f1f1; --ui-bg-control:#e8e8e8; --ui-bg-hover:#eee;
  --ui-bg-composer:#fff; --ui-bg-bubble:#f1f1f1;
  --ui-text-primary:#111; --ui-text-secondary:#333; --ui-text-tertiary:#666;
  --ui-text-muted:#8a8a8a; --ui-text-disabled:#b0b0b0;
  --ui-accent:#111; --ui-on-accent:#fff;
}
```

### 3.2 节奏与形状（收敛而非新增）

- **间距**：4px 网格（现有 `--ui-space-*` 保留），区块间距只用 8/12/16/24/32/48
- **半径收敛**：控件 8px、卡片/弹层 12px、modal 16px、气泡 20px、composer 24px、pill 999px —— 删除 9/14/22/28 等游离值
- **字阶**：12 / 13 / 14 / 16 / 18 / 24 / 28；权重只用 400/500/600；`letter-spacing` 仅标题 −0.02em、小标签 +0.04em
- **字体**：UI 统一 Inter；greeting/auth 可保留 Plus Jakarta Sans 作 display face（或降为 Inter 600）；Newsreader 仅用于长文阅读场景（如有）
- **图标**：统一 20px viewBox24 stroke 1.8，圆角端点（现状 22px/2.2 与 16px/1.7 并存）
- **阴影**：静态面零阴影；浮层仅 `0 8px 30px rgb(0 0 0/12%)`（light）/ `0 12px 40px rgb(0 0 0/50%)`（dark）；composer light 保留柔光 trio
- **动效**：`cubic-bezier(0.16,1,0.3,1)`，fast 140ms / normal 220ms；modal/popover 8px 位移+淡入；禁弹跳

### 3.3 组件重设计要点

| 组件 | 改动 |
|---|---|
| Sidebar | 与 page 同色 + 右 hairline；header 48px；nav 项 32px 高、radius 8、icon 20px；Recents 压缩为单行 32px（标题+hover `⋯`），时间/标签收入二级文本或去掉；footer 头像行 40px |
| Top-bar | 52px 无边线；模式胶囊 140×30 pill；图标钮 32px（桌面）/40px（移动）|
| Home/greeting | 24px display、问句居上 40% 对齐（移动端已如此）；composer 即唯一焦点，去掉多余 hero 元素 |
| Composer | 单行 52px→聚焦自适应；radius 24；左 `+` 36px 圆形 hover 底；右 effort 触发器改为 chip 样式（13px muted）、mic、发送钮 36px 圆形反色（dark 白底黑箭头）；附件 chips 内嵌顶部行 |
| 用户气泡 | radius 20、padding 10×16、max-width 75%（现状 90% 太宽）|
| Assistant | 全宽无气泡保持；toolbar 32px 高、图标 16px；流式 cursor 用 6px 圆点脉冲 |
| 代码块 | radius 12、`--ui-bg-raised` 底、hairline、右上 copy 图标钮 hover 显现 |
| Modal | 统一居中卡：radius 16、hairline border、backdrop black 45%+`blur(8px)`；settings 保留 nav rail 但宽度 220px；Esc/点击遮罩关闭一致 |
| CmdK | 顶距 20vh、宽 640、radius 16、行高 44、分组标签 11px muted uppercase |
| Toast/Tooltip | toast 右下 12px radius 10 hairline；tooltip 统一 `::after` 6px radius 11px 字 |
| Auth | 卡宽 400、radius 16、label 不再全大写改 13px/500 tertiary、primary 反色圆角 10；GitHub 钮 hairline 边 |
| Mobile | drawer 254px + backdrop blur；底栏安全区 `--ui-safe-bottom`；composer 48px pill |

### 3.4 信息架构精简（建议项，需产品确认）

- 侧栏一级导航收敛为 **New chat / Library / Scheduled / Plugins**（Projects 已被服务端移除见 P2.1 注释；Sites/Images/Assistants 收入 "More"）
- "More" popover 保留长尾入口 + Incognito
- Tutor-only 的 Knowledge/Mistakes 图标行维持现状（模式感知）

---

## 4. 实施计划

### 路线选择

| | Track A：原地换肤（推荐） | Track B：干净重建 |
|---|---|---|
| 做法 | 新增 Tier-5 `styles/polish/`（import 在 restore 之后），组件级覆盖 + themes.css v2 | 新建 `frontend-next/` React 应用，复用 `@socrates/contracts` + `/api/v2` |
| 风险 | 低——DOM/id/`hidden` 契约、`window.*`、e2e 选择器全部不动 | 高——75+ window 桥、Tiptap/渲染管线/键盘适配/双 token 全要重写 |
| 工作量 | 5 个阶段，可逐组件合并 | 数周级，等同重写 |
| 验证 | 现有 89 个 Playwright spec 即回归网 | 需要新搭测试基线 |

**推荐 Track A**，并在 polish 层成熟后再决定是否逐文件回填进 Tier-3 组件 CSS（最终退役 restore/ 历史文件）。

### Phase 0 — 基线与护栏（0.5 天）

- [x] CDP 抓取基线（本报告 + `analysis/out/shots/`）
- `npm run build` + 跑 `e2e/{landing-light-visual,chat-light-palette,theme-system,chat-workbench,sidebar-resize,composer-tools-visual-baseline}` 建立绿色基线
- 记录 `dist` 产物体积作对比

### Phase 1 — 令牌统一（1 天）

1. `themes.css` 写入 §3.1 新值；`tokens.css` 增补 `--ui-radius-*` 收敛表与 `--ui-shadow-*` 三档
2. 在 `polish/tokens-bridge.css` 建映射：`:root { --bg-000: …; --text-100: …; }`（hsl 通道 → 新 hex），让 legacy/restore 里 `hsl(var(--bg-*))` 自动吃新值——**不改一行旧 CSS 即完成全局换色**
   - 注意：`hsl(var(--x))` 要求 `--x` 是 "H S% L%" 通道格式，映射层需同时提供通道值（如 `--bg-000: 0 0% 10%`）
3. `--app-font-scale` 保留但字阶表改为固定 px（缩放只作用于 transcript 已由代码注释保证）

### Phase 2 — Tier-5 polish 层骨架（0.5 天）

- `styles/polish/index.css` 追加为 `index.css` 最后一个 `@import`
- 按表面分文件：`sidebar.css topbar.css composer.css transcript.css overlays.css auth.css mobile.css`
- 选择器策略：全部以 `#appShell` 前缀 + 原类名，靠层叠顺序而非 `!important` 赢过 restore（同优先级后者胜；必须 `!important` 处加注释说明压的是哪条规则）

### Phase 3 — 逐表面重设计（2–4 天，每个表面独立可合并）

| 波次 | 表面 | 涉及文件 | 回归 spec |
|---|---|---|---|
| 3.1 | Sidebar（nav/recents/footer/搜索）| `polish/sidebar.css`；如改结构碰 `index.html` + `react/sidebar/*` | `sidebar-resize` `sidebar-compat` `sidebar-nav` |
| 3.2 | Top-bar + 模式胶囊 | `polish/topbar.css` | `mode-switch` `chat-workbench` |
| 3.3 | Home + Composer（含 "+" 菜单/effort picker/附件 chips）| `polish/composer.css` | `composer-*` `repro-input-overlap` `chat-workbench` |
| 3.4 | Transcript（气泡/toolbar/代码块/流式 cursor/滚动 pill）| `polish/transcript.css` | `chat-send` `streaming-render` `message-list-compat` `code-copy-visual` |
| 3.5 | Overlays（settings/profile/share/usage/cmdk/confirm/toast）| `polish/overlays.css` | `cmd-k` `settings` 相关 `share` `profile` specs |
| 3.6 | Auth gate | `polish/auth.css` | `boot` `auth-direct-handlers` |
| 3.7 | Mobile ≤768px（drawer/顶栏/composer/底栏安全区）| `polish/mobile.css` | `mobile-composer-*` `mobile-home-visual` `keyboard-viewport` |
| 3.8 | Workspace/插件/creation 页 | `polish/surfaces.css` | `library-directory` `creation-surfaces` `plugins` specs |

每波次：截图对比 `analysis/out/shots` 基线 → 增量跑映射 spec（AGENTS.md "Incremental testing" 表）→ commit。

### Phase 4 — 收尾（1 天）

- light/dark/system 三态 + S/M/L/XL 字阶 + 内容宽度档 + grid 背景开关 全组合抽查
- `npm run lint && npm run build`；构建体积对比（目标：CSS 总量 ≤ 现状，polish 净增 <15KB）
- 更新 `restore/index.css` 头注释中的组件归属图（polish 接管的面要标注）
- 文档：本计划勾稽完成项；`AGENTS.md` 增量测试表补 polish 映射

### 红线（不可破坏的契约）

- `index.html` 中所有 `id`、`.hidden` 类切换、`data-*` 属性 = e2e + JS 契约，**只加不改**
- `window.*` 75+ 导出不动；React 岛屿 mount 根 id 不动
- `--app-sidebar-width`、`--app-font-scale`、`--app-width-scale`、`--keyboard-inset`、`--ui-safe-bottom` 由 JS 实时写入，polish 不得覆盖其消费路径
- favicon = logo.png 字节一致（AGENTS.md 锁定）
- restore/ 历史文件 1–6 只读；新样式只进 polish/ 或 fixes.css

---

## 5. 附录：抓取产物索引

```
frontend/analysis/cdp-analyze.mjs    # pass1: shell/双主题/cmdk/settings/display-prefs/tutor/mobile + 令牌清单 + AX 树 + perf
frontend/analysis/cdp-analyze2.mjs   # pass2: auth/composer菜单/profile/more/composer输入态
frontend/analysis/cdp-analyze3.mjs   # pass3: 会话加载态/composer发送态/light 聊天
frontend/analysis/out/report*.json   # 全量计算样式+盒模型
frontend/analysis/out/summary.txt    # 去噪后的样式摘要
frontend/analysis/out/tree.txt       # DOM 骨架（671 行）
frontend/analysis/out/shots/*.png    # 21 张参考截图
```
