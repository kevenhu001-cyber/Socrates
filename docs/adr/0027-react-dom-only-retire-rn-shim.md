# ADR 0027 — React DOM 是唯一 UI 栈，退役 React Native 兼容层

- 状态：Accepted
- 日期：2026-11-22
- 决策者：项目所有者
- 关联：`packages/ui/src/react-web.tsx`、`docs/plans/2026-11-05-spa-rn-convergence.md`、ADR 0025

## 背景

2026-11-16 的 ADR 0025 让 SPA 成为唯一生产客户端，并把“原地 RN 化”定为方向：
`packages/ui` 以 React Native 组件的形式编写，通过 `react-native-web` 挂进 SPA。
2026-11-21 的 `a7c97bee` 移除了 React Native 运行时，但没有移除这套编写模型：
`packages/ui/src/react-web.tsx` 变成了一个本地 shim，继续提供 `View` / `Text` /
`Pressable` / `StyleSheet` / `dataSet` / `onPress` 这套 RN API，内部再渲染 DOM。

结果是两套模型叠在一起：

- shim 之外是普通 React + DOM + CSS；
- shim 之内是 RN 形状的 props 和 style key（`paddingHorizontal`、`dataSet`、
  `numberOfLines`），其中一部分根本没有被翻译成 CSS；
- 文档（`AGENTS.md`、`docs/plans/2026-11-05-spa-rn-convergence.md`）仍在要求
  “新 UI 按 RN 组件编写”，会把后来的人继续拉回 RN。

用户 2026-11-22 明确：**React Native 不需要，技术栈不要混在一起**。

## 决策

1. **React DOM 是唯一 UI 栈。** `packages/ui` 的组件是普通 React DOM 组件，
   不是 React Native 组件；布局用 CSS（class 或 CSS 属性），不用 RN style key。
2. **`packages/ui/src/react-web.tsx` 冻结。** 不再新增 importer，不再为它补 RN
   语义；直接 importer 的文件数由 `check-rn-shim.mjs` 以 shrink-only baseline
   守住，只允许下降（当前值见 `frontend/scripts/rn-shim.baseline.json`）。
3. **逐面迁移。** 每次选一个组件面（先 `primitives/UiText`、`settings`，再
   `composer`、`turn`、`shell`、`learn`、`study`、`exam`），把它改成 DOM 元素与
   CSS，删掉对 shim 的 import；迁移到 0 时删除 shim 与 `dataSet` 这类 RN 词汇。
4. **文档同步。** `AGENTS.md`、`docs/architecture/ui-structure.md` 不再把 RN 写成
   目标；ADR 0025 的 RN 部分以本 ADR 为准。

## 备选方案

- **保留 shim，只把它做得更像 RN** —— 正是本 ADR 要结束的状态；每补一个 RN 语义
  （`dataSet`、View 的 flex 默认）都在加深耦合。
- **一次性重写 `packages/ui`** —— 10k+ 行、数十个文件，视觉风险不可控；按面迁移
  可以用现有视觉 spec 逐批验收。
- **把 `packages/ui` 合并回 `frontend/`** —— 会破坏 `@socrates/core` 与 Android
  客户端的共享边界，且不解决 RN 形状 API 本身。

## 影响

- **正向**：只有一套 UI 模型；DOM/CSS 的调试、可访问性与样式归属不再经过 shim
  翻译；`packages/ui` 的 DOM-free 约束仍然成立（不读 `document`/`window`，只渲染
  React 元素）。
- **成本**：迁移期间 shim 与 DOM 组件并存；`check-rn-shim.mjs` 只保证不增长。
- **不改**：`apps/socrates-android`（Kotlin + Compose，依赖 `@socrates/core`）与
  服务端不受影响。

## 可逆性

回滚成本中等偏高：已迁移的组件若要回到 shim，需要恢复 import 与 RN props。因此每个
迁移 PR 单独可回滚，且以视觉 spec 为验收。删除 shim 本身是最后一步，之前不可逆的
只有单个组件的改法。
