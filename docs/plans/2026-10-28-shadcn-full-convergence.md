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
| B2 composer 芯片行 | 完成（2026-10-29） | 见下 |
| B2 其余（转录行正文、composer 主控件、队列条、工具菜单） | 未开始 | — |

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
