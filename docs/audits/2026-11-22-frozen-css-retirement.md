# 冻结 CSS 清理审计（2026-11-22）

> 这是一份 dated snapshot：记录 2026-11-22 对 `frontend/src/styles/legacy/`
> 与 `styles/restore/` 的清理范围、方法和实测数字。它不描述未来计划。

## 背景

这两个目录是 2026-09 之前 `styles.css` 单体的兼容层，仍被 `styles/index.css`
第二层导入。2026-11-22 的 `08c74a47` 已按「选择器命名的 class 是否还被任何源码
emit」删掉了 516 个死选择器，`check-frozen-liveness` 基线归零；但「class 存在」
不等于「规则有效」。本轮只删除可证明无效的规则，不按单次运行时探测到的
「未匹配」直接删。

## 方法

1. **级联顺序**：从 `styles/index.css` 递归展开 `@import`，得到每条规则的
   文件顺序与 `@media` / `@supports` 上下文。
2. **四类可证明无效**：
   - `@keyframes` 名称在全部 CSS 的 `animation`/`animation-name` 声明、全部
     first-party JS/TS 与 HTML 中都不出现；
   - 同一选择器、同一 at-rule 上下文里，后出现的规则重新声明了该规则的**全部**
     属性（`!important` 也要求同级压倒），前一条永远不可能生效；
   - 选择器身份 class 只出现在 `frontend/test` 或 `frontend/e2e`（测试断言它们
     在产物中不存在），生产源码不 emit；
   - 声明读取了整棵 CSS 都未定义、且没有 fallback、JS 也不设置的
     `var(--…)`——该声明在计算值阶段无效。
3. **运行时探测（仅用于评估剩余规模，不作为删除依据）**：构建后的 SPA 在 16 个
   状态（落地页明/暗、聊天、设置、库、项目、计划、插件、图片、助手、站点、
   个人资料、考试、手机落地、手机聊天、⌘K）下，对每条非动态伪类的冻结规则执行
   `document.querySelector(selector)`，并按其 `@media` / `@supports` 条件过滤。

## 结果

| 项目 | 数量 |
|---|---:|
| 冻结 CSS 规则总数 | 1,676 |
| 参与运行时探测（排除 `:hover`/`:focus`/`::before` 等） | 1,407 |
| 探测中至少匹配一次 | 511 |
| 探测中从未匹配 | 896 |
| 本轮删除：未引用的 `@keyframes` | 18 |
| 本轮删除：完全被后续规则覆盖 | 14 |
| 本轮删除：class 只由测试引用 | 3 |
| 本轮删除：无效 `var()` 声明 | 5 |

删除后冻结树从 12,885 行降到 12,599 行（`legacy/` + `restore/`，含注释）。
`check-css-debt` 基线同步收缩：`important` 296→295、`literalRadius` 124→123、
`legacyChannel` 513→506。

## 为什么没有删那 896 条

`querySelector` 未匹配只说明「这 16 个状态没有渲染它」，不说明产品永远不会
渲染。未覆盖的状态至少包括：

- 真实流式回合中的工具行、思考面板、活动抽屉；
- 分享页与历史还原（`share-view` 的 legacy tool card 路径）；
- `:hover` / `:focus-visible` / `:active` / `::before` 等动态或伪元素规则；
- 错误横幅、空态、超长列表、拖拽与重命名态。

因此这 896 条保留，留待按状态补齐覆盖后逐文件删除。删除它们需要的是更强的
证据（逐状态覆盖率或视觉基线），不是更大的正则。

## 验证

- `node frontend/scripts/check-frozen-liveness.mjs`：0 dead rules / 25 files
- `node frontend/scripts/check-css-debt.mjs`：基线收缩后通过
- `npm run lint`、`npm run typecheck`：通过
- 视觉层：`chat-light-palette`、`mobile-reference-alignment` 通过；手机
  composer 实测 86px、控制轨 36px，与参考一致。`shadcn-theme` /
  `sidebar-light-theme` / `theme-contrast` 仍有失败，集中在侧栏会话行与设置页
  的断言；这些断言在本次 CSS 删除前就已失败（同一批规则未涉及这两个表面），
  按独立测试债跟踪，不计入本次清理。
