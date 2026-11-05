# SPA 优先的 RN 收敛方案

更新：2026-11-05。状态：已定方向，待选首个表面。
轮次现状见 [UI 结构与迁移边界 · RN 轮次现状](../architecture/ui-structure.md)。

## 1. 定位

改造对象是 **SPA**（`frontend/`，线上生产界面）。`packages/ui` 是新 UI 的唯一产地，
SPA 通过 react-native-web 挂载；Universal App 是后续复用方，不是驱动方。

这条定位决定了两件事：

- 收敛的目标不是"让 Universal App 也用上子模块"，而是"SPA 每轮能继续用共享 RN 组件换掉一块旧 UI"。
- 根入口（barrel）只服务 Universal，冻结即可，不为整洁去搬迁。

## 2. 现状

- SPA：36 个文件、42 处 `@socrates/ui/*` 子路径引用，0 处根入口。
- Universal：33 个文件全部走根入口，0 处子路径（Metro 无 `exports` 映射，子路径解析不到）。
- 根入口 `packages/ui/src/index.tsx`（1417 行）自带 `Sidebar`、`ChatMessageList`、`Composer`
  与内嵌面板，是 RN-7 之前的实现，视觉上落后 SPA 一个版本。
- SPA 的 transcript 正文来自服务端 HTML（`frontend/src/react/message-list/MessageBody.tsx:85`
  直接注入 `message.html`），不是客户端 markdown 解析。

## 3. 决定

| 编号 | 决定 | 理由 |
|---|---|---|
| D1 | 根入口冻结：不新增导出、不做视觉改动、不搬迁 | 它只服务 Universal，投入不产生 SPA 收益 |
| D2 | SPA 只 import 窄子路径，禁止根入口；用 lint 固化 | 一次根入口 import 会把 `ChatMessageList`、`ExamView` 等整包拉进首屏 |
| D3 | 新 UI 一律先落 `packages/ui` 子模块，再由 SPA 经 RN Web 挂载 | 保持"一处实现、两端复用"的既有方向 |
| D4 | 搬迁由 SPA 需求触发：某模块 SPA 也要用时，才从 barrel 搬进子模块 | 不为整洁做纯搬运 |
| D5 | 每次只换一个表面；旧 DOM 实现保留到新实现签收后再删 | 可回滚，diff 可读 |
| D6 | transcript **正文**不做 RN 迁移，只迁外壳与工具栏 | 服务端 HTML 是渲染基准，改成客户端 markdown 属于产品级改动，不在本轮 |
| D7 | Universal 追平放到最后，按同一批子模块走 | 避免为未签收的平台反复改共享件 |

## 4. SPA 剩余表面

| 表面 | 现状 | 体量 | 迁移方式 |
|---|---|---|---|
| 设置面板 | DOM（shadcn 语义） | `react/settings` 约 1300 行 | 结构化数据，可直接换 RN 控件 |
| 考试 | **已迁移（2026-11-05）**：`packages/ui/src/exam` + SPA 适配层 `react/exam/ExamView.tsx` | `react/exam` 约 1090 行 → 共享 8 个组件文件 + 适配层 217 行 | 旧 6 个 DOM 组件已删除；e2e 断言改为语义 `data-*` |
| 资料库 / 项目 / 文件 | DOM | 待统计 | 列表 + 空态，先换列表行 |
| 搜索 / Cmd-K | DOM + 独立 store | 待统计 | 输入框与结果行 |
| 消息列表 | DOM，正文是服务端 HTML | `react/message-list` 约 1070 行 | 只换工具栏、操作行与外壳；正文保留 HTML |
| 富文本输入 | TipTap | `react/composer-input` 约 815 行 | 不迁编辑器，只换周边（外壳与控件栏已完成） |
| 画布 / 白板 | tldraw | — | 原生岛，不迁 |

## 5. 首个目标（已完成）

首个目标**考试**已于 2026-11-05 完成，落在 `packages/ui/src/exam/`：

- 数据是结构化的（题目、选项、作答、评分），不依赖服务端 HTML，和 D6 的边界不冲突。
- 没有扩写 barrel 的 `ExamView`：那会改到 Universal 唯一的取值路径。改为新建子模块，
  SPA 走 `@socrates/ui/exam`，Universal 等它自己迁到子路径后再复用（D3 的"新 UI 先进包"）。
- 体量自包含，1090 行集中在一个目录，回归面清晰。

下一个建议目标是**设置面板**：更贴近用户日常，但要先把 `FoundationDialog` / shadcn 控件与
RN 控件的关系定下来，前期是设计系统决策，不是纯迁移。

## 6. 每轮的执行与验收

1. 在 `packages/ui/<域>/` 写 RN 组件，DOM-free，经 `check-packages-dom`。
2. SPA 在 `frontend/src/react/<域>/` 保留适配层：读 store、传回调、挂 `WebUiTheme`。
3. 旧 DOM 实现保留到新组件通过以下验证后再删：
   - `cd frontend && npm run lint && npm run build`
   - 相关 Playwright（exam 用 `e2e/exam-*`，设置用 `e2e/settings-*`）
   - 桌面 + 手机两种视口截图各一张
4. 更新 `ui-structure.md` 的接入面统计与该表面的迁移状态。

## 7. 护栏

- `frontend/scripts/check-ui-entry.mjs`：`frontend/src` 出现根入口 import 即失败，接入 `lint` 与 `lint:ui-entry`，基线为空。
- 现有 `check-packages-dom` 继续保证共享包 DOM-free。
- 首屏包体预算不变；每轮迁移后 `npm run build` 复核 `check-bundle-size`。

## 8. 考试迁移的已知差异（2026-11-05）

- **模型选择器**：旧版是 shadcn Popover（外部点击关闭），共享版是内联 listbox，只能再点一次触发器
  或选中选项关闭，Escape 无效。RN 侧拿不到 DOM 的 outside-click，要恢复得由宿主收回弹层
  （与 composer 的 `expanded` 契约一致），留到设置面板迁移时一起定。
- **视觉**：题目从"分隔线列表"改成卡片，选项字母去掉方框，判分徽标换成 `VerdictGlyph`。
  这些是 shadcn 方向的收敛，不是像素还原；主壳几何（`.exam-view-body` 的 padding 与 720 列宽）保持不变。
