# ADR 0023 — 采用 Geist 中性色阶并重做应用外壳

- 状态：Accepted
- 日期：2026-10-25
- 决策者：项目所有者
- 关联：ADR 0020（Lobe-aligned design foundation）、`docs/ref/ui-system-2026-10-24.md`、`frontend/scripts/check-surface-ladder.mjs`

## 背景

Socrates 的中性色板来自 ADR 0020：语义 API（`--ui-*` / `@socrates/theme`）是 Lobe UI v6 的桥接，具体中性值取 Lobe 默认。这套值当初是对着 ChatGPT 视觉对齐逐档调出来的，不是一个公开色阶的投影，于是有两个长期问题：

1. **色阶没有外部真源。** 每一档明度、每一处边框、每一级文字都是手工挑的，改一档要连带校四个端（web / shared / RN / tokens 副本）。
2. **暗色画布是纯黑 `#000000`**（ADR 0020 的 layout），而项目自身的「禁用纯黑」契约与纯黑画布的阴影塌陷本来就冲突。

Vercel 的 Geist 设计系统提供了公开、权威的色阶（`--ds-gray-*`、`--ds-background-*`、`--ds-gray-alpha-*`）与组件规格（radius 6 / 8、control 32 / 36 / 40、popover 行 36px / 圆角 6px、dialog radius 8px、蓝色焦点环）。它与 ADR 0020 已经落地的基础度量几乎逐值吻合——spacing 4/8/12/16/24/32/40/64/96、radius 6/8、control 36 都在同一档位上——所以换掉色值不需要推翻度量层。

与此同时，应用外壳（顶栏、侧栏、命令面板）当时仍是三套各自为政的形态：顶栏是「填充药丸 + 幽灵按钮」，侧栏是「标签即输入框」的透明行，命令面板是 legacy 皮肤里 20px 圆角 + 0.5px 半透明描边的卡片。三者与 Geist 的控件形态（6px 圆角、1px 发丝边、surface 抬升）没有交集。

## 备选方案

### A. 维持 Lobe 色板，只重做组件

组件能改成 Geist 形态，但底下的色阶仍是手工值：同一个「次级文字」在深浅两套面板上的对比度要手工校，Geist 蓝焦点环放进 Lobe 的暗色画布上也要单独调。省掉的是一次换色，代价是色板继续没有真源。

### B. 采用 Geist 官方灰阶 + 重做应用外壳（本决策）

把 Geist 的 `--ds-*` 阶原样搬进 `themes.css`，Socrates 的四层表面映射到 Geist 表面阶的**连续四步**，再用同一套 token 重做三个外壳表面。代价是全站色值变动、e2e 颜色断言要同步、阶梯守卫要改契约。

### C. 换成 Geist React 组件库

直接引 `@vercel/geist`，组件形态与可访问性都是现成的。代价是把整个外壳交给第三方 React 树，与仓库「frozen legacy 层 + 渐进迁移」的路线冲突，且 `packages/` 必须保持 DOM-free 的约束会让 RN 端无法复用。否决。

## 决策

选择 **B**。

### 1. 色板以 Geist 官方 token 为真源

`frontend/src/styles/themes.css` 是唯一色板 owner，每个模式声明原始阶：

- `--geist-background-100` / `--geist-background-200`（页面与画布）
- `--geist-gray-100` … `--geist-gray-1000`（文字、边框、抬升表面）
- `--geist-gray-alpha-100` … `--geist-gray-alpha-1000`（叠在未知表面上的半透明洗色）
- `--geist-blue-700` / `--geist-blue-900`（焦点环）

`--ui-*` API 名称与语义不变，只是值的来源换成了 Geist 阶。Lobe 命名空间继续桥接到同一批 `--ui-*` 角色。

### 2. 阶梯契约从「等距明度带」改为「Geist 表面阶的连续四步」

原守卫要求四层表面落在 1.5%–3% 的等距明度带内，这与 Geist 自身的阶距不兼容（暗色第一档 page → rail 真实相差 6.27%，是 Geist 页面色与灰阶之间的固有间隔）。新契约由五部分组成：

1. 四档必须是 Geist 表面阶的**连续四步**（暗色 `background-100 → gray-100 → gray-200 → gray-300`，亮色 `background-200 → gray-100 → gray-200 → background-100`）；
2. 角色明度顺序正确（page < rail < panel < elevated）；
3. 画布不是纯黑；
4. legacy `--bg-*` 通道与 `--ui-bg-*` 双射；
5. web / shared / RN 三端同值。

1.5%–7.0% 明度带降级为兜底网，不再是主约束。守卫基线改为记录 `{step, value}` 形状，**档位名本身成为可评审的部分**——不再只是「四个相近的灰」。

### 3. 暗色画布取 Geist `background-100` = `#0a0a0a`

不是 Geist 的 `#000000`。纯黑会把最底层读成「界面被戳了个洞」，也会压掉阴影细节；`#0a0a0a` 仍然是 Geist 官方页面色，同时满足项目自身的禁纯黑契约。亮色画布取 `background-200` = `#fafafa`，抬升表面取 `background-100` = `#ffffff`——亮色下抬升表面比画布更亮，靠明度差而不是阴影分层。

### 4. 文字三级保留，但来源显式化

Geist 只定义两级可访问文字（gray-900 次级、gray-1000 主文字）。Socrates 的第三级（tertiary / muted / placeholder）取 Geist 旧 `--accents` 阶：暗色 `#999999`（accents-6）、亮色 `#666666`（accents-5）。这样四级表面上的每一级文字都 ≥ 4.5:1（暗色 tertiary 最低 5.11:1，亮色 4.82:1）。

### 5. 交互色改用命名档位

`--ui-bg-control` / `--ui-bg-bubble` = gray-400，`--ui-bg-pill-selected` = gray-500（暗）/ gray-300（亮），不再用 `color-mix` 百分比混色。原因是百分比混色会随底色漂移：在新的 elevated 表面上，原方案会把 control 推到 `#3d3d3d`，使 tertiary 文字跌到 3.81:1。

### 5b. 语义色调跟着阶梯一起重算

`--ui-danger` / `--ui-success` 是文字色，必须在每一档表面上都 ≥ 4.5:1。阶梯变亮之后，暗色的 `rgb(233 83 80)` 在 elevated 阶只有 4.03:1，因此暗色 danger 提到 `rgb(240 119 117)`（5.3:1）。同时把共享包的**亮色** danger / success 对齐到 web 已经校过的值（`#b02d1c` / `#0c6e33`）——共享包此前还留着旧的一对亮色（3.2:1），Universal app 一直在用它。现在 web 与共享包的语义色调逐值一致，并由 `themePalette.test.mjs` 守住。

### 6. 焦点环保留 Socrates 的环形状，只换颜色

采用 Geist 的蓝色焦点环（暗色 `--geist-blue-900`，亮色 `--geist-blue-700`），但**不**采用 Geist 的「2px 页面色间隙 + 4px 蓝环」结构——项目在 2026-10-25 刚因为间隙色随表面错位而移除它。Socrates 的形状保持「2px 实环 + 1px 外辉」，`--ui-focus-shadow` 的两层结构不变。

### 7. 应用外壳按 Geist 控件形态重做

- **顶栏**：模式开关改成 Geist 分段控件（透明轨道 + 1px `--ui-border-default` 发丝环，thumb 是抬升表面 + 发丝边 + 控制阴影）；模型切换器从幽灵按钮改成 Geist outline button（1px 边框 + 6px 圆角 + surface 底）；分享/查找按钮改 6px 圆角 + 16px 图标；顶栏底线改 Geist 默认发丝线。顺带删掉亮色模式「所有分段都用主文字色」的覆盖——那让开关失去了状态线索。
- **侧栏**：搜索框从「标签即输入框」的透明行改成 Geist Input（1px 边框 + 6px 圆角 + surface 底，focus-within 用强边框 + 项目焦点环）；导航行与历史行圆角改 6px；分隔线改 Geist 默认发丝线（`--ui-sidebar-border` → `--ui-border-default`）。
- **命令面板**：卡片从 20px 圆角的对话框改成 8px 的 Geist 命令面（`--ui-radius-md`）+ 默认发丝边框；结果行 6px 圆角，hover 用半透明洗色、选中用命名档位（`--ui-bg-pill-selected`）而不是 control 填充——卡片本来就坐在 elevated 阶上，control 填充会与它几乎同色；kbd 改成 Geist chip（control 底 + 发丝边 + Geist Mono）。

移动端密度是 reference-pinned（`docs/ref/mobile-reference-2026-10-04.md`），本轮不动。

### 8. 三端同步与守卫

`packages/theme/src/tokens.ts`（HSL 源）与 `packages/theme/src/rn.ts`（hex 投影）逐值一致；`frontend/src/ui/tokens.ts` / `.js` 是同一份 web 副本。`check-surface-ladder.mjs` 与 `check-focus-ring.mjs` 改为解析 `var()` 链后比对实际渲染值，而不是字符串比对。

## 影响

- **代码**：`frontend/src/styles/themes.css`、`packages/theme/src/{tokens,rn}.ts`、`frontend/src/ui/tokens.{ts,js}`、`frontend/src/styles/parity/{topbar,sidebar}.css`、`frontend/src/styles/polish/{overlays,sidebar}.css`、`frontend/src/styles/features/surfaces.css`、两个守卫脚本与其基线、`frontend/test/themePalette.test.mjs`、八个 e2e spec 的颜色与圆角断言。
- **数据**：无 schema 变更，无持久化格式变更。
- **部署**：纯前端资源改动，无迁移、无 worker 重启。
- **文档**：本 ADR；`docs/ref/ui-system-2026-10-24.md` 加了「部分被取代」的抬头，`docs/ref/mobile-reference-2026-10-04.md` 的 Colors 行随阶梯重新定值；ADR 0020 加了「被 0023 修订」的抬头，度量层仍然成立。
- **兼容**：`--ui-*` 变量名与语义、`@socrates/theme` 导出、legacy `--bg-*` 通道名全部保留；frozen 的 `legacy/` 与 `restore/` 层继续读 legacy 通道。

## 可逆性

- 回滚成本：中。回滚本次改动会同时退回色板与外壳形态，且 e2e 颜色断言、两个守卫基线要一并还原。
- 回滚步骤：按「色板」与「外壳」两组分别回滚；色板组回滚后须重跑 `node scripts/check-surface-ladder.mjs` 与 `node scripts/check-focus-ring.mjs` 确认基线仍匹配（基线只能用 `--update` 显式变更，不要手改）。

## 相关链接

- ADR 0020 — Lobe-aligned design foundation（度量层仍然成立，本 ADR 只替换中性色值与外壳形态）
- ADR 0003 — 结构与技术债分类治理规则（CSS 债基线与守卫口径）
- `docs/ref/ui-system-2026-10-24.md` — 迁移前的设计系统快照
- `docs/ref/mobile-reference-2026-10-04.md` — 移动端密度参考（本轮不动）
- `frontend/scripts/check-surface-ladder.mjs` — 阶梯契约的可执行版本
- Geist 官方色阶与组件规格：https://vercel.com/geist/colors 、https://vercel.com/geist/introduction
