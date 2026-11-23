# 2026-11-23 页面级 UI 体系收敛计划

范围：`frontend/` 的 SPA 页面与覆盖层。目标是让 Library / Projects / Plugins / Scheduled /
Sites / Images / Assistants / Settings / Profile / Admin / Exam / Auth 这些页面使用同一套
外壳、页头、工具栏、列表、空态、表单、对话框与控件，而不是每页各写一套。

本文是计划，不是已完成的状态描述。当前事实以代码和 `docs/architecture/` 为准；本文落地后，
应把结论同步回 `docs/architecture/ui-structure.md`，而不是让计划文档承担规范职责。

## 1. 结论

问题不在 Token 不够，也不在主题色不统一。`themes.css` 已经把调色板收成一套，聊天正文和
composer 的几何也已经有稳定基线。真正的问题是**页面层没有共同语法**：

- 同一层级的页面有 6 种页头/布局写法，标题字号从 20px 到 28px 不等；
- 同一个“主按钮”在目录页是 pill、在 creation 页是 16px 圆角、在 settings 是 12px，
  admin/auth 又各自实现；
- 同一种“卡片/列表/空态/标签页”在 workspace、creation、settings、exam、admin 里各有一套；
- 87 个 CSS 文件里有 377 个选择器跨文件重复声明，页面样式散落在 `polish/`、`features/`、
  `restore/`、`legacy/` 四层，靠 cascade 顺序决出最终外观；
- 页面并非“风格交错层叠”在视觉上随机，而是**每个页面都自带一套小型设计系统**，
  叠在全局 token 上。只继续加 token 或继续做局部 polish，不会收敛。

建议用“一个外壳 + 两种页面原型 + 一套 Page Kit”的方式收口，而不是重写全部 CSS。
先迁移目录页，再迁移账号/管理页，最后迁移考试和覆盖层；每一阶段都可独立发布、可回退。

## 2. 现状证据

### 2.1 运行时截图

以下观察来自当前 `frontend/dist` 的生产构建，1440×900，mock 登录态。截图是本轮本地审查产物，
放在 `frontend/test-results/ui-system-audit/`（gitignored），不提交：

| 文件 | 页面 |
| --- | --- |
| `library.png` | `/library` |
| `projects.png` | `/projects` |
| `plugins.png` | `/plugins` |
| `scheduled.png` | `/scheduled` |
| `settings.png` | `/settings` |
| `profile.png` | `/profile` |
| `exam.png` | `/exam` |
| `admin.png` | `/admin` |
| `auth.png` | 登录门 |

截图里可以直接看到：

| 页面 | 页头 | 标题实测 | 主操作 | 页面骨架 |
| --- | --- | --- | --- | --- |
| Library | 标题 + 描述，右侧 New 下拉 | h1 24/36 600 | 36px pill | 工具栏 + chip 标签 + 表格 |
| Projects | 标题 + 描述，右侧搜索 + New | h1 24/36 600 | 36px pill | 文本标签 + 居中空态 |
| Plugins | 标题 + 描述，搜索独占一行 + 圆形加号 | h2 24/36 600 | 36px 圆形 | 文本标签 + 双列行 |
| Scheduled | 标题 + 描述，右侧搜索 + New | h1 24/36 600 | 36px pill | 分段容器 + 推荐卡片网格 |
| Settings | 整页接管，左上返回 + 标题 | h2 20/28 600 | 40px 导航项 | 二级左栏 + 表单行 |
| Profile | 返回 + 标题 + 右侧操作，底边框 | 20/28 500 | 36px outline | 卡片分区 |
| Exam | 顶栏 + 步骤编号卡片 | h2 21/20 700 | 底部 sticky 操作条 | 编号卡片 + footer |
| Admin | 居中卡片 | h2 20/20 600 | 32px 自绘按钮 | 登录卡片 |
| Auth | 居中卡片 + 右侧 Cookie 卡片 | 24px 左右 | 自绘 auth-btn | 独立 gate |

同一屏的“New”在 Library/Projects/Scheduled 是 pill，在 Sites 是 16px 圆角
（`restore/creation-surfaces.css:227` 的 `.creation-primary`），在 Settings 是 12px，
在 Admin 是另一个高度和焦点环。这不是 token 差异，是控件语法差异。

### 2.2 代码与样式统计

- `frontend/src/styles` 共 **87 个 CSS 文件**，约 **4,176 条规则**、**3,959 个不同选择器**；
  **377 个选择器在多个文件中重复声明**（已排除 keyframe 步进）。
- 页面域选择器分散严重：
  - workspace 域 **587 条**，分布在 `features/surfaces.css`、`polish/workspace.css`、
    `restore/chatgpt-ui.css`、`polish/mobile-directories.css`、`restore/ref-baseline.css` 等 5+ 个文件；
  - settings 域 **226 条**，分布在 `polish/overlays.css`、`polish/settings-page.css`、
    `legacy/04-topbar-menus.css` 等 4 个文件；
  - auth 域 **89 条**，分布在 `legacy/09-viz-markdown.css`、`polish/auth.css` 等 4 个文件。
- **48 个样式文件**里出现按钮选择器；存在 40 个 `.btn*` 类名、11 个 `*button*` 类名。
- 按钮实现至少有四套：
  - `frontend/src/react/ui/shadcn/button.tsx`（67 个文件直接引用）；
  - `frontend/src/react/ui/Button.tsx`（31 个文件引用，包装 shadcn，带 `plain/shared/ghost` 兼容语义）；
  - `packages/ui/src/primitives/UiButton.tsx`（共享包内部使用）；
  - `intelligent-ui` 的 `.iui-button` 体系（12 处），以及 `.auth-btn`、`.creation-primary`、
    `.workspace-create-button`、`.admin-*` 等页面私有外观。
- 图标至少三套：lucide（47 处 import）、97 个内联 `<svg>` 块、`legacy/Icon` 与
  `UI_GLYPHS`（后者当前没有消费者）。描边宽度出现 1.75 / 1.8 / 2 三种。
- 对话框至少两套：5 个表面使用 `FoundationDialog`（不含组件定义本身）；Share、Usage 仍用自绘 overlay +
  `installModalA11y`，Visualization、workspace dialog、tutor exploration 又各自实现。
- 页面标题语义不一致：目录页是 `h1`，Plugins 是 `h2`，Settings/Profile 的
  `AccountPageTitle` 渲染为 `span role="heading"`（`packages/ui/src/settings/index.tsx:208`），
  Admin/Exam 是 `h2`。同一应用里，“页面主标题”既不是同一个标签，也不是同一个字号。
- 顶栏契约不一致：目录页桌面仍保留一条 44px 的 topbar，model/mode/new-chat 隐藏后没有
  内容；Settings 隐藏整条 topbar；Profile 保留 topbar 但内容区又有一个账户头；Exam 用
  topbar 显示模型切换。Phase 1 已把目录页桌面 topbar 隐藏，手机保留 56px header。
  见 `parity/topbar.css` 的 `[data-main-view$='Panel']` 与 Phase 1 新增的隐藏规则。
- 页面级标题字号：Library/Projects/Scheduled 24、Plugins 24、Settings 20、Profile 20、
  Exam 21、Admin 20、Creation 28（`restore/creation-surfaces.css:18`），落地页 hero 28。
- 页面仍在用旧颜色通道：Admin 的 `.admin-console-head h2` 使用
  `hsl(var(--text-100))`（`legacy/07-composer-settings.css:486`）；exam/auth 也仍有
  `hsl(var(--...))`。这些页面即使 token 切了主题，也不会完全跟随 `--ui-*` 契约。
- 冻结区债务基线（Phase 1 后）：`!important` live 7 / frozen 269，legacy 颜色通道 frozen 506，
  硬编码字号 frozen 223（`frontend/scripts/css-debt.baseline.json`；Phase 1 删除了 Projects
  的 7 条死规则，基线已随之下调）。

### 2.3 根因

1. **页面没有共同的组合层。** 每个页面直接写自己的 header/toolbar/list/empty，导致结构相同、
   外观不同。token 只能统一“颜色和圆角的值”，统一不了“标题放哪、搜索放哪、主操作长什么样”。
2. **样式所有权按历史迁移批次划分，而不是按页面家族划分。** 同一页面横跨 `features/`、
   `polish/`、`restore/`、`legacy/`，最后由 cascade 顺序决定；注释里写的 28px 与实际
   计算出的 24px 已经不一致，说明维护者无法从文件结构推断最终外观。
3. **控件被页面类名二次造壳。** `.workspace-create-button`、`.creation-primary`、`.auth-btn`、
   `.admin-*`、`.iui-button` 各自声明高度、圆角、背景、字号，shadcn 的 variants 被绕过。
4. **“特殊页面”没有正式建模。** Settings 整页接管、Exam 自带顶栏、Auth 独立 gate，都是有理由的
   特殊布局；但它们没有共享的 “FocusedPage” 契约，于是每个特殊页面又发明一套 header/button。
5. **缺少页面级护栏。** 现有 `check-surface-ownership` 只守 sidebar/topbar/composer/transcript
   四个聊天外壳；`check-css-debt` 守全局字面量，但没有守“页面 CSS 只能写布局”“一个页面家族
   只能有一个 owner”。所以每加一个页面，重复很容易再次发生。

## 3. 目标体系

### 3.1 一个外壳，两种页面原型

**AppPage（标准页）**：`sidebar + 页面内容`。桌面不渲染空的 topbar；页头在内容列顶部。
手机保留共享 56px header（汉堡 + 页面标题 + 页面操作）。用于：

- Library、Projects、Plugins、Scheduled
- Sites、Images、Assistants
- Profile、Admin
- 考试设置页、学习面板

**FocusedPage（专注页）**：没有应用 sidebar，只有最小品牌/返回 + 页头 + 内容。
用于确实需要独占注意力的流程：

- Auth gate
- Settings（桌面整页 + 二级左栏）
- Exam runner（开考后）
- 分享只读页 / 白板等原生岛

两种原型都用同一个 `PageHeader`、同一套 `Button`、同一套 `DialogFrame`。区别只在
**是否保留全局导航**，而不是“各自发明一套样式”。

聊天页是第三种，但它已经有稳定基线（topbar + 768 消息列 + composer），不在本轮重做；
只把它的 topbar 控件和新 Page Kit 的按钮/菜单对齐。

> 关键决定（Phase 1 已实施）：桌面目录页的 topbar 在 model/mode/new-chat 隐藏后是一条
> 空条，**已移除**，内容从 `--ui-page-top-space` 开始；侧栏折叠态的开合按钮由 rail 自己
> 承担（`parity/sidebar.css` 已有这一约定）。手机保留 header，因为汉堡和页面标题需要位置。
> 同时把 `#mainInner` 的聊天 `5vh` 上留白限定在聊天页，目录页由 `PageFrame` 自己定节奏。

### 3.2 Page Kit

位置建议：`frontend/src/react/ui/page/`。理由：页面 chrome 依赖路由、i18n、lucide 和
SPA 的 host 生命周期；`packages/ui` 继续只放跨端可复用的呈现组件，避免把 Web 页面语义
推进共享包。纯展示的 `Button/Card/Input` 仍来自 shadcn / `packages/ui/primitives`。

第一批组件（全部是薄封装，不引入第二套设计语言）：

| 组件 | 职责 | 统一掉的现状 |
| --- | --- | --- |
| `PageFrame` | 最大宽度、gutter、上下留白、滚动容器 | 各页自己写 `max-width/padding` |
| `PageHeader` | 返回位、eyebrow、`h1`、描述、右侧操作 | 6 种页头 |
| `PageToolbar` | 搜索、筛选、视图切换、主操作，固定顺序 | Library/Projects/Plugins/Scheduled/Creation 五种排列 |
| `PageTabs` | `segmented`（范围筛选）与 `underline`（页内分区）两种语义 | pill 容器 / 文本标签 / 自定义 active |
| `DataList` | 表头、行、选中、行操作、hover/focus | 表格、双列行、卡片网格三套 |
| `SectionCard` | 分区标题、描述、内容、可选操作 | settings/profile/admin 各自 card |
| `FormRow` | 标签、控件、说明、错误、右侧值 | settings/exam/admin 三套表单行 |
| `EmptyState` | 图标、标题、描述、主操作 | 5 种空态 |
| `ActionBar` | sticky 底部操作条（考试/长表单） | exam footer / settings save bar |
| `DialogFrame` | 统一 overlay、header、body、footer、焦点陷阱 | FoundationDialog + 3 套自绘 modal |
| `PageError` / `PageSkeleton` | 页面级错误与加载 | `WorkspaceLoadingView`、admin loading 等 |

`PageHeader` 的 DOM 契约：页面上有且只有一个 `h1`，带 `data-page-title`；右侧操作区
固定为 `[data-page-actions]`。这样 e2e 和样式护栏都能按语义定位，而不是按页面类名。

### 3.3 控件契约

- **一个按钮原语**：以 `ui/shadcn/button.tsx` 的 cva variants 为唯一视觉来源；
  `ui/Button.tsx` 保留为兼容入口（`loading`、ref、native submit），但不再新增第三套外观。
  页面类名只能负责**摆放**（margin、grid area、宽度约束），不能声明高度、圆角、背景、字号。
- **尺寸阶梯**：32（紧凑工具）、36（桌面默认/页面主操作）、40（表单/设置导航）、
  44（触屏）。每个页面原型在文档里固定使用哪一档，不再出现 42px / 26px 这类页面私有值。
- **圆角**：控件 12（`--ui-radius-control`）；分区/卡片 16；对话框 24；pill 只用于
  chip、badge、图标圆盘。目录页的 New 按钮从 pill 改回 12，与服务端/设置/表单一致。
- **焦点**：一律 `--ui-focus-shadow`。Admin/Auth 的原生蓝色 outline 必须移除。
- **图标**：统一 lucide 包装，描边 1.75，尺寸 16/18/20；品牌图标用 `<img>`，不再手写
  第三个搜索/加号/箭头 SVG。内联 SVG 只保留品牌、插画和必须自带路径的图形。
- **颜色**：页面 owner 只能读 `--ui-bg-*`、`--ui-text-*`、`--ui-border-*`、`--ui-fill-*`；
  不再出现 `hsl(var(--text-100))` 或 hex。

### 3.4 排版契约

| 角色 | Token | 值（默认） | 用途 |
| --- | --- | --- | --- |
| 页面标题 | `--ui-text-page` | 24/36 600 | 所有标准页 `h1` |
| 落地 hero | `--ui-text-hero` | 28/36 600 | 仅首页问候 |
| 分区标题 | `--ui-text-lg` | 18/28 600 | SectionCard / 表单分组 |
| 正文 | `--ui-text-body` | 16/28 400 | 阅读正文 |
| UI 文本 | `--ui-text-ui` | 14/20 400 | 行、按钮、导航 |
| 元信息 | `--ui-font-size-xs` | 13/18 400 | 时间、描述、辅助 |
| eyebrow | `--ui-font-size-xs` | 13/18 500 | 页头上的小标签 |

不再出现 20/21/26/27/28 的页面标题（28 只留给 hero），也不在页面 CSS 里写字面字号。

### 3.5 覆盖层契约

所有 modal 走 `DialogFrame`（内部用 `FoundationDialog`）：

- 尺寸：sm 400 / md 520 / lg 720；
- header 20/28 600，关闭按钮右上，footer 右对齐主操作；
- body 24 padding，footer 16/24；
- 进出场 180/220ms 进入、120ms 退出，复用现有 `data-ui-motion`；
- 焦点陷阱、Escape、焦点恢复只由 FoundationDialog 实现一次。

迁移顺序：Share、Usage、Visualization、Workspace dialogs、Tutor exploration、Confirm。
Confirm 保留自己的语义 API，但视觉走同一个 frame。

## 4. 分阶段计划

### Phase 0 — 基线与契约（不改 UI）

产出：

- 本计划文档 + 页面矩阵（哪个页面属于 AppPage / FocusedPage / Chat）。
- `frontend/e2e/page-system.spec.mjs` 骨架：用 mock API 打开每个页面，记录页头几何、
  主操作几何、内容列宽、`h1` 数量。
- `docs/ref/page-system-2026-11.md`：1440/1024/390 × light/dark 的截图基线
  （截图放 `frontend/test-results/`，不提交）。
- 在 `AGENTS.md` / `ui-structure.md` 增加一条：新页面必须先选原型、复用 Page Kit，
  不允许新增页面私有按钮/卡片外观。

验收：不改变任何像素；基线截图可重复生成；页面矩阵覆盖全部路由。

### Phase 1 — Page Kit + 试点（Projects）· 已完成（2026-11-23）

产出：

- `frontend/src/react/ui/page/` 的 `PageFrame`、`PageHeader`、`PageToolbar`、
  `PageSearchField`、`PageTabs`、`PageEmptyState`，以及 `features/page-kit.css` 的
  页面列、页头、工具栏、42px 搜索、分段标签、空态样式。
- 用 Projects 做端到端试点：标题、描述、搜索、New、标签、空态全部改用 Page Kit。
- 桌面目录页隐藏空的 44px topbar；`#mainInner` 的聊天 `5vh` 上留白只作用于聊天。
- 更新 `projects-directory.spec.mjs` 与 `library-directory.spec.mjs` /
  `sidebar-nav.spec.mjs` 中随契约变化的选择器和空 topbar 断言。

Phase 1 尚未交付 `DataList`、`SectionCard`、`FormRow`、`ActionBar`、`PageSkeleton`；
它们在 Phase 2–4 随对应页面引入，避免先造未使用的组件。

验收：Projects 页头 24/36/600，主操作 36/12，内容列 1040/32 gutter，移动端 16 gutter；
`projects-directory` 3/3、`library-directory` + `sidebar-nav` 27/27、目录/创建/侧栏合并
47/47 通过；`npm run lint` 与 `npm run build` 通过；没有新增 CSS 债务，baseline 反而下降。

### Phase 2 — 目录与创建页统一 · 已完成（2026-11-23）

范围：Library、Projects、Plugins、Scheduled，以及 Sites、Images、Assistants。全部统一使用 PageFrame、PageHeader、PageToolbar、PageSearchField、PageTabs 与 PageEmptyState。

统一后的结构固定为：

```text
PageFrame
  PageHeader      [eyebrow?] h1 + description          右侧 actions
  PageToolbar     search | filter | view toggle | primary
  PageTabs        segmented scope（All/Active、Public/Personal、All/Created/Shared…）
  DataList / grid / empty
```

具体动作：

- `workspaceUi.tsx` 的 `WorkspacePageHeader` 改为 Page Kit 的组合；Library 的自定义
  `library-head` 删除，Plugins 的 `h2` 改 `h1`，Scheduled 的分段标签改用 `PageTabs`。
- Creation 的 `creation-header`、`creation-primary`、`creation-empty` 删除，改用同一套
  PageHeader/Button/EmptyState；`restore/creation-surfaces.css` 只保留真正的页面内容布局，
  不再拥有页头与主按钮。
- 所有页面的主操作统一为 36px、12px 圆角、同一 padding；New 不再是 pill。
- 列表/网格/行操作统一到 `DataList`；Library 的表格、Plugins 的双列、Scheduled 的卡片
  如果确实需要不同内容密度，用 `DataList` 的 `variant`，而不是复制 CSS。
- 空态统一：图标 40、标题 16/24 600、描述 14/21、操作 36。

验收：

- 五个目录页的页头几何一致（标题 x/y/字号、actions 右边缘、toolbar y）。
- 页面 CSS owner 收敛到 1–2 个文件（建议 `features/pages/directory.css`），
  `polish/workspace.css` 只保留跨页布局修正，`restore/creation-surfaces.css` 不再声明
  页头/按钮外观。
- 删除至少一套重复的 header/toolbar/empty CSS；`lint:css-debt` 与
  `lint:frozen-liveness` 基线只降不升。
- 相关 e2e：library、projects、plugins、scheduled、creation、mobile directories。

### Phase 3 — 账号与管理页（Settings / Profile / Admin）· 已完成（2026-11-23）

先做一个产品决定：Settings 和 Profile 是否都采用 FocusedPage。

- 建议：**都采用 FocusedPage**。两者都是账号域，整页 + 返回 + 二级导航比“一个整页、
  一个留在 shell”更一致；返回后回到原页面，符合当前 Settings 的交互。
- 如果产品更希望保留全局导航，则两者都改为 AppPage + 二级左栏；不要一者整页、一者内嵌。

统一动作：

- `AccountPageHeader` 改为 `PageHeader` 的 `variant="account"`：返回按钮、`h1`、右侧操作、
  底部分隔线；Settings 的 64px 固定 header 和 Profile 的 20/28 标题统一为 24/36 600。
- `AccountPageTitle` 从 `span role=heading` 改为真正的 `h1`（或由 PageHeader 统一渲染）。
- Settings 的二级导航沿用现有 `settings-nav` 布局，但视觉改用 Page Kit 的
  `SegmentedNav`/`SectionNav`；表单行改用 `FormRow`，保存错误用统一的 `PageError`。
- Admin 从居中卡片改为 AppPage：`PageHeader` + `SectionCard`；未登录状态用 `AuthCard`
  （与 Auth gate 同一组件），去掉 `hsl(var(--text-100))` 和自绘按钮。
- Profile 的卡片分区改用 `SectionCard`，标题/说明/内容间距统一。

验收：Settings 与 Profile 的返回按钮、标题、底边框、内容起点一致；Admin 的焦点环、
按钮高度、卡片圆角与 Auth 一致；`legacy/07` 中 admin 的页面外观规则可删除；
`AccountPageTitle` 只渲染一次 `h1`。

### Phase 4 — 考试与学习面板

考试是已签收表面，行为与 `data-exam-*` 钩子不能动；只收敛 chrome 与容器。

- Exam setup：AppPage + PageHeader + 编号 `SectionCard`（编号作为 eyebrow/装饰，
  不再自己写 21/20 700 的 h2）+ ActionBar。
- Exam runner：FocusedPage；顶部只保留退出/标题/计时，不让 model switcher 出现在考试中。
- Exam footer：统一 `ActionBar`，主/次按钮顺序与 Settings 保存条一致。
- Study 的 Diagnostic / Knowledge / MistakeBook / LearningModeBar：容器改用 SectionCard，
  标题走同一套排版 token；它们的共享组件在 `packages/ui/src/study`，通过 host adapter
  传入 class/slot，不在共享包里写 Web 颜色。

验收：考试流程、键盘、焦点、评分行为不变；exam e2e 全绿；页面标题与目录页同字号；
footer 高度/按钮几何与 Settings/表单一致。

### Phase 5 — 覆盖层统一

- ShareModal、UsageModal、Visualization modal、Workspace dialogs、TutorExplorationDialog
  全部改 `DialogFrame`；删除各自的 overlay/header/footer CSS。
- Confirm 保留 `ConfirmDialog` API，视觉走同一 frame；按钮顺序统一为“取消在左、主操作在右”。
- Menu/Popover 统一到现有 `FoundationMenu` / shadcn dropdown，不再为页面写定位/边框补丁。

验收：所有弹窗在 1440/390、浅/深色下的 header 高度、padding、圆角、关闭按钮位置一致；
焦点陷阱与 Escape 由同一实现覆盖；`polish/overlays.css` 中对应自绘规则删除或降为布局。

### Phase 6 — 清理与护栏

- 删除迁移后无消费者的 `workspace-*`、`creation-*`、`admin-*`、`auth-*` 外观规则；
  使用 `scripts/retire-frozen-css.mjs`，确认无消费者后再删。
- 收紧 `css-debt.baseline.json`：live `!important` 7 → 0；页面 owner 的 legacy HSL → 0；
  live 硬编码颜色/字号 → 0；frozen 基线按实际减少量更新。
- 新增/扩展护栏（见第 5 节）。
- 更新 `docs/architecture/ui-structure.md` 的样式所有权图与页面原型说明。

## 5. 防回流护栏

现有护栏继续保留，新增以下四项：

1. **`check-page-ownership.mjs`**
   - 维护“页面家族 → 唯一 owner 文件”的映射；
   - 页面家族的新规则只能进 owner；`legacy/`、`restore/` 不得新增页面外观规则；
   - baseline 只降不升。

2. **`check-page-css.mjs`**
   - 页面 owner 文件的声明白名单：`display/grid/flex/gap/padding/margin/width/height/
     max-width/min-height/overflow/position/inset` 等布局属性；
   - 出现 `color/background/font-size/font-weight/border-radius/box-shadow/!important`
     直接失败（颜色/排版必须来自 Page Kit 或 token）。

3. **`check-page-contract.mjs`（AST + DOM 语义）**
   - 每个 AppPage/FocusedPage 必须使用 `PageHeader`，且只渲染一个 `[data-page-title]`；
   - 页面主操作必须是共享 `Button`，不得新增 `*-btn` / `*-primary` 外观类；
   - 页面 CSS 不得声明按钮高度。

4. **`e2e/page-system.spec.mjs`**
   - 每个原型选 2 个代表页面，断言页头几何、内容列宽、主操作尺寸在 1px 内一致；
   - 断言无横向溢出、无 console error、主题切换后颜色来自 token；
   - 作为 `test:e2e:required` 的一部分（几何断言不是截图，稳定且阻塞）。

另外把现有 `check-surface-ownership` 从“四个聊天外壳”扩展到“页面家族”：sidebar、topbar、
composer、transcript 继续由 parity 拥有；页面家族由 `features/pages/` 拥有；两者不交叉。

## 6. 验收指标

| 指标 | 现状 | 目标 |
| --- | --- | --- |
| 页面原型 | 6 种页头/布局 | 2 种（AppPage / FocusedPage） |
| 页面标题字号 | 20/21/24/26/28 | 24（页面）+ 28（hero） |
| 按钮视觉实现 | 4 套 + 页面私有外观 | 1 个原语 + 固定 variants |
| 声明按钮外观的 CSS 文件 | 48 | ≤ 3（button、row controls、iui skin） |
| workspace 选择器 | 587 条 / 5+ 文件 | ≤ 250 条 / 1–2 文件 |
| settings 选择器 | 226 条 / 4 文件 | ≤ 100 条 / 1 文件 + 共享 account |
| 跨文件重复选择器 | 377 | ≤ 100 |
| live `!important` | 7 | 0 |
| 页面 owner 的 legacy HSL | admin/exam/auth 仍有 | 0 |
| 内联 `<svg>` 块 | 97 | ≤ 20（品牌/插画） |
| 页面级空态/工具栏/对话框 | 各 3–5 套 | 各 1 套 |

不承诺“CSS 总行数减少多少”，因为 Page Kit 会增加少量结构 CSS；承诺的是**重复的页面外观
规则被删除、页面 owner 收敛、护栏阻止再增长**。

## 7. 风险与不做的事

- **不改聊天正文**：服务端 HTML、prose、composer 几何、消息列 768、移动参考密度都不动。
- **不改主题调色板**：`themes.css` 仍然只导入一次且最后；不新增第二套 palette。
- **不重写 `legacy/` / `restore/`**：只迁移消费者、逐条删除；用 `retire-frozen-css.mjs`
  和 `lint:frozen-liveness` 确认无消费者。
- **不动移动参考**：手机目录的 36px 搜索、40px tabs 是参考固定值，Page Kit 只复用结构，
  不把桌面密度套到手机。
- **不动考试行为**：`data-exam-*`、评分、键盘、焦点顺序保持；只换容器和页头。
- **不做大爆炸 CSS 重写**：每阶段一个可回退的 PR；先试点，后批量。
- **不引第二套组件库**：Page Kit 是 shadcn/primitives 的薄封装，不新增设计语言。
- **Bundle 风险**：Page Kit 只做展示，不引入路由/编辑器/重型依赖；按需 import，
  不能把 tldraw/TipTap 拉进入口 chunk。

## 8. 建议的 PR 拆分

| PR | 内容 | 可独立发布 |
| --- | --- | --- |
| 1 | 计划文档 + 页面矩阵 + `page-system.spec.mjs` 骨架 | 是（无 UI 变化） |
| 2 | Page Kit 基础组件 + Projects 试点 | 是 |
| 3 | Library / Plugins / Scheduled 迁移 | 是 |
| 4 | Sites / Images / Assistants（creation）迁移 | 是 |
| 5 | Settings / Profile / Admin 迁移 | 是 |
| 6 | Exam setup/runner + study 面板 | 是 |
| 7 | Share/Usage/Viz/Workspace/Tutor 对话框迁移 | 是 |
| 8 | 删除被替代 CSS + 收紧基线 + 文档更新 | 是 |

每个 PR 的验证：`npm run build`、`npm run lint`（含全部护栏）、该阶段受影响的
`test:one`/Playwright spec、1440/390 浅深色截图。按仓库规则，不在实现中途反复跑全量；
在最终 diff 上做一次合并验证。

## 9. 需要先确认的产品决定

1. **Settings/Profile 是否都做 FocusedPage？**
   建议是。两者同为账号域，整页 + 返回 + 二级导航一致；否则保留一个整页、一个内嵌，
   页头仍会分叉。
2. **桌面目录页是否移除空的 44px topbar？**
   已按建议实施。内容直接以 PageHeader 开始，侧栏折叠按钮由 rail 承担；手机保留 header。
3. **主操作圆角用 12px 还是 pill？**
   建议 12px（`--ui-radius-control`），pill 只给 chip/badge/图标圆盘；这样目录页的 New
   与 Settings/表单/对话框一致。
4. **标签页用一套还是两套语义？**
   建议 `PageTabs` 提供 `segmented`（范围筛选）与 `underline`（页内分区）两种角色，
   但视觉 token 相同；不允许页面自己写 active pill。
5. **Admin/Auth 是否共用 `AuthCard`？**
   建议是。两者都是“居中窄卡片 + 表单 + 主操作”，共用后焦点环、输入高度、按钮宽度一致。

Phase 1 已按上述建议完成。其余四点确认后，从 Phase 2（Library / Plugins / Scheduled /
Sites / Images / Assistants）继续；未确认前不扩大页面改动范围。
