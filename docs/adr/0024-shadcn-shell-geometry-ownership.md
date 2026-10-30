# ADR 0024 — shadcn 组件承接主壳结构与几何归属

- 状态：Accepted
- 日期：2026-10-28
- 决策者：项目所有者
- 关联：ADR 0023（Geist 中性色阶与应用外壳）、`docs/plans/2026-10-28-frontend-shadcn-adaptation.md`、`docs/plans/2026-10-28-shadcn-component-replacement.md`、`frontend/scripts/check-surface-ownership.mjs`、`frontend/scripts/check-css-debt.mjs`

## 背景

2026-10-28 的 shadcn 适配把 settings / profile / admin / share / dialog / menu 迁到了本地
`src/react/ui/shadcn/` 组件上，主题变量也桥到了 `themes.css`。主壳（侧栏、顶栏、转录、输入框）
仍是 `index.html` 的保留 HTML 加 `parity/*.css` 几何。两套写法并存带来三个具体问题：

1. **几何有两个潜在 owner。** `Button` 的 cva 声明了 `h-(--ui-control-desktop)`，而同一元素的
   旧类名仍被 `parity/sidebar.css` 选中。Tailwind 工具类在 `@layer utilities`，产品规则是
   unlayered，所以 utilities **永远输给** 旧的 owner 规则——颜色跟着变量走，尺寸不跟。
2. **`philosophy` 主题没有覆盖 `--ring`**，而 `--ui-focus-ring` 取的就是 `--ring`，于是该主题的
   焦点环是 Geist 蓝而不是陶土色。这是桥接层的既有状态，不是缺陷修复目标。
3. **新增 shadcn 源有反噬。** 官方注册源若整体覆盖 `dialog.tsx`，会丢掉焦点恢复、嵌套遮罩
   inertness 与产品 z 阶梯。

## 备选方案

### A. 只保留主题变量，主壳不动

颜色统一，几何仍归 `parity/*.css`。改动最小，但主壳继续是"HTML + owner CSS"，与已迁移的
React 表面是两套心智模型。

### B. 组件承接结构，`--ui-*` 承接几何（本决策）

主壳改由 shadcn 组件渲染，组件只声明"结构 + 语义变体"，具体像素仍来自 `--ui-*` token；
`parity/*` 中对应的几何规则在同一次提交里删除，归属明确到一处。

### C. 照搬 shadcn 默认尺寸

组件自带 32/36/40 的默认档。但仓库已经用 `docs/ref/mobile-reference-2026-10-04.md` 与 8 张
composer 快照钉死了像素值（composer 85、plus/send 36、tools 菜单 244–260 × 300–368），
照搬默认值等于重做全部视觉基线。否决。

## 决策

选择 **B**。

### 1. 几何只从 token 来

组件不写 px 字面量，使用 `--ui-control-desktop`（36）、`--ui-control-sm`（32）、
`--ui-control-touch`（44）、`--ui-radius-row`（10）、`--ui-radius-composer*`、`--ui-z-*`。
`check-button-sizes.mjs` 与 `check-z-index.mjs` 继续作为门禁。

### 2. owner 转移是显式的

一个表面从 `parity/*.css` 移交组件时：

- 先让组件复现同一组像素值；
- 再删除 `parity` / `polish` 中对应规则；
- 同步 `check-surface-ownership.mjs` 的 `owners` 白名单；
- 删除整份文件时，同时改 `styles/index.css` 与 `index.html` 的 slice 清单
  （`check-css-debt.mjs` 逐文件比对级联位置）。

删除样式永远单独成一次提交，保证可以只回滚样式。

### 3. utilities 层不覆盖产品表面

Tailwind 仍只扫描 `src/react`，不引 Preflight，utilities 低于 unlayered 规则。这条不变：
组件要么自带完整几何，要么显式接受 owner 的几何（`surface` / `plain` 变体）。

### 4. 注册源不整体覆盖

新增组件以"适配后的本地源"入库：无 `animate-in` 系列（仓库没有 `tw-animate-css`，
动效走 `--ui-duration-*`），z 轴用 `--ui-z-*`，浮层用 `bg-popover` + `ring-foreground/10`，
`data-slot` 命名与既有组件一致。`sheet.tsx` 由 `dialog.tsx` 镜像而来，不引入会覆盖
`dialog.tsx` 的上游版本。

### 5. `philosophy` 的焦点环保持 Geist 蓝

该主题只覆盖表面与强调色，`--ring` 沿用 `[data-mode]` 的 Geist 投影。焦点环作为跨主题的
可见性信号，不随 accent 变化。这是一条有意记录的选择，不是待修缺陷。

## 后果

- 主壳的 DOM id（`#sidebar`、`#sidebarNav`、`#msgList`、`#composerInputWrap`、`#topModelSwitcher`
  等）仍是契约：`src/chat/**` 与 `src/ui/**` 共 40 余处按 id 取节点，迁移不得改名。
- 首屏 bundle：`Sheet` / `Dialog` 等交互运行时只在真正需要时动态导入移动抽屉，
  `performance-deferred-runtime` 门禁不变。
- 视觉回归以"像素不变"为前提推进：任一阶段若 `reference-ui-visual` 或 composer 快照出现
  非零差异，先回退几何，再继续。

## 实施记录（P1 侧栏 / P2 顶栏）

### P1 侧栏

`SidebarNavButton` / `SidebarHeader` / `SidebarFooter` / `RecentsHeader` / `RecentsFilterChip`
改由本地 shadcn `Button` 渲染；`.sidebar-nav-btn` 的基座 / hover / active / svg / label 规则
同时从 `parity/sidebar.css`、`polish/sidebar.css`、`legacy/13-composer-rich.css` 删除。
落地前用 computed-style 探针取了"改动前"数值（展开 243×36 / pad 6-10 / radius 10 / fs16 /
line-height 28；折叠 36×36 / padding 0 / 居中；移动 260×48 / grid / line-height 24），改后逐项复现。

### P2 顶栏

`index.html` 的整块 `.top-bar` 静态标记收敛为 `<div class="top-bar" id="topBar"></div>`，
控件由 `src/react/topbar/TopBar.tsx` 渲染，`#topModelSwitcher` / `#findBtn` / `#shareBtn` /
`#topModeSwitch` / `#pluginWorkspaceTabs` / `#mobileMode` 等 id 逐字保留。

几何**没有**迁到 utilities，仍归 `parity/topbar.css`（这是本 ADR 第 3 条的直接结果：unlayered
仍声明该属性时 utilities 不生效）。该文件只新增一条声明：

- `#appShell #topModelSwitcher { flex-shrink: 1 }` —— primitive 自带 `shrink-0`，长模型名会把
  控件顶到居中分段控件下面（`global-ui-system.spec.mjs` 的 1010/820 两档断言）。

结构换主人后，三处"按节点直接绑定"的行为失效，改为事件委托：

- `src/ui/legacyShellListeners.ts`：`#sidebarOpenBtn` / `#mobileIncognitoBtn` /
  `#mobileNewChatBtn` / `#findBtn` / `#shareBtn` / `#apiSettingsBtn` / `#mobileModeTrigger` /
  `#mobileConfigBtn` / `#mobileModeMenu .mobile-mode-item[data-mode]` 由一个 document
  click 监听按 selector 派发；
- `src/sidebar/nav.ts`：`#pluginWorkspacePluginsTab` / `#pluginWorkspaceSkillsTab` 同理，
  且 `syncSelection` 每次按 id 取值（原实现闭包持有启动时的静态节点）；
- `src/ui/mobileModeSwitch.ts`：`#topModeSwitch` 的 click / 方向键原绑定在 group 上，
  改为 document 委托（该模块在 React 挂载之前求值，`getElementById` 返回 null）。

`mountTopBar` 在首帧后补跑 `syncChatModel` / `syncEffortUI` / `syncMobileModeSwitch`：
 legacy 运行时在这三个节点存在之前就把模型名、字形与模式标签写进去了，
 首次 React 渲染会覆盖掉。

### 与计划的两处有意偏差

1. **不用 `ToggleGroup`。** `toggle-group.tsx` / `toggle.tsx` 都 import `@base-ui/react`，
   静态引入会把该运行时拉进 entry chunk；且分段控件的选中态由产品自己的滑动 thumb 绘制，
   不是每个 option 的背景。改用两个 `Button` + `data-active` 轨道。
2. **不用 `Tooltip` / `DropdownMenu` 包裹顶栏控件。** `#topModelSwitcher` 已有的
   chat-configuration 弹层（`data-chat-config-trigger`）与 find/share 的直接动作已是既有契约，
   套一层 base-ui 浮层只会增加 entry chunk 成本。

### 未完成项

- `performance-loading.spec.mjs` 的 `staticJsGzipBytes` 实测 **361,688 B**，上限 360,000（超
  1,688 B / 0.47%）。顶栏根已改为动态导入（`specs.tsx`）以回收大部分体积，仍差一点；
  需要在 P3 之前把 entry chunk 压回预算内，或单独评估该阈值。
- P3（转录行 / 工具条）、P4（composer chrome）、P5（CSS 清理与 ratchet 收缩）尚未开始；
  `parity/topbar.css` 与 `parity/sidebar.css` 仍各自持有其几何，属 P5 的删除范围。
