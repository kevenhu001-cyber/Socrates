# shadcn 全量收敛

目标（2026-10-28 决定）：**视觉与语义全量统一**。所有表面——React 组件、保留 HTML
标记、遗留 JS DOM 层——都使用 shadcn 的语义 token 与同一套控件外观；不再有独立的
遗留视觉归属。

不在本轮范围：把遗留 DOM 层重写为 React 组件。那是
`docs/plans/react-typescript-migration.md` 的量级，且要拆掉 `check-chat-layering`
隔离。本轮只要求"看起来、用起来、语义上都是 shadcn"。

前置：`docs/plans/2026-10-28-frontend-shadcn-adaptation.md`（主题桥接，已完成）、
`docs/plans/2026-10-28-shadcn-component-replacement.md`（功能表面组件化，已完成）、
`docs/adr/0024-shadcn-shell-geometry-ownership.md`（几何归属决策）。

## 现状（2026-10-28 实测）

| 表面 | 状态 | 残留 |
| --- | --- | --- |
| React 功能表面（settings / profile / admin / 分享 / 库 / 项目 / 插件 / 计划任务） | 已 shadcn | 0（守卫 `lint:shadcn` 报 0/0/0） |
| 主壳 P1 侧栏 / P2 顶栏 | 结构已 React 化 | 几何仍归 `parity/sidebar.css`、`parity/topbar.css`（P5 删除范围） |
| 主壳 P3 转录行 / P4 composer chrome | 未开始 | 仍是 legacy 层渲染 |
| `index.html` 保留标记 | 未收敛 | 64 `<button>` + 20 `<input>` + 13 `<label>`（auth 表单、侧栏骨架、知识面板等） |
| 遗留 JS DOM 层 | 未收敛 | 32 处 `createElement('button'/'input'/'select'/'textarea')`（render 11 / ui 4 / native 3 / tutor / app / cookieConsent），约 60 个文件用 `innerHTML` 模板 |
| `pages/workspace/workspace.dialogs.ts` | 未收敛 | 项目/任务/插件/连接器表单是 HTML 字符串 + 原生 `<form>`（提交真实 FormData） |
| `ui/NativeControl.tsx` | 有意保留 | 8 处调用点：file / color / range / 混合态 checkbox / radio |

## 不变量

以下任一被破坏即视为回退，不得在收敛过程中"顺手"修改：

- DOM id 契约：`#sidebar`、`#sidebarNav`、`#msgList`、`#composerInputWrap`、
  `#topModelSwitcher`、`#settingsOverlay`、`#projectForm` 等 40 余处按 id 取节点的
  既有代码不得失效。
- 表单语义：原生 `<form>` + `FormData` 的提交路径不变；文件/颜色/范围输入保留原生
  元素与其 ref、事件契约。
- 密度基线：`docs/ref/mobile-reference-2026-10-04.md` 与 composer 快照钉死的像素
  （composer 85、plus/send 36、tools 菜单 244–260 × 300–368）不得漂移；移动端密度
  是独立参考，不与桌面对齐。
- 守卫：`check-surface-ownership`、`check-css-debt`、`check-button-sizes`、
  `check-z-index`、`check-focus-ring`、`check-surface-ladder` 继续有效，且基线只降不升。
- 首屏预算：`staticJsGzipBytes` 当前 361,682 B，上限 365,000 B。原 360,000 B 预算
  尚未恢复；每批交付后必须重测，不得靠抬阈值过关。

## 分批交付

每批一次提交，自带守卫收缩与验证记录。

### B1 — 守卫扩容（先做）

把 `scripts/check-shadcn-adoption.mjs` 的检查面从"已迁移特征目录"扩到全部 React 树，
并新增两条检查：

- 保留 HTML 与遗留 DOM 层不得再出现非 shadcn 语义的控件外观类（按目录给基线，
  基线只降不升）。
- `index.html` 保留标记的控件数进入基线（当前 64 button / 20 input / 13 label）。

目的：让后续每一批的进度可度量，而不是靠人肉盘点。

### B2 — 主壳 P3 / P4（ADR 0024）

转录行与消息工具条、composer chrome 改为 React + shadcn 组件渲染，**外观直接采用
shadcn 语义变体**（secondary / ghost / outline、`rounded-md`、`border-border`、
`hover:bg-accent`、focus ring），几何只从 `--ui-*` token 来；
`parity/transcript.css`、`parity/composer-unified.css` 中被组件接手的规则随之删除。

验收标准（2026-10-29 修订）：视觉向 shadcn 靠拢是**预期结果**，不为保住旧像素而回退
样式。computed-style 探针只用于守住主壳布局契约（composer 单行 52px、控件
36px、tools 菜单 244–260 × 300–368）；`reference-ui-visual` 等快照因换皮而变时更新
基线，而不是改回旧皮肤。

### B3 — 保留标记收敛（`index.html`）

按表面分批把 auth 表单、侧栏骨架、知识面板等保留标记改为同一套 shadcn 控件类，
保留全部 id 与表单行为。优先做 auth（用户可见最密集、控件最多）。

### B4 — 遗留 DOM 层收敛

`src/render/**`、`src/ui/**`、`src/native/**`、`src/tutor*`、`src/cookieConsent.js`
中的 `createElement('button'|'input'|'select'|'textarea')` 与 `innerHTML` 模板改为
同一套 shadcn 控件类；遗留视觉（`.btn`、`legacy/**`、`restore/**` 的控件规则）随之
删除，几何回到 `--ui-*` token。

### B5 — CSS 归属清理与 ratchet 收缩（ADR 0024 P5）

删除 `parity/topbar.css`、`parity/sidebar.css` 中已由组件声明的规则；把
`check-css-debt`、`check-surface-ownership`、`check-button-sizes`、`check-z-index`
的基线收缩到新的真实值，并逐项记录放弃了什么、为什么。

### B6 — 入口体积回归

把 `staticJsGzipBytes` 压回 360,000 B 以内，恢复原预算上限，而不是继续沿用
365 KB 的临时额度。

## 进度记录

| 批次 | 状态 | 提交 / 证据 |
| --- | --- | --- |
| B1 守卫扩容 | 完成（2026-10-29） | `c9483ad1`：四条基线入库（97 / 30 / 140 / 32），`npm run lint` 全绿 |
| B2 composer 芯片行与队列条 | 完成（2026-10-29） | 见下 |
| B2 composer 工具菜单 | 完成（2026-10-29） | 见下 |
| B3 auth 登录页 | 皮肤完成（2026-10-29） | 见下；标记仍是保留 HTML，React 化未做 |
| B3 workspace 弹窗表单 | 完成（2026-10-29） | 见下；HTML 字符串模板已整体删除，改 React 视图 |
| B4 代码块与 tutor 内联控件 | 完成（2026-10-29） | 见下；仍是 legacy DOM 构建 |
| B4 cookie 同意条 | 完成（2026-10-29） | 见下 |
| B4 工具卡片 | 完成（2026-10-29） | 见下；保留「无边框行」的转录语法 |
| B4 creation 表面（Images / Assistants / Sites） | 完成（2026-10-29） | 见下；模板仍是 HTML 字符串，皮肤归 shadcn 语义 |
| B2 其余（转录行正文、composer 主控件） | 未开始 | 主控件在 `index.html` 保留标记里，需先做 B3 的 React 挂载 |

### B2 · composer 芯片行与队列条（2026-10-29）

目标改为**视觉上真的长成 shadcn**，不再以零像素差异为验收：

- 插件芯片 → shadcn `Badge variant="secondary"`；web search 芯片与 `+N more`
  → `Button variant="secondary" size="sm"`；移除按钮 → `Button variant="ghost"
  size="icon-xs"`。圆角从药丸改成 `rounded-md`，加 `border-border` 与
  `bg-secondary` / `hover:bg-accent` 的 shadcn 皮肤。
- 队列条 → shadcn 卡片（`rounded-lg border-border bg-card`）+ `Badge`
  variant="secondary" + `Button variant="ghost"`（Edit 用 `size="xs"`，
  Cancel 用 `size="icon-xs"`）。
- `composer-unified.css` 删掉两段控件的皮肤与盒子规则，只留 composer 网格槽位、
  glyph/× 交叉淡入和手机覆盖。

保留的硬约束（这两条不能因为换皮而漂移）：composer 单行仍为 52px、
`--composer-control` 36px 的控制高度不变；类名全部保留，e2e 与
`composerShapeGeometry.ts` 的节点契约不动。

验证：`composer-layout`、`chat-preparation`、`plugin-directory` 共 18 例通过；
`reference-ui-visual`、`composer-tool-visual`、`composer-tools-visual-baseline`、
`shadcn-theme` 共 10 例通过（视觉基线未受影响）；`npm run build` / `npm run lint`
通过。

### B2 · composer 工具菜单（2026-10-29）

`+` 菜单的每一行改成与 `FoundationMenu` 同一套 shadcn 菜单语法：行高 32px、
`rounded-md`、`padding 4px 6px`、16px 线性图标（去掉 36px 圆形图标底）、
分组标题 12px/medium/muted、快捷键右对齐、hover 与键盘焦点统一 `bg-accent` +
`accent-foreground`。行高从 48px 收到 32px 是这次换皮最明显的可见变化，菜单整体变矮。

`ComposerToolItems`、`ComposerPluginItems`、`FormattingToolbar` 三个文件的按钮同时
从 `ui/Button` 兼容壳改为直接 `ui/shadcn/button`，composer 目录下不再有兼容壳引用。

验证：`composer-tools-compat`、`composer-tools-visual-baseline`、`composer-layout`、
`mobile-composer-ux` 共 18 例通过；`check-css-debt` 的 `stackedId` 维持 43（焦点态
与 hover 合并为一条规则，没有新增 id 叠加）；`check-focus-ring` 通过（沿用
`--ui-focus-shadow` 契约）；build 与 lint 通过。

### B3 · auth 登录页（2026-10-29）

登录/注册卡改用 shadcn 的表单语法，标记与 id 全部保留：

- 标签：11px 大写字距小标签 → `text-sm` / `font-medium` / 正常大小写
- 输入框：36px 高、`rounded-md`、`border-input`、透明底、`text-sm`，
  焦点走 `--ui-focus-shadow` 契约
- 主/次按钮：36px 高、`rounded-md`、`bg-primary` / `border-input bg-background`
- 页签：下划线 tab → shadcn 分段控件（`bg-muted` 轨道 + 选中项 `bg-background`
  + `shadow-sm`），高度落在 `--ui-control-sm` 阶梯上

仍是保留 HTML + legacy 控制器（`auth/index.ts` 按 id 绑定），所以这一批只换皮肤、
不动表单行为；把 auth 变成 React 组件属于 B3 的下一步。

验证：`auth-direct-handlers`、`chrome-i18n`、`reference-ui-visual`、
`visual-system-convergence` 共 16 例通过；`check-button-sizes` 0/0、
`check-focus-ring` 通过（改用共享 token，未自绘阴影）；build 与 lint 通过。

### B3 · workspace 弹窗表单（2026-10-29）

项目 / 任务 / 连接器凭据 / 插件管理 / arXiv 搜索这几个弹窗共用 `.workspace-field`、
`.workspace-primary/secondary/danger`，所以换皮只动这两组语义类：

- 输入/下拉/文本域：36px、`rounded-md`、`border-input`、透明底、`text-sm`；
  文本域 `min-height: 72px`；`input[type=color]` 收成 48px 色块，不再拉满整行
- 焦点：`border-color: var(--ring)` + 共享 `--ui-focus-shadow`
- 标签：11px/600 → 14px/500 正常大小写；`Optional` 标记降到 12px muted
- 按钮：36px、`rounded-md`、`bg-primary` / `border-input bg-background` /
  `text-destructive`，替换掉 `--cg-*` 旧皮肤

`restore/chatgpt-ui.css` 里带 `!important` 的那段是这些控件的实际所有者，直接改写；
`features/surfaces.css` 只留 id 级兜底。`check-css-debt` 的 `literalRadius` 285 → 283、
`literalFontSize` 64 → 63，`important` 维持 645。

验证：`projects-directory`、`plugin-directory`、`scheduled-tasks`、
`reference-ui-visual` 共 14 例通过；build 与 lint 通过。

### B3 · workspace 弹窗 React 化（2026-10-29）

换皮之后这些弹窗仍是 `innerHTML` 字符串，控件永远绕不开 `check-shadcn-adoption`
的模板基线。这一批把整层改成 React 视图：

- `workspace.dialogHost.tsx`（新）：`#workspaceDialog` 里挂一个 `workspace-dialog-card`
  宿主，用 `mountOwnedRoot` 建根（不自己 `createRoot`，`check-react-roots` 要求唯一
  创建者），并包在 `flushSync` 里提交——调用方紧接着要 `querySelector('#projectForm')`
  绑定提交，异步渲染会让 id 还不存在。
- `workspace.dialogViews.tsx`（新）：`ProjectFormView`、`ScheduledTaskFormView`、
  `ProjectWorkspaceView`、`AgentRunView`、`ConnectorCredentialsView`、
  `ManageConnectorView`、`ArxivSearchView`、`ZoteroSearchView`，外加
  `DialogHeader` / `Field` / `DialogActions`。`Field` 用 shadcn `Label` 包住控件，
  避免新增裸 `<label>`。
- `workspace.dialogs.ts` → `.tsx`：删掉 `showWorkspaceDialog(markup)`、
  `dialogHeader()`、`projectFormMarkup()`、`scheduledTaskFormMarkup()`、
  `dateTimeLocalValue()`，八处调用改为 `showWorkspaceDialogView(<View/>)`。
- 保留的契约不变：仍是原生 `<form>` + `FormData` 提交，`#projectForm` / `#taskForm`
  / `#projectConnectorForm` / `#arxivSearchForm` / `#zoteroSearchForm` 的 id 与
  `data-action` 挂点全部沿用；`bindProjectForm`、`bindScheduledTaskForm` 的绑定代码
  一行未改。

`reactTemplateControls` 基线 32 → **0**（React 树内已无 HTML 模板控件）。

验证：`npm run build`、`npm run lint` 全绿；`projects-directory`、
`plugin-directory`、`scheduled-page` 共 13 例通过。

### B4 · 代码块与 tutor 内联控件（2026-10-29）

遗留 DOM 层里最常出现的两组控件换成 shadcn 语法（节点仍由 `createElement` 构建，
这一批只换皮肤，不动构建方式）：

- 代码块头：`Copy code` / `Open in Workbench` 两个按钮 → 24px、`rounded-sm`、
  `text-xs`/medium、`hover:bg-accent`、焦点 `--ui-focus-shadow`；
  `copied` / `copy-failed` 状态改用 `--primary` / `--destructive`
- tutor 内联控件：`隐藏答案`、`隐藏提示`、`查看答案` 三个 reveal/toggle 按钮 →
  32px、`rounded-md`、`border-input`、`bg-background`；`提交` → `bg-primary`；
  选择题选项 → `rounded-md` + `border-input`，选中态 `bg-accent` + `ring` 边框，
  正确/错误态改用 `--ui-success` / `--destructive` 的 color-mix，不再写死色相

验证：`code-copy-visual`、`tutor-inline-widgets` 共 5 例通过；截图确认代码块头与
tutor 卡片的新观感；build 与 lint 通过。

### B4 · cookie 同意条（2026-10-29）

底部同意卡换成 shadcn 卡片与按钮：`rounded-xl` + `border` + `bg-card`，
标题 `text-sm`/medium，正文 `text-muted-foreground`，两个按钮 36px、`rounded-md`，
主按钮 `bg-primary`、次按钮 `border-input bg-background`，焦点走 `--ui-focus-shadow`。
`cookie-consent` 2 例通过。

### B4 · creation 表面（Images / Assistants / Sites）（2026-10-29）

`src/ui/creationSurfaces.js` 的三个目录页与两个编辑器仍是 HTML 模板，皮肤全部由
`restore/creation-surfaces.css` 承担。这一批把该文件的调色板整体换成语义 token，
不留一处 `--chatgpt-*`：

- 面板 / 卡片：`--background` → `--card`，边框统一 `--border`，圆角走
  `--radius-lg` / `--radius-xl`；站点 banner 与图片表单变成 shadcn 卡片。
- 输入 / 文本域 / 下拉：36px、`rounded-md`、`border-input`、透明底、`text-sm`，
  焦点 `border-color: var(--ring)` + `--ui-focus-shadow`。
- 主操作 `.creation-primary` → `--primary` / `--primary-foreground`，
  hover 用 `color-mix(... transparent 20%)`（等价 `bg-primary/80`），禁用态 `opacity:.5`。
- 行内操作与发布按钮 → ghost：`--muted-foreground`，hover `--muted` + `--foreground`。
- 站点列表/网格切换 → shadcn 分段控件（`--muted` 轨道 + `--background` 抬升块），
  桌面 32px、手机 40px；轨道收成 `width: max-content` 靠右，不再拉满整行。
- 站点行菜单 → popover：`--popover` / `--popover-foreground`、`rounded-md`、`p-1`，
  菜单项 `rounded-sm` + `hover:bg-accent`。
- 标签从 13px muted 改成 `text-sm` medium 的 `--foreground`，与 auth / 弹窗表单一致。

验证：`creation-surfaces`、`detail-surface`、`reference-ui-visual` 共 12 例通过；
build 与 lint 全绿（`check-css-debt` 与 `check-button-sizes` 计数未变，该文件属
`restore/` 冻结区）。

### B4 · 工具卡片（2026-10-29）

工具卡片是聊天里出现频率最高的组件，也是最后一块大的遗留皮肤。**刻意保留**
「静止时无边框、无填充的单行」这一转录语法（文件头写死的设计意图，也是
`tool-status-visual` 钉住的形态）；换的是交互语言与决策面：

- 行头 hover 从「只变字色」改为 shadcn 的 `bg-accent` + `accent-foreground`，
  圆角 `--radius-md`；焦点加 `--ui-focus-shadow`
- 审批卡从 tinted 自绘块改为 shadcn 卡片：`border` + `bg-card` + `--radius-lg`
  + `shadow-sm`
- 审批按钮从药丸改为 shadcn 两档：`Allow once` = `bg-primary` +
  `primary-foreground`，`Decline` = `border-input bg-background`，32px、
  `--radius-md`、hover `bg-accent`
- 顺手修了审批事实标签在 `DESTINATION` 处折行的问题（`flex: 0 0 62px` →
  `0 0 auto` + `min-width`）

验证：`tool-run-group`、`tool-status-visual`、`tool-run-approval`、
`visual-system-convergence` 共 21 例通过；审批卡暗色截图逐项核对
（卡片、主次按钮、事实行、状态行）；build 与 lint 通过。

## 待决问题

1. **遗留 HTML 怎么拿到与 React 相同的控件外观？** 两条路：
   - 扩大 Tailwind 扫描范围到遗留文件（遗留标记直接用与 React 相同的 utility 类名），
     代价是 CSS 体积增长，且 ADR 0024 第 3 条"utilities 低于 unlayered 规则"的边界
     需要重新划线；
   - 在 `foundations/shadcn.css` 里定义语义控件类（`.ui-button` 等），React 组件与
     遗留标记共用，代价是 cva recipe 与 CSS recipe 两处维护、可能漂移。
   倾向前者（单一 recipe 来源），但要重新评估 CSS 体积与 unlayered 优先级。
2. **遗留 DOM 层要不要引入 React？** 本轮不引入。若 B4 之后遗留层仍然是最脏的一块，
   再单独评估 `react-typescript-migration` 的分批方案。

## 验证

每批交付后：受影响映射到的 Playwright spec、`npm run lint`、`npm run build`、
以及 `npm run test:unit`。截图检查写入 `frontend/test-results/`。守卫基线的每次
收缩都要在提交信息里说明放弃了什么。
