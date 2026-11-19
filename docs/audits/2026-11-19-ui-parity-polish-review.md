# 2026-11-19 UI 打磨审计：对照 ChatGPT / Claude 的成熟界面约定

> 这是一份 dated snapshot：记录 2026-11-19 当天从构建产物上量到的界面状态。
> 它不描述未来实现，也不替代 `docs/architecture/`。审计本身没有改产品代码；当晚落地的 batch A 见文末“补记”。

## 范围与方法

- 构建：`frontend/dist`（2026-11-19 21:31），`vite preview` 于 `127.0.0.1:4173`。
- 视口：1440×900（主桌面）、1024×768（窄桌面）、390×844（手机，DPR 2）。
- 主题：`data-mode=light` / `dark`，默认 `socrates` 主题与 Modern 风格。
- 数据：Playwright + `e2e/_mock-api.mjs` 的登录态；会话通过 `__socratesTestState` 注入，与既有视觉 spec 同一条链路。
- 方法：截图 + 实时 DOM 几何 + computed style + Tab 序列 + 对比度计算。截图写在本地 `frontend/test-results/uiaudit/`（gitignored），本文只引用测量值，不把产物当作仓库资产。

覆盖：落地页、会话页、浅/深色、消息悬浮操作、命令面板、设置页（General / Display）、显示偏好浮层、折叠侧栏、手机会话页、1024 窄桌面。

未覆盖：真实流式回答、超长历史、移动端设置页、第三方 provider 的模型选择弹层、横幅/错误态。它们需要各自的 spec，不在本轮结论内。

## 结论摘要

| 级别 | 数量 | 含义 |
|---|---:|---|
| P0 | 0 | 没有阻断主流程的问题 |
| P1 | 3 | 可访问性/交互缺陷，应在本轮修掉 |
| P2 | 7 | 与成熟产品的界面约定有可见差距，影响精致度或效率 |
| P3 | 5 | 文案、微交互、局部一致性 |

**一句话结论**：几何与排版底子已经接近 ChatGPT/Claude（768px 消息列、16/28 正文、composer 与消息列同宽同中心、36px 桌面密度），不需要重做；真正的差距集中在这几类：折叠侧栏的可发现性、隐藏控件的键盘可达性、设置页的阅读宽度、显示设置的双入口、纯黑画布，以及手机端顶栏/composer 的信息密度。

## 已经达到成熟水位，不要动

这些是本轮量到的、与参考产品同一量级的部分，后续改动应把它们当基线而不是“顺手优化”的对象：

| 项目 | 实测 | 对照 |
|---|---|---|
| 消息列宽 | 768px，用户气泡与助手正文同列，列表左右各 202px 留白 | 与 ChatGPT 768px 阅读列同级 |
| 正文排版 | 16px / 28px 行高，标题与列表节奏稳定 | ChatGPT、Claude 同为 16/28 |
| composer 与消息列 | 都是 768px，中心点同为 846px；列表底到 composer 4px，加列表 24px 内边距后视觉约 28px | 成熟产品同款“同一列”关系 |
| 落地页节奏 | hero 底到 composer 40px；hero + composer 组合的中心在视口 44.5% | 与 ChatGPT 的 45% 视觉中心一致 |
| 手机尾部留白 | 最后一条消息底到 composer 顶 40px | 不贴边，正确 |
| 桌面控件密度 | 导航 36px、消息操作 32px、侧栏折叠项 36px | 与 2025 年末的产品密度一致 |
| 浅色对比度 | 导航 16.2:1、正文 17.5:1、RECENTS 5.17:1、空态提示 7.62:1 | 均过 WCAG AA |
| 深色对比度 | 正文/正文按钮 17.9:1、次级 9.6:1 | 文本层面没问题 |
| 焦点环 | 2px 内环 + 2px 高对比外环，`--ui-focus-shadow` 统一 | 比浏览器默认 outline 更稳 |
| 命令面板 | 640px、⌘K、↑↓/↵/Esc 底栏 | ChatGPT 同款语法 |
| 手机消息操作 | 5 个操作收敛为 3 个（复制/重试/更多） | 正确的响应式收敛 |
| 单一主操作 | 发送是唯一主按钮，麦克风独立 | 与上一轮 P0-4 的结论一致 |

## P1：可访问性与交互缺陷

### P1-1 折叠侧栏的 tooltip 是空的

**现象**：折叠成 52px rail 后，悬停/键盘聚焦任一导航图标，会出现一个 22×12px 的空白气泡（或什么也看不见）。

**证据**：

- 折叠态 `#navLibrary` 的 `title` 为 `null`，只有 `aria-label="Library"`。
- `getComputedStyle(el, '::after').content === '""'`，伪元素盒 22×12px。
- `frontend/src/styles/parity/sidebar.css:646` 的 tooltip 规则是 `content: attr(title)`。
- `packages/ui/src/shell/Sidebar.tsx:198` 的 `SidebarNavRow` 只写 `aria-label`，没有写 `title`。
- `frontend/e2e/sidebar-rail.spec.mjs:121-133` 的注释明确要求“每个按钮通过 `title` 提供标签”，但断言只检查了 `aria-label`，所以这个回归没有被测试拦住。

**对照**：ChatGPT 和 Claude 的折叠侧栏都会在 hover 时显示图标名；这是折叠态唯一的可发现性来源。

**建议**：

1. 最小改动：把 CSS 改成 `content: attr(aria-label)`。`aria-label` 已经由 RN 行组件本地化写入，7 个图标一次修好。
2. 如果希望 `title` 继续作为单一来源（原生端 tooltip 也读它），则在 `SidebarNavRow` 增加 `title={label}`，并让 CSS 保持 `attr(title)`。
3. 把 spec 的注释变成真断言：`toHaveAttribute('title', /\S+/)`，或直接断言伪元素 `content` 不为空。

**风险**：低。只影响折叠态；展开态不显示 tooltip。

### P1-2 不可见的“跳到新回复”仍留在 Tab 序列里

**现象**：没有新回复时，`#newReplyPill` 是完全透明的，但键盘 Tab 仍会停在它上面，焦点环也看不见。

**证据**：

- `frontend/index.html:384`：`role="button" tabindex="0"`。
- `frontend/src/styles/legacy/04-topbar-menus.css:562`：默认 `opacity: 0; pointer-events: none`，只有 `.visible` 才恢复。
- 实测：`p.focus()` 后 `document.activeElement === p`，computed `opacity: "0"`；Tab 序列中它固定出现在消息操作之后、composer 之前。

**对照**：ChatGPT/Claude 的“滚动到底部”浮钮只在出现时进入可交互树；不可见控件不接管焦点是基本约定（WCAG 2.4.7）。

**建议**：在 `NewReplyPill` 的 effect（`frontend/src/react/lib/boot/indicatorComponents.tsx`）与 legacy 的 `showNewReplyPill/hideNewReplyPill` 两条路径上同步 `host.inert` / `tabIndex` / `aria-hidden`；或者纯 CSS 用 `visibility: hidden`（会移出 Tab 序列）并在隐藏时延迟 220ms 以保留淡出。验收：Tab 序列只在 pill 可见时包含它。

**风险**：低。注意流式结束时 `unseen` 仍可能让 pill 保持可见，状态同步要跟着 `visible` class 走，而不是只看 `_userScrolledAway`。

### P1-3 侧栏拖拽手柄缺少 separator 语义

**现象**：Tab 会停在 `#sidebarResizeHandle` 上，方向键确实能改宽度（8px，Shift 32px），但辅助技术读不到“这是什么、当前多宽”，也没有 Home/End 直达两端。

**证据**：

- `frontend/src/legacy/sidebarResize.ts:159` 设置 `handle.tabIndex = 0`，并已有 ArrowLeft/Right 的 `keydown` 处理（不是死停点）。
- 但手柄没有 `role`、没有 `aria-valuenow/min/max`；`aria-label` 单独挂在一个无角色的 `div` 上，部分读屏只会读成普通容器。
- 实测：`role=null`，有 `:focus-visible` 蓝色内环；Tab 序列 `apiSettingsBtn` → `sidebarResizeHandle` → `topModelSwitcher`。
- 缺少 Home/End，200–480px 范围最宽要按 35 次方向键。

**对照**：ChatGPT/Claude 不暴露侧栏分隔条；VS Code 一类暴露分隔条的产品会给 `role="separator"`、`aria-orientation`、`aria-valuenow/min/max`，并用方向键 + Home/End。

**建议**：补 `role="separator" aria-orientation="vertical" aria-valuemin/max/now`（`applySidebarWidth` 同步 `aria-valuenow`），保留现有方向键并加 Home/End；RTL 下反转左右方向。如果不想承担键盘语义，就移除 `tabIndex`/焦点环，不要留下“有焦点、无身份”的中间态。

**风险**：低。移动断点下本来就不启用 resize。

## P2：与成熟产品的可见差距

### P2-1 设置页的阅读宽度失真：1027px 的行宽，≈845px 的标签—控件距离

**证据**：

- `.settings-pane` 实测 1027×395，`max-width: 1040px`；`.settings-choice` 行宽 989px。
- “Appearance”标签在 x=364，控件在 x=1210 附近；眼睛要跨 ≈845px 才能把标签和值对上。
- `frontend/src/styles/polish/settings-page.css:84-89` 的注释写着 “Keep the comfortable measure, but let the card rail use the extra room”，说明这是上一轮为了填满宽屏而做的取舍。

**对照**：ChatGPT 的设置面板宽约 720–800px；Claude 的设置正文也维持在 700–760px 的阅读列。成熟产品不会把“标签—值”拉成 800px 以上。

**建议**：把 `max-width` 收回到 860–900px；如果确实想利用宽屏，优先“两列卡片栅格”（每张卡内部行宽 ≤720px），而不是把单行拉长。Display 页的 “Custom background” 行也会因此受益。

**风险**：低。会改变设置页截图基线；优先调 `max-width`，避免动卡片结构。

### P2-2 显示设置有两个入口，且同一个分段控件有两种长相

**证据**：

- 底部 `#displayPrefsBtn` 浮层包含 Theme、Theme style、Text size、Content width、Background grid、Dark/Light 背景色；Settings → Display 又完整包含 Text size/Content width/Grid/Background，General 包含 Theme/Language。也就是说，浮层里的每一项都能在设置页找到，且分属两个页面。
- 浮层的 `#displayThemeSegs`：组背景 `rgb(255,255,255)`，而浮层本身也是白底；组高 28px、按钮 24px。视觉上只剩“Dark”一个白块，另外两个选项像纯文字，分段控件的“槽”消失了。
- Settings → Display 的同一个 S/M/L/XL 控件是 142px 宽、28px 高、带分隔线的按钮组；Chat/Tutor 又是另一种胶囊轨道。三种语法表达同一件事。

**对照**：ChatGPT 的显示设置只有一个来源（Settings → Appearance），Claude 也只有一处；同一产品内分段控件不会同时存在“胶囊轨道 / 白底无槽 / 按钮组”三种形态。

**建议**：

1. 浮层保留为“快速入口”（Theme + “All display settings →”），或直接删掉重复项，只留主题切换。
2. 统一分段控件：复用 Chat/Tutor 的 `--ui-bg-segment` 轨道 + 白色 thumb，高度 28–32px；浮层里不要白底套白底。
3. 给浮层加一个到 Settings → Display 的深链，避免用户在两处猜“哪个才是真的”。

**风险**：中。涉及产品 IA，建议先定“浮层是否保留”再动 CSS。

### P2-3 深色画布是纯黑 `#000`

**证据**：

- 深色 token：`--ui-bg-page: #000`、`--background: #000`；`#msgList` 计算背景 `rgb(0,0,0)`。
- 代码块背景 `#1f1f1f`，与画布的对比只有 **1.27:1**；块的边界主要靠 1px 发丝线和工具栏分隔，而不是明度。
- 深色正文 17.9:1 很舒服，问题不在文字，在“层级”。

**对照**：ChatGPT 深色画布约 `#212121`，Claude 约 `#262624`（以 2025 年末公开版本为参照）。近黑但不纯黑，能同时容纳“画布 / 卡片 / 浮层 / 代码块”四级明度，也避免 OLED 纯黑拖影和长时间阅读的硬边。

**建议**：把深色画布抬到 `#0a0a0a`–`#121212`，保持现有四级阶梯的 1.5%–7% 步进；同步检查 `check-surface-ladder.mjs` 的 baseline 与 `theme-contrast.spec.mjs`。不要只改 `body` 背景，否则 sidebar/composer 的透明层会出现色差。

**风险**：中。受 surface-ladder 守卫约束，必须显式更新 baseline 并跑主题对比 spec。

### P2-4 空态只剩“问候 + composer”，下方 414px 是空的

**证据**：

- hero 28px，位于 y=316–352；composer 392–486；900px 视口下方 414px 空白。
- `[data-suggestion]`、`.suggestion-chip`、`.prompt-suggestion`、`.starter-card` 数量均为 0。
- `frontend/src/react/home/HomeStartComponents.tsx:1-7` 明确记录：chat shortcuts、手机 suggestion line、tutor starter cards 已在 **2026-11-16** 移除，“the landing is the greeting plus the composer, nothing else”。

**对照**：ChatGPT 空态有 4 张建议卡；Claude 在 composer 下方给 3–4 个 starter chips。它们不是装饰，而是冷启动时唯一告诉用户“能问什么”的 affordance。

**建议**：这是一个产品取舍，不应由视觉审计单方面推翻。两个可选方向：

- **保留极简**：把 hero 从 28px 提到 32px，并在 composer 下方加一行 11–12px 的快捷键提示（`⌘K 搜索 · + 工具`），让空白有信息密度；或把 composer 上移 24px，让空白更均匀。
- **恢复克制的引导**：只加一行 3 个 starter chips（不是 4 张大卡），沿用 `--ui-bg-raised` + hairline，不引入新组件体系。先做 A/B，不要直接恢复已删除的三套入口。

**风险**：低（纯增量）；但要尊重 2026-11-16 的决定，先确认产品意图。

### P2-5 手机顶栏与 composer 的信息密度偏高

**证据**：

- 390px 宽时，会话标题可用宽度 176px（16px 字号、ellipsis）；“Processes vs threads”被截成 “Processes vs thre…”。同一行还有侧栏、新建、搜索、分享 4 个图标。
- composer 高 86px，第二行有 `+`、`Medium ⌄`（effort，99×36）、麦克风、发送 4 个控件；`Medium` 夹在 `+` 与麦克风之间，语义不自明（“Medium 什么？”）。
- 最后一条消息到 composer 的 40px 间距是对的，不要动。

**对照**：ChatGPT 手机端顶栏只保留侧栏与新建，搜索/分享收进 `•••`；composer 默认单行，模型/推理强度收进 `+` 或一个小 chip。Claude 手机端也是单行增长式 composer。

**建议**：

1. 把搜索与分享收进一个 overflow 菜单（或账户菜单），标题可用宽度从 176px 提到 ~240px，19 字标题不再截断。
2. `effortTrigger` 在 ≤768px 移入 `composerToolsBtn` 的 sheet，或缩成发送键左侧的 28px 文本 chip；composer 高度可回落到 ~64px，把 22px 还给 transcript。
3. 不要为了“对齐桌面”而保留 4 个控件；这是手机独立密度，`polish/mobile-*.css` 已经是独立 owner。

**风险**：中。移动端有 `mobile-composer-reference.spec.mjs` / `reference-ui-visual.spec.mjs` 的参考基线，需要同步更新截图并说明是 deliberate。

### P2-6 全局搜索的发现性与命令面板空态

**证据**：

- 侧栏搜索框只处理会话搜索，没有 `⌘K` 提示；`⌘K` 命令面板没有任何可见入口（顶栏只有会话内 Find 与 Share）。
- 空命令面板高 204px：结果区 96px（搜索行约 64px、底栏 37px，其余是边框/内边距）；结果区只有居中的 “Type to search across all your sessions.”，没有 recent、没有 quick actions。`CommandPaletteResults` 其实已经支持 `recent` 与 `onPickRecent`，只是空态没有 fallback。
- 会话页顶栏的 `findBtn` 是“会话内查找”，和全局搜索是两件事，但图标都是放大镜，容易混淆。

**对照**：ChatGPT 侧栏搜索行带 `⌘K`，空面板直接列 recent chats + 快捷动作；Claude 的搜索框也是常驻可见入口。

**建议**：

1. 在 `SidebarSearchRow` 右侧加一个 `⌘K` kbd 提示（或把全局搜索做成顶栏图标 + 快捷键双入口）。
2. 命令面板无 recent 时，给 3 个 quick actions（New chat / Settings / Toggle theme）或最近会话；给出稳定的 `min-height`，避免 204px 的“空盒子”。
3. 区分两个放大镜：会话内 Find 用“文档 + 放大镜”，全局搜索保持纯放大镜。

**风险**：低。主要是文案与空态，不碰检索逻辑。

### P2-7 代码块的微控件低于桌面密度

**证据**：

- “Expand code” 24×24，“Copy code” 97×24；消息操作按钮是 32×32，桌面导航是 36px。
- 语言标签 11px，显示为 `python` / `js`（小写），而 ChatGPT 用 “Python” / “JavaScript”。
- 深色下工具栏文字 `#999` on `#1f1f1f`（5.79:1，达标）；浅色下 `#666` on `#fff`（5.74:1，达标），对比度不是问题，尺寸与 casing 才是。

**建议**：把代码块工具栏行高提到 32px（用 `--ui-control-sm`），Copy 按钮保留图标 + 文案；语言名做一张小映射表（python→Python、js→JavaScript、ts→TypeScript），不要用 `text-transform: capitalize`（会把 JavaScript 变成 Javascript）。

**风险**：低。会动 `code-block` 的截图基线。

## P3：快速清单

1. **Settings 里的 “Android notifications”**：`frontend/src/react/settings/settingsNavigation.ts:137` 与 `SettingsUtilityPanes.tsx:15` 仍在 Web SPA 的设置页展示 Android 通知权限。原生 Android 客户端走 Compose，不读这个页面；建议从 Web 导航移除，或按平台注入。
2. **Display 页的 “Custom background”**：一行里塞了 `[黑块] Dark [Reset] [白块] Light [Reset]`，两个 “Reset” 无法区分；建议拆成 “Dark mode / Light mode” 两行，或 2×2 小栅格。该页 nav 描述 “Text size and width” 也漏了 grid/background。
3. **侧栏 “New chat” 是唯一带 elevation 的导航行**：白底 + 边框 + 阴影，比 active 的 Library 还抢眼；ChatGPT/Claude 的 New chat 是平面行，只在 hover/active 提亮。建议降为 `--ui-bg-raised` 或仅在落地页高亮。
4. **Tutor 模式没有模式说明**：切到 Tutor 后，hero 与 placeholder 仍是 “Ask Socrates”，与 Chat 完全一致。ChatGPT 的 Study mode 会在空态解释“怎么用它”。至少换一句 Tutor 专属 placeholder。
5. **重复的“新建”入口**：侧栏头部有一个 compose 图标，下面还有整行 “New chat”；桌面端两者都可见。保留一个主入口即可（参考产品通常只留侧栏顶部一个 compose，或只留整行）。

## 对照速查表

| 维度 | ChatGPT | Claude | Socrates 现状 | 判断 |
|---|---|---|---|---|
| 空态引导 | 4 张建议卡 | composer 下 starter chips | 仅问候 + composer（11-16 有意移除） | 重新决策 |
| 全局搜索 | 侧栏搜索 + ⌘K + recent | 侧栏搜索 | 侧栏会话搜索 + 隐藏的 ⌘K | 补入口/提示 |
| 折叠侧栏 | hover 显示标签/最近 | hover 显示标签 | tooltip 为空，搜索/设置被隐藏 | 修 |
| 设置宽度 | ~720–800px 模态 | ~700–760px 正文 | 1027px 行宽 | 收窄 |
| 深色画布 | ~#212121 | ~#262624 | #000 | 提亮 |
| 手机 composer | 单行 + 溢出菜单 | 单行增长 | 双行 + “Medium” | 精简 |
| 代码块 | 语言名 + Copy，~28px | 语言名 + Copy | 11px 小写 + 24px 按钮 | 微调 |
| 设置入口 | 头像菜单 → Settings | 侧栏底部 → Settings | 侧栏底部三图标 + 头像菜单 | 可接受 |

> 参考产品尺寸以 2025 年末公开版本为准，只用于量级对照，不作为逐像素规范。

## 建议的实施顺序

**批次 A（可访问性，先做，独立可验证）**

1. P1-1 tooltip：CSS `attr(aria-label)` 或补 `title`；补 `sidebar-rail.spec.mjs` 断言。
2. P1-2 pill：不可见时 `inert`/`tabIndex=-1`/`visibility:hidden`；在 Tab 序列测试中断言“不可见即不可聚焦”。
3. P1-3 resize handle：补 `role=separator` + `aria-valuenow` + Home/End，保留现有方向键。

**批次 B（视觉一致性）**

4. P2-1 设置宽度 → 860–900px。
5. P2-2 统一分段控件 + 减少显示设置双入口。
6. P2-3 深色画布提亮（先跑 surface-ladder / theme-contrast）。
7. P2-7 代码块工具栏 32px + 语言 casing。

**批次 C（产品决策）**

8. P2-4 空态：极简 + 快捷键提示，或 3 个 starter chips（先确认 11-16 的决定是否仍然成立）。
9. P2-5 手机顶栏/composer 精简（更新移动参考基线）。
10. P2-6 全局搜索提示 + 命令面板空态。
11. P3 文案与局部一致性。

## 验收

- `npm run lint`（含 button-size / z-index / surface-ladder / focus-ring / css-debt 等棘轮）。
- 相关 Playwright（按改动取子集，不要全跑）：
  - `e2e/sidebar-rail.spec.mjs`：tooltip 有文本；折叠态设置/搜索入口的产品决策。
  - `e2e/sidebar-compat.spec.mjs` / `sidebar-nav.spec.mjs`：折叠/展开、Tab 顺序。
  - `e2e/cmd-k.spec.mjs`：空态 recent/quick actions、快捷键。
  - `e2e/settings-modal.spec.mjs`：设置宽度、Display 行布局。
  - `e2e/mobile-composer-ux.spec.mjs` / `mobile-composer-reference.spec.mjs`：手机 composer 高度与控件顺序。
  - `e2e/theme-contrast.spec.mjs` / `theme-system.spec.mjs`：深色画布改动。
  - `e2e/reference-ui-visual.spec.mjs`：手机与参考截图基线（只在 deliberate 改动时更新）。
  - `e2e/chat-workbench.spec.mjs`：消息操作、滚动、composer 几何。

- 新增两条回归断言（建议）：
  1. “不可见控件不能获得焦点”：遍历 `#newReplyPill`，在无流式/无未读时 `tabIndex < 0` 或 `visibility:hidden`。
  2. “折叠栏每个可见导航按钮的 tooltip 文本非空”：读 `::after` 的 `content`，而不是只读 `aria-label`。

## 边界

- 本轮所有测量来自 mock 数据与本地 preview；真实流式、长历史、provider 弹层、移动设置页未覆盖。
- 对比度计算使用 sRGB 相对亮度；毛玻璃/半透明层的实际合成色可能因背景图不同而略变。
- 参考产品的尺寸是量级对照，不是像素级复刻目标；Socrates 的 36px 桌面密度、768px 列宽、四步表面阶梯应继续保持。

## 补记：当晚落地的 batch A（2026-11-19）

审计完成后先做了三个 P1，没有动 P2/P3 的视觉取舍。

### 已改

1. **折叠栏 tooltip**
   - `frontend/src/styles/parity/sidebar.css`：`content: attr(title)` → `content: attr(aria-label)`。
   - `frontend/e2e/sidebar-rail.spec.mjs`：逐个 hover 折叠栏按钮，断言 `::after` 的 computed content 等于 `aria-label`，把“注释要求 title、断言只查 aria-label”的缺口补上。
2. **不可见的新回复浮钮**
   - `frontend/src/styles/legacy/04-topbar-menus.css`：默认 `visibility: hidden`，只在 `.visible` 时 `visibility: visible`；隐藏延迟 0.26s，保留淡出。
   - `frontend/e2e/chat-autoscroll.spec.mjs`：隐藏态断言 `toBeHidden()`，并主动 `focus()` 验证不会获得焦点；出现态断言 `toBeVisible()`。
3. **侧栏拖拽手柄语义**
   - `frontend/index.html`：`role="separator" aria-orientation="vertical"`。
   - `frontend/src/legacy/sidebarResize.ts`：`applySidebarWidth` 同步 `aria-valuenow`；`initSidebarDrag` 写 `aria-valuemin/max`；方向键保留（8px，Shift 32px），新增 Home/End 和 RTL 方向反转。
   - `frontend/e2e/sidebar-resize.spec.mjs`：新增 separator 语义 + 8/32px + Home/End + 持久化断言。
4. **顺带解除的 eslint 阻断**：`frontend/src/react/intelligent-ui/UiAccordion.tsx` 删除未使用的 `ReactNode` 导入（HEAD 的 `feat(intelligent-ui)` 提交留下的 lint error）。

### 验证

- `npm run build`：通过。
- `npx playwright test e2e/sidebar-rail.spec.mjs e2e/chat-autoscroll.spec.mjs e2e/sidebar-resize.spec.mjs --workers=1`：**12/12 passed**。
- Prettier：改动的 TS/CSS/spec 全部通过；改动文件的 ESLint 无错误。
- `npm run lint`：`tsc`、eslint、react-globals/roots 通过；仍停在 **css-debt 棘轮**，原因是 HEAD 1652039b 新增的 `frontend/src/styles/components/intelligent-ui.css` 本身超出 baseline：`hexColor +25`、`literalFontSize +8`、`literalRadius +2`、`shadcnVarReads +16`。同一次提交还把 `z-index: 9999/10` 写进该文件（z-index 守卫 +2），并在 `UiAccordion.tsx` 留了一个 raw `<button>`（button-primitive 守卫 +1）。这些都是**本轮之前**的债，不应通过抬高 baseline 或删除守卫来消音；正确做法是给这次 intelligent-ui 特性做一轮 token 迁移（tone 颜色、字号、z-index、共享按钮），属于独立批次。

### 未做

- P2 的 7 项全部保持原状，等产品确认（尤其空态 starter 与显示设置双入口）。
- `intelligent-ui.css` 的 token 迁移、z-index 归位、raw button 替换：建议作为紧随其后的独立提交，跑 `theme-contrast` / `surface-ladder` / 相关 visual spec。

## 补记 2：P2 布局与代码块（2026-11-20 凌晨）

- **P2-1 设置页宽度**：`settings-page.css` 的页面模式 `max-width` 从 1040px 收到 880px，`e2e/settings-modal.spec.mjs` 新增 `600 < paneWidth <= 900` 断言。实测 1440px 下 pane 880、行宽 842，标签到控件约 700px（改前 ≈845px）。设置 spec 24/24 通过。
- **P2-7 代码块**：`render/postRender.ts` 增加 fence id → 产品拼写映射（js→JavaScript、python→Python、ts→TypeScript…）；`parity/transcript.css` 去掉 `text-transform: lowercase`、标签字号从 11px 移到 `--ui-font-size-xxs`；`CodeBlockActions.tsx` 的 Expand/Copy 从 24px 提到 32px（`icon-sm`/`sm`）。`test/postRender.test.mjs` 新增拼写用例，`e2e/code-copy-visual.spec.mjs` 2/2 通过；截图复核见本地 `test-results/uiaudit/37-code-actions.png`。
- **lint 残差**：这两项之后 `literalFontSize` 从 58 降到 57（baseline 50），`css-debt` 仍因 `intelligent-ui.css` 超限；同文件的 `z-index: 9999/10` 与 raw `<button>` 仍未处理。阻断项与 batch A 时一致，属于独立的 intelligent-ui token 迁移。
