# Socrates UI 统一架构与设计标准（v3）

> **建议落库路径**：`docs/design/ui-design-standard.md`  
> **适用范围**：`frontend/src/react/**`、`frontend/src/styles/**` 及所有新建/重构的 Web 界面  
> **唯一基准**：[`@openai/apps-sdk-ui`](https://github.com/openai/apps-sdk-ui)（React + Tailwind CSS v4 + Radix 原语）与 [OpenAI UI Guidelines](https://developers.openai.com/plugins/concepts/ui-guidelines)

## 1. 设计总纲与核心原则

Socrates 前端已完成向 React + Tailwind CSS v4 的迁移，但历史样式仍停留在四层补丁叠罗汉（`components/` → `features/` → `parity/` → `polish/`，共 66 个文件、30,034 行 CSS、2,100 处 `#id` 选择器）与四套设计体系混血（LobeUI 底座 + Vercel Geist + ChatGPT 局部补丁 + 旧版 Philosophy 主题）。

本标准确立以下 **5 条不可违背的铁律**：

1. **单一真源（Single Source of Truth）**：以 `@openai/apps-sdk-ui` 作为全站唯一设计令牌与基础组件底座，停止一切手工临摹 ChatGPT 的独立覆盖层。
2. **单一所有权（Single Owner）**：一个 UI 模块只能由一个组件目录与一个样式文件（或 Tailwind 工具类）拥有，禁止跨目录写补丁覆盖。
3. **极度克制（Low Noise, High Hierarchy）**：靠明度差与留白建立层级，不靠粗边框、厚阴影、毛玻璃和装饰性渐变堆砌质感。
4. **母版复用（Shell First）**：所有设置面板与子页面必须套入统一的 `SettingsSheet` 与 `PageShell` 母版，禁止业务页面自造布局体系。
5. **拆旧必删（Delete on Migrate）**：任何模块迁移到新标准后，必须在同一 PR 中删除对应的旧 CSS、旧组件与 `src/legacy/` 退役代码，禁止留存双轨并存。

## 2. 底座接入与样式入口规范

### 2.1 安装与全局样式导入顺序

```bash
cd frontend
npm install @openai/apps-sdk-ui
```

将全局样式入口收敛为单一文件 `frontend/src/styles/app.css`，严格按以下顺序声明（取代原有的 66 文件层叠和 `critical-1..7.css`）：

```css
@import "tailwindcss";
@import "@openai/apps-sdk-ui/css";

/* 让 Tailwind v4 扫描官方组件库中的工具类 */
@source "../node_modules/@openai/apps-sdk-ui";

/* Socrates 极简语义覆盖（仅保留品牌极少数变量与业务布局槽位） */
@import "./tokens.socrates.css";
```

在 `frontend/src/react/bootstrap.tsx` 根节点外层统一包裹 `AppsSDKUIProvider`，接管路由链接与全局主题上下文。

### 2.2 样式编写红线

| 禁止项 | 替代方案 |
| :--- | :--- |
| `#appShell #sidebar` 等 `#id` 高权重选择器 | 仅使用 Tailwind v4 语义类或组件级 `*.module.css` |
| `backdrop-filter: blur(...)` 毛玻璃 | 使用实色哑光表面 + 1px 发丝线边框 |
| 装饰性渐变（`linear-gradient` / `radial-gradient`） | 使用单一纯色表面阶梯 |
| 双层 `inset` 内高光阴影（如旧版 `--ui-composer-shadow`） | 哑光填充 + 单层极淡发丝线 |
| 在 `parity/` 或 `polish/` 目录新增任何文件 | 直接在目标组件模块内维护 |

## 3. 设计令牌（Design Tokens）标准

所有颜色、间距、字体与圆角优先消费 `@openai/apps-sdk-ui` 内置的 Tailwind v4 语义类（如 `bg-surface`、`text-secondary`、`border-subtle`、`border-default`），仅在 Socrates 独有场景补充以下收敛后的约束。

### 3.1 表面阶梯与发丝线边框

暗色模式以哑光近黑为基准，彻底废弃高对比度不透明灰线（`#2e2e2e`）：

| 语义角色 | 暗色基准 | 亮色基准 | 使用场景 |
| :--- | :--- | :--- | :--- |
| **主画布（Canvas）** | `#0e0e0e` | `#ffffff` | 主对话区、子页面主体背景 |
| **侧边栏（Rail）** | `#171717` | `#fafafa` | 桌面端左侧栏、移动端抽屉背景 |
| **交互面（Surface / Field）** | `#212121` | `#f4f4f4` | 底部输入框、侧边栏选中行、次级控件底色 |
| **浮层（Overlay / Modal）** | `#262626` | `#ffffff` | 弹窗、下拉菜单、设置面板 |
| **发丝线边框（Border Subtle）** | `rgba(255, 255, 255, 0.08)` | `rgba(0, 0, 0, 0.08)` | 侧边栏分割线、结构化卡片边框、输入框默认边 |
| **悬停边框（Border Strong）** | `rgba(255, 255, 255, 0.14)` | `rgba(0, 0, 0, 0.16)` | 控件 hover / focus-within 边框 |

### 3.2 色彩克制度与语义胶囊

全站维持单色中性灰阶，**禁止**同时在主界面出现高饱和青绿（`#1fc7a8`）、亮黄绿（`#80c933`）、琥珀黄（`#ffbe45`）和彩虹文件色。

| 语义状态 | 暗色胶囊底色 | 暗色文字/图标 | 适用场景 |
| :--- | :--- | :--- | :--- |
| **用户气泡** | `#1b355c`（低眩光深蓝）或 `#2a2a2a`（二选一全站统一） | `#ffffff` | 对话区用户消息（零边框、零阴影） |
| **通过 / 成功（Success）** | `rgba(34, 197, 94, 0.14)` | `#4ade80` | 自动化验证“通过”、连接已就绪 |
| **进行中 / 信息（Info）** | `rgba(59, 130, 246, 0.16)` | `#60a5fa` | 验证“进行中”、异步任务运行态 |
| **警告（Warning）** | `rgba(245, 158, 11, 0.14)` | `#fbbf24` | 额度提醒、非阻塞提示 |
| **危险 / 失败（Danger）** | `rgba(239, 68, 68, 0.14)` | `#f87171` | 校验失败、删除确认 |

### 3.3 三档圆角体系

淘汰原有的 10 档碎片圆角（`6 / 8 / 10 / 12 / 16 / 20 / 24 / 28 / 32 / 999px`），全站锁死 **3 档**：

| 档位 | 数值 | 适用元素 |
| :--- | :--- | :--- |
| **Row / Control** | `8px`（侧边栏行可用 `10px`） | 侧边栏历史项、菜单行、输入框内联控件、表单字段 |
| **Card / Surface** | `12px`（大弹窗可用 `16px`） | 验证进度卡、工具结果卡、子页面卡片、弹出菜单、Modal |
| **Pill / Capsule** | `9999px`（多行输入框 `28px`） | 主按钮、状态胶囊、用户消息气泡、底部对话输入框、圆形发送钮 |

### 3.4 字阶与字重收敛

删除原有的 15+ 字号变量、无效的 `450` 静态字重以及 `--sidebar-font-scale` 叠加缩放，统一为 **5 档语义字阶**（`Geist Sans` + `Noto Sans SC`，正文字重 `400`，导航/标签 `500`，强调/标题 `600`）：

| 档位 | 字号 / 行高 | 字重 | 适用场景 |
| :--- | :--- | :--- | :--- |
| **Page Title** | `20px / 1.35` | `600` | 子页面主标题、设置页主标题 |
| **Section Title** | `15px / 1.4` | `600` | 结构化卡片标题、设置分组标题 |
| **Body** | `15px / 1.65` | `400` | AI 回复正文、用户气泡文字 |
| **UI / Nav** | `14px / 1.45` | `400 / 500` | 侧边栏列表、按钮、表单标签、设置行 |
| **Meta / Caption** | `12px / 1.4` | `400 / 500` | 底部免责声明、时间戳、状态胶囊文字 |

## 4. 交互与动效标准（Motion Contract）

全面废除全仓散落的 **47 个 `@keyframes`**、32 种硬编码时长、14 条缓动曲线以及 `legacy/pressFeedback.ts` 手动 DOM 挂类机制。

### 4.1 统一动效原语与参数

| 维度 | 强制标准 |
| :--- | :--- |
| **时长档位** | 仅允许 2 档：`--motion-fast: 150ms`（hover、按压、颜色/透明度切换）、`--motion-base: 220ms`（侧边栏展开、面板显隐、高度过渡） |
| **缓动曲线** | 全站唯一曲线：`cubic-bezier(0.2, 0, 0, 1)`（干净减速，**严禁**任何过冲弹跳曲线） |
| **进出场与布局动画** | 统一使用 `@openai/apps-sdk-ui` 提供的 `Animate`、`AnimateLayout`、`AnimateLayoutGroup`、`TransitionGroup` |
| **加载与运行态** | 全站 6 套自定义转圈全部收敛为 `@openai/apps-sdk-ui` 的 `Indicator` |
| **按压反馈** | 仅使用原生 CSS `:active` 的透明度或背景微调，**严禁** `scale()` 缩放抖动或 JS 模拟 `.is-pressed` |
| **无障碍降级** | 全局遵守 `@media (prefers-reduced-motion: reduce)`，降级时将所有过渡归零并停止循环动画 |

## 5. 基础组件与对话内容双轨规范

### 5.1 `@openai/apps-sdk-ui` 标准组件映射

| 业务需求 | 必须使用的官方组件 | 替代并删除的旧实现 |
| :--- | :--- | :--- |
| 按钮与链接按钮 | `Button`、`ButtonLink` | `polish/buttons.css`、手写 `.btn-*` |
| 状态标签 | `Badge` | 各页面散装 `.pill` / `.status-chip` |
| 图标 | `Icon`（缺失业务图标由 `lucide-react` 统一 `16px/18px`、`strokeWidth={1.75}` 补齐） | `src/legacy/icons/openaiGlyphs.ts`（720 行） |
| 弹窗与浮层 | `Modal`、`Popover`、`Menu`、`Tooltip` | `src/legacy/modalA11y.ts`、`polish/overlays.css` |
| 表单与切换 | `Input`、`Textarea`、`Select`、`SegmentedControl`、`Switch`、`Slider`、`Checkbox`、`RadioGroup` | `src/react/legacy-controls/*`、旧设置控件 |
| 空状态与加载 | `EmptyMessage`、`Indicator` | `LibraryEmptyState` / `ScheduledEmptyState` 自定义样式、6 套自定义 spinner |

### 5.2 AI 执行过程态 vs 结构化结果卡

参照 ChatGPT 桌面端规范，严格区分两类 AI 中间/结果展示，彻底重写 `thinking-activity.css` 与 `tool-card.css`：

1. **轻量过程行（Ephemeral Step Row）**：用于展示“评估合并顺序”“规划冲突方案”等步骤。
   - **样式**：单行无框、无背景色、无阴影；左侧 `14px` 单色静音图标 + `13px` 次级灰文字（`text-secondary`），行间距 `8px`。
2. **结构化结果/验证卡（Structured Status Card）**：用于展示“自动化验证进展”或多条目检查结果。
   - **样式**：与画布近同色底（`transparent` 或极微抬升）+ `1px solid border-subtle` + `12px` 圆角 + `16px 20px` 内边距；内部左右两列布局（左侧 `16px` 状态图标 + `14px` 主文字，右侧低饱和半透明 `Badge` 胶囊）；不同状态分组之间仅用 `16px` 留白隔开，不画多余横线。

## 6. 侧边栏（Sidebar）与顶栏（Topbar）规范

合并 `src/react/sidebar/` 与 `src/react/sidebar-chrome/` 为单一模块 `src/react/layout/Sidebar/`，桌面端与移动端抽屉共用同一套列表与导航组件：

| 区域 | 规范细则 |
| :--- | :--- |
| **宽度与边界** | 桌面展开态固定 `260px`，收起态仅保留极简 `52px` 图标条；右侧仅用 `1px solid border-subtle` 分隔，无阴影 |
| **顶部操作区** | 高度 `52px`；品牌名/新对话入口 + 搜索图标 + 折叠图标，全部使用无框 Ghost `Button` |
| **历史会话列表** | 分组标题用 `12px text-secondary`；会话行高 `36px`、圆角 `10px`、水平内边距 `10px`；**默认无前缀图标、无边框**；选中态填充 `#212121`（暗）/ `#ebebeb`（亮），运行中仅在右侧显示微型 `Indicator` |
| **底部账号区** | 固定贴底，左侧 `28px` 圆形 `Avatar` + 用户名，点击呼出官方 `Menu`（设置、语言、退出） |
| **主区顶栏（Topbar）** | 高度 `52px`、**无底边框、无毛玻璃**；左侧仅展示当前会话标题（`14px font-medium`），右侧最多保留 2 个单色 Ghost 图标按钮（更多、分享/导出） |

迁移完成后立即删除：`components/sidebar.css`、`parity/sidebar.css`、`polish/sidebar.css`、`polish/mobile-sidebar.css`、`parity/topbar.css`。

## 7. 设置页（SettingsSheet）统一规范

将 `src/react/settings/`（30 个文件）收敛为单一的 ChatGPT 风格设置弹窗/面板 `SettingsSheet`，彻底替代 `polish/settings-page.css`（1,288 行）：

1. **整体骨架**：基于官方 `Modal`（桌面最大宽 `720px`、高 `min(640px, 85vh)`，移动端全屏 Sheet），内部采用 **左栏导航（`188px`）+ 右栏内容区（可独立滚动）** 双栏结构。
2. **统一设置行原子组件（`SettingsRow`）**：右栏所有配置项（`General`、`Display`、`Models`、`Personalization`、`Account`）必须使用同一个 `SettingsRow` 组件：
   - 最小行高 `52px`，底部用 `1px solid border-subtle` 细线分隔（最后一项无底线）；
   - 左侧为标题（`14px text-primary`）与可选单行副标题（`12px text-secondary`）；
   - 右侧只放 1 个官方控件（`Switch`、`Select`、`SegmentedControl` 或 `Button`）；
   - **禁止**在设置页内嵌套多层圆角卡片框套框。

## 8. 子页面（PageShell）统一规范

所有二级功能页——包括 `pages/workspace/`（`LibraryView`、`PluginsView`、`PluginDetailView`、`ProjectsView`）、`pages/scheduled/`（`ScheduledPage`）以及 `study` / `creation` / `exam` / `admin`——必须统一套入 `src/react/layout/PageShell.tsx`，**禁止业务子页面自带独立布局 CSS**。

### 8.1 `PageShell` 标准结构

| 槽位 | 布局与样式约束 |
| :--- | :--- |
| **PageHeader** | 贴顶高度 `56px`，左侧页面标题（`20px font-semibold`）+ 可选返回钮，右侧最多 1 个主 CTA `Button`（胶囊形）+ 1 个次操作 |
| **Content Container** | 居中单栏，最大宽度固定 `860px`（卡片网格页允许 `1040px`），水平内边距桌面 `32px` / 移动 `16px` |
| **Toolbar / FilterBar** | 单行高度 `40px`，左侧 `SegmentedControl` 或 `Input` 搜索框，右侧排序/筛选 `Select`，与主体间距 `20px` |
| **列表与卡片视图** | 列表页（如 `ScheduledTaskList`、`LibraryView`）统一使用 `12px` 圆角、`1px border-subtle` 的单层容器 + 内部发丝线分割行；卡片网格页（如 `PluginDirectory`）统一 `grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3`，卡片内边距固定 `16px`，单卡最多 2 个操作按钮（遵循 OpenAI Apps SDK UI 卡片准则） |
| **空态与加载态** | 统一使用官方 `EmptyMessage` 与居中 `Indicator`，禁止各子页面手写插画或骨架屏变体 |

迁移完成后立即删除：`features/page-kit.css`、`polish/app-pages.css`、`polish/workspace.css`、`features/study.css`、`features/creation.css`、`features/exam.css`、`features/admin.css`。

## 9. 退役死代码清理清单与验收门禁

### 9.1 必须分批清零的退役目录与文件

| 类别 | 目标路径 | 清理时机 |
| :--- | :--- | :--- |
| **重叠覆盖层** | `frontend/src/styles/parity/**`、`frontend/src/styles/polish/**`、`frontend/src/styles/critical-1..7.css` | 随对应模块重写逐个删除，最终整目录移除 |
| **旧 UI 原语与图标** | `frontend/src/legacy/icons/openaiGlyphs.ts`、`modalA11y.ts`、`pressFeedback.ts`、`motion/index.ts`、`tokens.ts` | 第 2 阶段动效与组件收敛完成即删除 |
| **旧 React 桥接层** | `frontend/src/react/legacy/**`、`frontend/src/react/legacy-controls/**` | 第 4 阶段子页面与设置页切换完成即删除 |
| **无引用遗留脚本** | `frontend/src/legacy/**`（当前 89 文件 / 13,313 行） | 通过依赖图扫描，无入口引用的文件立即清理，剩余业务服务迁入 `src/services/` |

### 9.2 工程护栏与视觉回归门禁

1. **升级 `frontend/scripts/check-css-debt.mjs`**：
   - 将 `parity/`、`polish/`、`src/legacy/` 设为只读黑名单（禁止新增文件或新增行数）；
   - 将 `backdrop-filter`、`#id` 样式选择器、非白名单 `@keyframes` 的基线上限设为递减直至 `0`。
2. **扩展 `frontend/design-qa.md` 的 Playwright 视觉基线**：
   - 在现有输入框工具菜单之外，强制补齐 5 个核心页面的暗/亮双主题（桌面 `1536×868` + 移动 `400×890`）截图回归：空态首页、含过程行与验证卡的对话页、侧边栏展开/收起态、`SettingsSheet` 设置面板、`Workspace` 与 `Scheduled` 子页面。
   - 任何 UI PR 必须通过视觉对比审批后方可合并。
